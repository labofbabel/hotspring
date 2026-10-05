// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// TextBlock — lays out text and hard-thresholds it to 1-bit. Font resolution and
// whitespace-preserving wrapping come from the shared textlayout helpers.

import { Renderable } from '../renderable.js';
import { fmtOpts } from '../code.js';
import { resolveFont, wrapText, fontVMetrics } from '../textlayout.js';
import { boolean, finiteNumber, nonEmptyString, oneOf, positiveNumber } from '../validation.js';

export class TextBlock extends Renderable {
  validateOptions() {
    const { font = 'monospace', size = 24, align = 'left', bold = false, pad = 8 } = this.opts;
    nonEmptyString(font, 'font');
    positiveNumber(size, 'size');
    oneOf(align, 'align', ['left', 'center', 'right']);
    boolean(bold, 'bold');
    finiteNumber(pad, 'pad', { min: 0, integer: true });
    if (pad * 2 >= this.width) throw new RangeError('pad must leave positive printable width');
  }

  codeFragment() {
    const { text = '', ...rest } = this.opts;
    const opts = fmtOpts(rest);
    return `.text(${JSON.stringify(text)}${opts ? ', ' + opts : ''})`;
  }

  paint() {
    const { text = '', font = 'monospace', size = 24, align = 'left', bold = false, pad = 8 } = this.opts;
    const width = this.width;
    const { fontStr, lineH, threshold } = resolveFont(font, size, bold);
    const maxW = width - pad * 2;

    // Measure on a scratch context first (we need the line count to size the canvas).
    const scratch = this._canvas(1).getContext('2d', { willReadFrequently: true });
    scratch.font = fontStr;
    const lines = [];
    for (const raw of String(text).replace(/\r/g, '').split('\n')) {
      for (const ln of wrapText(scratch, raw, maxW)) lines.push(ln);
    }

    // Lay out from the BASELINE so `pad` is exactly equal above and below: the
    // block is pad + ascent + (n-1) line gaps + descent + pad.
    const { ascent, descent } = fontVMetrics(scratch, size);
    const height = Math.ceil(pad * 2 + ascent + descent + (lines.length - 1) * lineH);
    const cv = this._canvas(height);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.font = fontStr;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = align;
    const x = align === 'center' ? width / 2 : align === 'right' ? width - pad : pad;
    lines.forEach((ln, i) => ctx.fillText(ln, x, pad + ascent + i * lineH));

    this._toMono(ctx, width, height, { algo: 'none', threshold });
    return cv;
  }
}
