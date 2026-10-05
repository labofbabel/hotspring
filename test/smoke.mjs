// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Headless smoke test for the byte-conversion path (no canvas needed).
// Feeds main.js a stub Renderable with a known raster and checks the envelope,
// spacing feeds, the no-auto-cut behavior, and explicit cuts.

import { Document } from '../src/main.js';
import { Renderable } from '../src/renderable.js';
import { reduceToMono } from '../src/imaging.js';
import { encodeQr } from '../src/qr.js';
import { parseCsv } from '../src/blocks/table.js';
import { registerFont } from '../src/fonts.js';
import { resolveFont } from '../src/textlayout.js';
import { parseTemplateCode, TEMPLATE_IMAGE_SOURCE } from '../src/template-code.js';

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// --- Copy/paste template format (literal parsing; pasted code is never run) --
{
  const template = new Document({ width: 512, spacing: 8, cutFeed: 96 })
    .text('A "quoted" line\nand another', { font: 'Pixel Operator', size: 16 })
    .hr({ thickness: 2 })
    .spacer(12)
    .qr('https://example.com', { moduleSize: 4 })
    .cut();
  const parsed = parseTemplateCode(template.toCode());
  ok(parsed.options.width === 512 && parsed.options.spacing === 8 && parsed.options.cutFeed === 96,
    'template paste restores document options');
  ok(parsed.components.map(({ method }) => method).join(',') === 'text,hr,spacer,qr,cut',
    'template paste restores component order');
  ok(parsed.components[0].args[0] === 'A "quoted" line\nand another',
    'template paste restores escaped text exactly');

  const imageCode = new Document({ width: 384 }).image({}, { scale: 'fit' }).toCode();
  ok(parseTemplateCode(imageCode).components[0].args[0] === TEMPLATE_IMAGE_SOURCE,
    'template paste recognizes image source placeholders');

  try {
    parseTemplateCode('const doc = new Document({ width: getWidth() }); doc.cut();');
    ok(false, 'template paste rejects executable expressions');
  } catch {
    ok(true, 'template paste rejects executable expressions');
  }
}

// --- Font registry (headless: metrics only, no DOM needed) -------------------
{
  await registerFont('TestPixel', { grid: 8 });
  ok(resolveFont('TestPixel', 13).px === 16, 'grid font snaps 13px -> 16px');
  ok(resolveFont('TestPixel', 20).px === 24, 'grid font snaps 20px -> 24px');
  ok(resolveFont('Unregistered', 13).px === 13, 'non-grid font keeps its size');
  ok(resolveFont('Two Words', 16).fontStr.includes('"Two Words"'), 'family names are quoted');
}

// --- CSV parser --------------------------------------------------------------
{
  const rows = parseCsv('Item,Qty,Price\nWidget,2,"$3,50"\n"a ""quote""",1,x\n');
  ok(rows.length === 3, `CSV parses 3 rows (got ${rows.length})`);
  ok(rows[1][2] === '$3,50', 'quoted comma kept inside field');
  ok(rows[2][0] === 'a "quote"', 'escaped double-quote unescaped');
}

// --- QR encoder (headless): structural correctness ---------------------------
{
  const qr = encodeQr('https://example.com/exhibit/42', 'M');
  ok(qr.size === qr.version * 4 + 17, `QR size ${qr.size} matches version ${qr.version} formula`);
  // Finder pattern: top-left 7x7 should have a dark border ring.
  const m = qr.modules;
  const finderOK = m[0][0] && m[0][6] && m[6][0] && m[6][6] && !m[1][1] && m[2][2];
  ok(finderOK, 'top-left finder pattern is well-formed');
  // Numeric input picks a small version.
  ok(encodeQr('12345', 'L').size >= 21, 'numeric input encodes');
  // Longer data grows the version.
  ok(encodeQr('x'.repeat(300), 'L').version > encodeQr('x', 'L').version, 'version grows with data');
}

// --- Imaging pipeline (headless, no canvas): every algo yields pure 1-bit ----
for (const algo of ['atkinson', 'floyd', 'ordered', 'none']) {
  const w = 64, h = 16;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.round((x / (w - 1)) * 255); // horizontal gradient
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  reduceToMono({ data, width: w, height: h }, { algo, gamma: 1.3, sharpen: 0.5 });
  const vals = new Set();
  for (let i = 0; i < data.length; i += 4) vals.add(data[i]);
  ok([...vals].every((v) => v === 0 || v === 255), `${algo}: output is pure 1-bit`);
}

// A stub block: 16 dots wide (2 bytes/row), 3 rows, all black — no canvas used.
class StubBlock extends Renderable {
  toRaster() {
    return { bytes: new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), widthBytes: 2, height: 3 };
  }
}

const doc = new Document({ width: 384 });
doc.add(new StubBlock());
const hex = Buffer.from(doc.toBytes()).toString('hex');

ok(hex.startsWith('100502' + '00'.repeat(32) + '1b40'), 'starts with clear-buffer + 32 NUL primer + init');
// Warmup: after init, ESC a 0 (align left) then a run of spaces (0x20) then LF,
// before any raster — the native-text lead-in that prevents the desync.
ok(/^100502(00){32}1b401b6100(20)+0a/.test(hex), 'native-text warmup line follows init, before content');
ok(hex.includes('1d7630000200' + '0300'), 'contains GS v 0 header (2 bytes wide, 3 rows)');
ok(hex.includes('ffffffffffff'), 'contains the raster payload');
ok(!hex.includes('1d5600'), 'no automatic cut when no CutBlock is present');

// Cut only where placed, and cutFeed (dots) precedes the cut.
const cutHex = Buffer.from(new Document({ width: 384, cutFeed: 120 }).add(new StubBlock()).cut().toBytes()).toString('hex');
ok((cutHex.match(/1d5600/g) || []).length === 1, 'exactly one cut, from the CutBlock');
ok(cutHex.includes('1b4a78' + '1d5600'), 'cutFeed feeds 120 dots (ESC J 120) right before the cut');

// Global spacing turns into pixel feeds (ESC J) around each component.
const spaced = new Document({ width: 384, spacing: 10 });
spaced.add(new StubBlock());
const spacedHex = Buffer.from(spaced.toBytes()).toString('hex');
ok(spacedHex.includes('1b4a0a'), 'spacing emits ESC J 10 (feed 10 dots) around the component');

ok(new Document({ width: 576 }).width === 576, 'accepts 576-dot width');
try { new Document({ width: 100 }); ok(false, 'rejects non-multiple-of-8 width'); }
catch { ok(true, 'rejects non-multiple-of-8 width'); }

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
