// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// CupsTransport — the Node-side "thin bridge to USB" via macOS/Linux CUPS.
// Node-only (imports node:child_process); keep it out of the browser bundle.
// A future Electron-main or WebUSB transport can implement the same interface:
//   write(bytes) · cancel(jobId) · reset() · status() · ensureReady()

import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

const DEFAULT_PRINTER = process.env.PRINTER || 'PrinterCMD_ESCPO_POS80_Printer_USB';

function run(cmd, args, input) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let out = '', err = '';
    let forceTimer;
    const timer = setTimeout(() => {
      err = `${cmd} timed out after 10 seconds`;
      p.kill('SIGTERM');
      forceTimer = setTimeout(() => p.kill('SIGKILL'), 1_000);
    }, 10_000);
    p.stdout?.on('data', (d) => (out += d));
    p.stderr?.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    p.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      resolve({ code, out: out.trim(), err: err.trim() });
    });
    p.stdin?.on('error', () => {}); // the process result carries spawn/pipe failures
    if (input) { p.stdin.write(Buffer.from(input)); p.stdin.end(); }
  });
}

function failure(command, result) {
  return new Error(result.err || result.out || `${command} exited ${result.code}`);
}

function requireSuccess(command, result) {
  if (result.code !== 0) throw failure(command, result);
  return result;
}

function parseDeviceUri(output, printer) {
  const prefix = `device for ${printer}: `;
  const line = output.split('\n').find((value) => value.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
}

function usbIdentity(uri) {
  if (!uri?.startsWith('usb://')) return null;
  try {
    const url = new URL(uri);
    return {
      manufacturer: decodeURIComponent(url.hostname),
      product: decodeURIComponent(url.pathname.replace(/^\//, '')),
      serial: url.searchParams.get('serial'),
    };
  } catch {
    return null;
  }
}

async function probeDarwinUsb(identity) {
  const result = await run('/usr/sbin/ioreg', ['-p', 'IOUSB', '-c', 'IOUSBHostDevice', '-l', '-w', '0']);
  if (result.code !== 0) return null;
  if (identity.serial) return result.out.includes(identity.serial);
  const haystack = result.out.toLowerCase();
  return haystack.includes(identity.product.toLowerCase()) && haystack.includes(identity.manufacturer.toLowerCase());
}

async function probeLinuxUsb(identity) {
  let entries;
  try { entries = await readdir('/sys/bus/usb/devices'); }
  catch { return null; }
  for (const entry of entries) {
    const base = `/sys/bus/usb/devices/${entry}`;
    const read = async (name) => {
      try { return (await readFile(`${base}/${name}`, 'utf8')).trim(); }
      catch { return ''; }
    };
    const [manufacturer, product, serial] = await Promise.all([read('manufacturer'), read('product'), read('serial')]);
    if (identity.serial && serial === identity.serial) return true;
    if (!identity.serial && product.toLowerCase().includes(identity.product.toLowerCase())
      && manufacturer.toLowerCase().includes(identity.manufacturer.toLowerCase())) return true;
  }
  return false;
}

async function probeUsb(uri) {
  const identity = usbIdentity(uri);
  if (!identity) return null;
  if (process.platform === 'darwin') return probeDarwinUsb(identity);
  if (process.platform === 'linux') return probeLinuxUsb(identity);
  return null;
}

function parseJobs(output) {
  return output.split('\n').filter(Boolean).map((line) => {
    const [id, owner, size] = line.trim().split(/\s+/, 4);
    return { id, owner, size: Number(size) || 0 };
  });
}

export class CupsTransport {
  constructor({ printer = DEFAULT_PRINTER } = {}) {
    if (typeof printer !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(printer)) {
      throw new TypeError('printer must be a valid CUPS queue name');
    }
    this.printer = printer;
  }

  /** Make sure a prior error didn't leave the queue disabled. Idempotent. */
  async ensureReady() {
    const [enabled, accepted] = await Promise.all([
      run('/usr/sbin/cupsenable', [this.printer]),
      run('/usr/sbin/cupsaccept', [this.printer]),
    ]);
    requireSuccess('cupsenable', enabled);
    requireSuccess('cupsaccept', accepted);
  }

  /** Send raw ESC/POS bytes to the printer. */
  async write(bytes) {
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new TypeError('bytes must be a non-empty Uint8Array');
    const before = await this.status();
    if (!before.configured) throw new Error(before.error || `CUPS queue ${this.printer} is not configured`);
    if (before.connected === false) throw new Error(`Printer ${this.printer} is not connected`);
    if (before.offline) throw new Error(`Printer ${this.printer} is offline`);
    await this.ensureReady();
    const r = await run('lp', ['-d', this.printer, '-o', 'raw'], bytes);
    requireSuccess('lp', r);
    const jobId = r.out.match(/request id is (\S+)/i)?.[1] || null;
    return { accepted: true, jobId, message: r.out };
  }

  /** Cancel one known job without disturbing the rest of the queue. */
  async cancel(jobId) {
    const prefix = `${this.printer}-`;
    if (typeof jobId !== 'string' || !jobId.startsWith(prefix) || !/^\d+$/.test(jobId.slice(prefix.length))) {
      throw new TypeError(`jobId must belong to ${this.printer}`);
    }
    requireSuccess('cancel', await run('cancel', [jobId]));
  }

  /** Recover a wedged queue without power-cycling. */
  async reset() {
    requireSuccess('cancel', await run('cancel', ['-a', this.printer]));
    await this.ensureReady();
  }

  /** Queue state plus a best-effort physical-presence check for USB devices. */
  async status() {
    const [s, o, v] = await Promise.all([
      run('lpstat', ['-p', this.printer, '-l']),
      run('lpstat', ['-W', 'not-completed', '-o', this.printer]),
      run('lpstat', ['-v', this.printer]),
    ]);
    if (s.code !== 0) {
      return {
        printer: this.printer,
        configured: false,
        connected: null,
        mode: 'unavailable',
        offline: false,
        deviceUri: null,
        jobs: [],
        pending: 0,
        error: s.err || s.out || `lpstat exited ${s.code}`,
      };
    }
    const deviceUri = v.code === 0 ? parseDeviceUri(v.out, this.printer) : null;
    const connected = await probeUsb(deviceUri);
    const line = (s.out.split('\n')[0] || '');
    let mode = 'unknown';
    if (/idle/i.test(line)) mode = 'idle';
    else if (/printing/i.test(line)) mode = 'printing';
    else if (/disabled/i.test(line)) mode = 'disabled';
    const jobs = o.code === 0 ? parseJobs(o.out) : [];
    const cupsOffline = /offline/i.test(s.out);
    const offline = connected === false || (connected === null && cupsOffline);
    const errors = [
      ...(o.code === 0 ? [] : [o.err || o.out || `lpstat exited ${o.code}`]),
      ...(v.code === 0 ? [] : [v.err || v.out || `lpstat exited ${v.code}`]),
    ].filter(Boolean);
    return {
      printer: this.printer,
      configured: true,
      connected,
      mode,
      offline,
      cupsOffline,
      deviceUri,
      jobs,
      pending: jobs.length,
      ...(errors.length ? { error: errors.join('; ') } : {}),
    };
  }
}
