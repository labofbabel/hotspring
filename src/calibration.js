// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Calibration sheet — a one-print diagnostic that helps tune a printer:
//   • a dot/mm ruler (validates width + pitch),
//   • gradient ramps through every dither algorithm (compare + see dot-gain),
//   • a gamma ramp (pick a value to counter dot-gain),
//   • font + encoding samples at several sizes.
//
// buildCalibration(doc) appends everything to a Document you provide (so it uses
// that document's width). It reuses the library's own components + imaging.

import { createCanvas } from './canvas.js';
import { reduceToMono } from './imaging.js';

// A dot-ruler: ticks every 1mm (8 dots), taller at 5mm, tallest + cm label at 10mm.
function rulerCanvas(width) {
  const h = 46, baseY = 24;
  const cv = createCanvas(width, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, baseY, width, 1); // baseline
  ctx.font = '14px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let x = 0; x <= width; x += 8) {
    const th = x % 80 === 0 ? 18 : x % 40 === 0 ? 11 : 5;
    ctx.fillRect(Math.min(x, width - 1), baseY - th, 1, th);
    if (x % 80 === 0) ctx.fillText(`${x / 80}cm`, Math.min(x + 2, width - 30), baseY + 3);
  }
  return cv;
}

// A labeled 0%→100% gradient strip, dithered with the given algo/gamma.
function bandCanvas(width, label, algo, gamma = 1) {
  const labelH = 20, bandH = 40, h = labelH + bandH;
  const cv = createCanvas(width, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, h);
  ctx.fillStyle = '#000';
  ctx.font = '14px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(label, 2, 2);
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(1, '#000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, labelH, width, bandH);
  const img = ctx.getImageData(0, labelH, width, bandH);
  reduceToMono(img, { algo, gamma });
  ctx.putImageData(img, 0, labelH);
  return cv;
}

/** Append the calibration sheet to `doc`. Returns the same doc. */
export function buildCalibration(doc, { cut = true } = {}) {
  const width = doc.width;
  const rule = () => doc.hr({ thickness: 2, dashOn: 4, dashOff: 4 });
  const crisp = { scale: 100, algo: 'none' }; // already 1-bit line art at actual size

  doc.text('HOTSPRING CALIBRATION', { font: 'Pixel Operator', size: 24, align: 'center' });
  doc.text(`${width} dots · ${(width / 8).toFixed(1)} mm · 203 dpi`, { font: 'monospace', size: 16, align: 'center' });
  doc.hr({ thickness: 3 });

  doc.text('RULER  (ticks 1mm)', { font: 'monospace', size: 16 });
  doc.image(rulerCanvas(width), crisp);
  rule();

  doc.text('DITHER  0% -> 100%', { font: 'monospace', size: 16 });
  for (const algo of ['atkinson', 'floyd', 'ordered', 'none']) {
    doc.image(bandCanvas(width, algo, algo), crisp);
  }
  rule();

  doc.text('GAMMA  (atkinson)', { font: 'monospace', size: 16 });
  for (const g of [1, 1.5, 2.2]) {
    doc.image(bandCanvas(width, `gamma ${g.toFixed(1)}`, 'atkinson', g), crisp);
  }
  rule();

  doc.text('FONTS', { font: 'monospace', size: 16 });
  doc.text('pixel 16  AaBb 0123 !?#', { font: 'Pixel Operator', size: 16 });
  doc.text('pixel 24  AaBb 0123', { font: 'Pixel Operator', size: 24 });
  doc.text('mono 16  AaBb 0123 !?#', { font: 'monospace', size: 16 });
  doc.text('mono 24  AaBb 0123', { font: 'monospace', size: 24 });
  doc.text('sans 20  AaBb 0123', { font: 'sans-serif', size: 20 });
  rule();

  doc.text('ENCODINGS', { font: 'monospace', size: 16 });
  doc.text('ASCII  !@#$%^&*()_+-=[]{}', { font: 'monospace', size: 16 });
  doc.text('accents  ünîcödé àéîõü çñ', { font: 'monospace', size: 16 });
  doc.text('symbols  ★ ♥ ✓ € £ ¥ § ¶ — ×', { font: 'sans-serif', size: 18 });
  doc.text('עברית  שלום עולם', { font: 'sans-serif', size: 20, align: 'right' });
  doc.hr({ thickness: 3 });

  if (cut) doc.cut();
  return doc;
}
