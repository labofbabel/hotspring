// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Checks the vendorable bundles in dist/ (run `npm run build` first): both
// formats expose the same API as src/index.js, carry the license banner, contain
// no Node-only code, embed Pixel Operator intact, and produce byte-identical
// ESC/POS output to the unbundled source.

import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as src from '../src/index.js';

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

const iifeCode = await readFile(new URL('../dist/hotspring.min.js', import.meta.url), 'utf8');
const esmCode = await readFile(new URL('../dist/hotspring.esm.min.js', import.meta.url), 'utf8');

// Classic-script load in a bare context, as a <script> tag would.
const sandbox = { atob, TextEncoder, console };
vm.runInNewContext(iifeCode, sandbox);
const bundles = {
  iife: sandbox.Hotspring,
  esm: await import('../dist/hotspring.esm.min.js'),
};

const srcKeys = Object.keys(src).sort().join(',');
const ttf = await readFile(new URL('../src/fonts/Pixel Operator Font/PixelOperator8.ttf', import.meta.url));

for (const [code, label] of [[iifeCode, 'iife'], [esmCode, 'esm']]) {
  ok(code.startsWith('/*! hotspring v') && code.includes('MPL-2.0') && code.includes('Nayuki'),
    `${label}: license banner present`);
  ok(!/\bnode:|require\(|process\.env/.test(code), `${label}: no Node-only code`);
}

for (const [label, H] of Object.entries(bundles)) {
  ok(H && Object.keys(H).sort().join(',') === srcKeys, `${label}: exports match src/index.js`);

  const classes = Object.entries(H).filter(([, v]) => typeof v === 'function' && /^class\b/.test(String(v)));
  ok(classes.length >= 10 && classes.every(([k, v]) => v.name === k),
    `${label}: class names survive minification (toCode and constructor.name rely on them)`);

  const bytes = H.bundledFontData('Pixel Operator');
  ok(Buffer.from(bytes).equals(ttf), `${label}: embedded Pixel Operator matches the TTF on disk`);
  const names = await H.registerBundledFonts(); // headless: metrics only
  ok(names.join() === 'Pixel Operator,Pixel Operator Mono' && H.fontInfo('Pixel Operator').grid === 8,
    `${label}: registerBundledFonts records grid metrics`);

  const qr = H.encodeQr('https://example.com', 'M');
  ok(JSON.stringify(qr) === JSON.stringify(src.encodeQr('https://example.com', 'M')), `${label}: QR matches src`);

  class Stub extends H.Renderable {
    toRaster() { return { bytes: new Uint8Array(6).fill(0xff), widthBytes: 2, height: 3 }; }
  }
  class SrcStub extends src.Renderable {
    toRaster() { return { bytes: new Uint8Array(6).fill(0xff), widthBytes: 2, height: 3 }; }
  }
  const out = new H.Document({ width: 384, spacing: 8, cutFeed: 96 }).add(new Stub()).cut().toBytes();
  const ref = new src.Document({ width: 384, spacing: 8, cutFeed: 96 }).add(new SrcStub()).cut().toBytes();
  ok(Buffer.from(out).equals(Buffer.from(ref)), `${label}: ESC/POS bytes identical to src`);

  ok(new H.Document({ width: 576 }).calibration().toCode().includes('.calibration()'),
    `${label}: calibration block wires up without a circular import`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exitCode = failed ? 1 : 0;
