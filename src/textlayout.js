// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Shared text-layout helpers used by any component that draws text (TextBlock,
// TableBlock). Keeping wrapping + font resolution here means they behave
// identically everywhere.

import { fontInfo } from './fonts.js';

/**
 * Resolve a font into concrete metrics. Grid (pixel/bitmap) fonts are snapped to
 * integer multiples of their design grid, which is what keeps them crisp. The
 * grid comes from the font registry — register your own with registerFont().
 */
export function resolveFont(font, size, bold = false) {
  const { grid, lineHeight, threshold } = fontInfo(font);
  const px = grid ? Math.max(grid, Math.round(size / grid) * grid) : size;
  const lineH = Math.round(px * lineHeight);
  const fontStr = `${bold ? 'bold ' : ''}${px}px ${JSON.stringify(font)}`;
  return { isPixel: !!grid, grid, px, lineH, fontStr, threshold };
}

/**
 * Vertical metrics for the context's current font, in px.
 *
 * Text must be positioned by BASELINE, not by the top of the line box: a line box
 * is `lineH` tall but the glyphs only fill ascent+descent, so laying out from the
 * top leaves the leftover leading dumped below the last line — which reads as an
 * unequal bottom margin. Using these metrics, padding is exactly equal top/bottom.
 */
export function fontVMetrics(ctx, fallbackSize) {
  const m = ctx.measureText('Xg');
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? fallbackSize * 0.8;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? fallbackSize * 0.2;
  return { ascent, descent, glyphH: ascent + descent };
}

/**
 * Whitespace-preserving word wrap. Keeps indentation, runs of spaces, and tabs
 * (expanded to `tabWidth`); hard-breaks tokens longer than the line. `ctx.font`
 * must already be set for measurement.
 */
export function wrapText(ctx, raw, maxW, { tabWidth = 4 } = {}) {
  raw = String(raw).replace(/\t/g, ' '.repeat(tabWidth));
  if (raw === '') return [''];
  const tokens = raw.match(/\s+|\S+/g) || [];
  const out = [];
  let cur = '';
  for (let tok of tokens) {
    while (ctx.measureText(cur + tok).width > maxW) {
      if (cur !== '') { out.push(cur); cur = ''; continue; }
      let n = 1;
      while (n < tok.length && ctx.measureText(tok.slice(0, n + 1)).width <= maxW) n++;
      out.push(tok.slice(0, n));
      tok = tok.slice(n);
    }
    cur += tok;
  }
  out.push(cur);
  return out;
}
