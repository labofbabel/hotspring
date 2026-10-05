// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// TableBlock — renders a CSV string as a 1-bit table. The first row is the
// header (bold). Columns are flexible: equal by default, or weighted via
// `widths`. Cells wrap their text; row height grows to fit. Rendered as an image
// so grid lines are exactly 1 dot and everything is full width.

import { Renderable } from '../renderable.js';
import { fmtOpts } from '../code.js';
import { resolveFont, wrapText, fontVMetrics } from '../textlayout.js';
import { boolean, finiteNumber, nonEmptyString, oneOf, positiveNumber } from '../validation.js';

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field);
  rows.push(row);
  // Drop a trailing empty row caused by a final newline.
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

export class TableBlock extends Renderable {
  validateOptions() {
    const {
      csv = '', font = 'Pixel Operator', size = 16, header = true,
      widths = null, align = 'left', border = true, padding = 6,
    } = this.opts;
    if (typeof csv !== 'string') throw new TypeError('csv must be a string');
    nonEmptyString(font, 'font');
    positiveNumber(size, 'size');
    boolean(header, 'header');
    boolean(border, 'border');
    finiteNumber(padding, 'padding', { min: 0, integer: true });
    if (widths !== null) {
      if (!Array.isArray(widths) || !widths.length) throw new TypeError('widths must be null or a non-empty array');
      widths.forEach((value, index) => positiveNumber(value, `widths[${index}]`));
    }
    const aligns = Array.isArray(align) ? align : [align];
    if (!aligns.length) throw new TypeError('align must not be an empty array');
    aligns.forEach((value, index) => oneOf(value, Array.isArray(align) ? `align[${index}]` : 'align', ['left', 'center', 'right']));
  }

  assertPrintable() {
    super.assertPrintable();
    if (!parseCsv(this.opts.csv ?? '').length) throw new Error('table CSV is empty');
  }

  paint() {
    const {
      csv = '', font = 'Pixel Operator', size = 16, header = true,
      widths = null, align = 'left', border = true, padding = 6,
    } = this.opts;
    const width = this.width;

    const rows = parseCsv(csv);
    if (!rows.length) return this._placeholder();
    const numCols = Math.max(...rows.map((r) => r.length));

    // Column widths (dots): weighted or equal, last column absorbs rounding.
    let colW;
    if (Array.isArray(widths) && widths.length) {
      const w = Array.from({ length: numCols }, (_, i) => widths[i] ?? widths[widths.length - 1] ?? 1);
      const sum = w.reduce((a, b) => a + b, 0);
      colW = w.map((x) => Math.floor(width * x / sum));
    } else {
      colW = new Array(numCols).fill(Math.floor(width / numCols));
    }
    colW[numCols - 1] += width - colW.reduce((a, b) => a + b, 0);
    if (colW.some((value) => value - padding * 2 <= 0)) {
      throw new RangeError('padding and column widths must leave positive cell content width');
    }
    const colX = [];
    for (let c = 0, x = 0; c < numCols; c++) { colX.push(x); x += colW[c]; }

    const body = resolveFont(font, size, false);
    const head = resolveFont(font, size, true);
    const lineH = body.lineH;

    // Measure: wrap each cell, compute row heights.
    const scratch = this._canvas(1).getContext('2d', { willReadFrequently: true });
    scratch.font = body.fontStr;
    const vm = fontVMetrics(scratch, body.px);
    const cellLines = [], rowH = [];
    for (let r = 0; r < rows.length; r++) {
      scratch.font = header && r === 0 ? head.fontStr : body.fontStr;
      const lineArr = [];
      let maxLines = 1;
      for (let c = 0; c < numCols; c++) {
        const lines = wrapText(scratch, rows[r][c] ?? '', colW[c] - padding * 2);
        lineArr.push(lines);
        maxLines = Math.max(maxLines, lines.length);
      }
      cellLines.push(lineArr);
      // Baseline layout (see fontVMetrics): reserving lineH for the last line
      // would dump its leading at the bottom and off-centre the row.
      rowH.push(Math.ceil(padding * 2 + vm.ascent + vm.descent + (maxLines - 1) * lineH));
    }
    const totalH = rowH.reduce((a, b) => a + b, 0) + (border ? 1 : 0);

    const cv = this._canvas(totalH);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, totalH);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';

    // Cell text.
    let y = 0;
    for (let r = 0; r < rows.length; r++) {
      ctx.font = header && r === 0 ? head.fontStr : body.fontStr;
      for (let c = 0; c < numCols; c++) {
        const a = Array.isArray(align) ? (align[c] || 'left') : align;
        ctx.textAlign = a;
        const tx = a === 'center' ? colX[c] + colW[c] / 2
          : a === 'right' ? colX[c] + colW[c] - padding
            : colX[c] + padding;
        cellLines[r][c].forEach((ln, li) => ctx.fillText(ln, tx, y + padding + vm.ascent + li * lineH));
      }
      y += rowH[r];
    }

    // Grid lines as exact 1-dot rules.
    if (border) {
      ctx.textAlign = 'left';
      ctx.fillRect(0, 0, width, 1);
      let acc = 0;
      for (let r = 0; r < rows.length; r++) { acc += rowH[r]; ctx.fillRect(0, Math.min(acc, totalH - 1), width, 1); }
      ctx.fillRect(0, 0, 1, totalH);
      let x = 0;
      for (let c = 0; c < numCols; c++) { x += colW[c]; ctx.fillRect(Math.min(x, width - 1), 0, 1, totalH); }
    }

    this._toMono(ctx, width, totalH, { algo: 'none', threshold: body.threshold });
    return cv;
  }

  _placeholder() {
    const cv = this._canvas(50);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.width, 50);
    ctx.fillStyle = '#000';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('table — enter CSV', this.width / 2, 25);
    return cv;
  }

  codeFragment() {
    const { csv = '', ...rest } = this.opts;
    const opts = fmtOpts(rest);
    return `.table(${JSON.stringify(csv)}${opts ? ', ' + opts : ''})`;
  }
}
