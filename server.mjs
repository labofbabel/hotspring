// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Hotspring local demo + print bridge. This server intentionally binds only to
// loopback: it accepts raw printer commands and must not be exposed to a LAN.

import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CupsTransport } from './src/transports/cups.js';

const root = fileURLToPath(new URL('.', import.meta.url));
// Static files are served only from these directories (plus /index.html).
const STATIC_DIRS = ['src', 'dist'];
const staticRoots = new Map();
for (const dir of STATIC_DIRS) {
  const dirRoot = resolve(root, dir);
  try { staticRoots.set(dir, { root: dirRoot, canonical: await realpath(dirRoot) }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!staticRoots.has('dist')) console.warn('dist/ not found: run `npm run build` before using the workbench');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4000);
const MAX_PRINT_BYTES = 8 * 1024 * 1024;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new RangeError('PORT must be an integer from 1 to 65535');
}

const printer = new CupsTransport();
let printerMutationActive = false;
let recentJob = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.map': 'application/json',
};

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(res, status, obj, { head = false } = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(head ? undefined : body);
}

function contentType(req) {
  return String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
}

function isLocalRequest(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const allowedHosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
  if (!allowedHosts.has(host)) return false;

  const origin = req.headers.origin;
  if (!origin) return true; // curl and other non-browser local clients
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function readPrintBytes(req) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_PRINT_BYTES) {
    throw httpError(413, `Print job exceeds the ${MAX_PRINT_BYTES}-byte limit`);
  }

  return new Promise((resolveBytes, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > MAX_PRINT_BYTES) {
        settled = true;
        reject(httpError(413, `Print job exceeds the ${MAX_PRINT_BYTES}-byte limit`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!settled) resolveBytes(Buffer.concat(chunks, total));
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
    req.on('aborted', () => {
      if (!settled) reject(httpError(400, 'Print upload was aborted'));
    });
  });
}

async function staticFile(req) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname);
  } catch {
    throw httpError(400, 'Malformed URL');
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname.includes('\0') || pathname.includes('\\')) throw httpError(400, 'Invalid path');

  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((part) => part === '..' || part.startsWith('.'))) throw httpError(404, 'Not found');
  if (pathname === '/index.html') return resolve(root, 'index.html');
  const allowed = staticRoots.get(segments[0]);
  if (!allowed) throw httpError(404, 'Not found');

  const file = resolve(root, `.${pathname}`);
  if (file === allowed.root || !file.startsWith(allowed.root + sep)) throw httpError(404, 'Not found');
  let canonicalFile;
  try { canonicalFile = await realpath(file); }
  catch (error) {
    if (error.code === 'ENOENT') throw httpError(404, 'Not found');
    throw error;
  }
  if (!canonicalFile.startsWith(allowed.canonical + sep)) throw httpError(404, 'Not found');
  return canonicalFile;
}

function statusWithRecentJob(status) {
  if (!recentJob) return { apiVersion: 2, ...status, recentJob: null };
  if (!['canceled', 'canceled-by-reset'].includes(recentJob.state)) {
    const pending = status.jobs.find((job) => job.id === recentJob.id);
    if (pending) {
      recentJob.state = status.connected === false ? 'waiting-for-printer'
        : status.mode === 'printing' ? 'printing' : 'queued';
    } else if (Date.now() - recentJob.acceptedAtMs >= 2_000) {
      // CUPS no longer lists the job, but that does not prove physical delivery.
      recentJob.state = 'left-queue';
    }
  }
  const { acceptedAtMs, ...publicJob } = recentJob;
  return { apiVersion: 2, ...status, recentJob: publicJob };
}

const server = http.createServer(async (req, res) => {
  try {
    const isHead = req.method === 'HEAD';
    if (!isLocalRequest(req)) throw httpError(403, 'Local same-origin requests only');

    if (req.method === 'OPTIONS') throw httpError(403, 'Cross-origin requests are not allowed');

    if (req.url === '/print') {
      if (req.method !== 'POST') throw httpError(405, 'POST required');
      if (contentType(req) !== 'application/octet-stream') throw httpError(415, 'Expected application/octet-stream');
      if (printerMutationActive) throw httpError(409, 'Another printer operation is active');
      printerMutationActive = true;
      try {
        const bytes = await readPrintBytes(req);
        if (!bytes.length) throw httpError(400, 'Empty print job');
        const submission = await printer.write(bytes);
        recentJob = {
          id: submission.jobId,
          acceptedAt: new Date().toISOString(),
          acceptedAtMs: Date.now(),
          state: 'accepted',
        };
        const status = statusWithRecentJob(await printer.status());
        return json(res, 200, { ok: true, bytes: bytes.length, submission, status });
      } finally {
        printerMutationActive = false;
      }
    }

    if (req.url === '/reset') {
      if (req.method !== 'POST') throw httpError(405, 'POST required');
      if (contentType(req) !== 'application/json') throw httpError(415, 'Expected application/json');
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > 1024) throw httpError(413, 'Reset body is too large');
      if (printerMutationActive) throw httpError(409, 'Another printer operation is active');
      req.resume();
      printerMutationActive = true;
      try {
        await printer.reset();
        if (recentJob) recentJob.state = 'canceled-by-reset';
        return json(res, 200, { ok: true, status: statusWithRecentJob(await printer.status()) });
      } finally {
        printerMutationActive = false;
      }
    }

    if (req.url === '/cancel') {
      if (req.method !== 'POST') throw httpError(405, 'POST required');
      if (contentType(req) !== 'application/json') throw httpError(415, 'Expected application/json');
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > 1024) throw httpError(413, 'Cancel body is too large');
      if (!recentJob?.id) throw httpError(404, 'No recent job is available to cancel');
      if (printerMutationActive) throw httpError(409, 'Another printer operation is active');
      req.resume();
      printerMutationActive = true;
      try {
        await printer.cancel(recentJob.id);
        recentJob.state = 'canceled';
        return json(res, 200, { ok: true, jobId: recentJob.id, status: statusWithRecentJob(await printer.status()) });
      } finally {
        printerMutationActive = false;
      }
    }

    if (req.url === '/status') {
      if (req.method !== 'GET' && !isHead) throw httpError(405, 'GET required');
      return json(res, 200, { ok: true, ...statusWithRecentJob(await printer.status()) }, { head: isHead });
    }

    if (req.method !== 'GET' && !isHead) throw httpError(405, 'GET required');
    const file = await staticFile(req);
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(isHead ? undefined : body);
  } catch (error) {
    const status = error?.code === 'ENOENT' ? 404 : error?.status || 500;
    if (status === 500) console.error(error);
    json(res, status, { ok: false, error: status === 404 ? 'Not found' : error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  hotspring server → http://localhost:${PORT}  (local CUPS bridge)\n`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
