// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Pure ESC/POS byte helpers. No DOM, no Node — safe to import anywhere.
// Both main.js (the envelope) and control blocks (e.g. Cut) build on these.

export const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

export const CLEAR_BUFFER = Uint8Array.from([0x10, 0x05, 0x02]); // DLE ENQ 2, real-time
export const PRIMER = new Uint8Array(32);                         // NUL wake-up padding
export const INIT = Uint8Array.from([ESC, 0x40]);                 // ESC @

export function feed(n = 1) {
  return new Uint8Array(Math.max(0, n | 0)).fill(LF);
}

// ESC J n — feed exactly n DOTS (not lines). Used for pixel-precise spacing.
// n is 0..255 per command, so larger feeds are chained.
export function feedDots(n) {
  n = Math.max(0, n | 0);
  const parts = [];
  while (n > 0) {
    const step = Math.min(255, n);
    parts.push(Uint8Array.from([ESC, 0x4a, step]));
    n -= step;
  }
  return concat(parts);
}

export function cut() {
  return Uint8Array.from([GS, 0x56, 0x00]); // GS V 0 — full cut
}

export const ALIGN_LEFT = Uint8Array.from([ESC, 0x61, 0x00]);

// Native-text lead-in printed before any raster. hotspring renders ALL content
// (even text) as GS v 0 rasters, so the first thing the printer parses is binary.
// Without settling it into standard text mode first, that first header can be
// misread as characters ("random symbols, then the content"). Printing one line
// of spaces resets the parser and wakes the head — the reliability fix.
export function warmupLine(width) {
  const cols = Math.max(16, Math.floor(width / 12)); // ~chars per line (Font A ≈ 12 dots)
  const spaces = new Uint8Array(cols).fill(0x20);
  return concat([ALIGN_LEFT, spaces, Uint8Array.from([LF])]);
}

export function concat(list) {
  const total = list.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}

// One GS v 0 raster command per horizontal band (keeps a single command from
// overrunning the print buffer). Returns the concatenated bytes.
export function rasterBands({ bytes, widthBytes, height }, band = 128) {
  const parts = [];
  const xL = widthBytes & 0xff, xH = (widthBytes >> 8) & 0xff;
  for (let y = 0; y < height; y += band) {
    const rows = Math.min(band, height - y);
    parts.push(Uint8Array.from([GS, 0x76, 0x30, 0x00, xL, xH, rows & 0xff, (rows >> 8) & 0xff]));
    parts.push(bytes.subarray(y * widthBytes, (y + rows) * widthBytes));
  }
  return concat(parts);
}
