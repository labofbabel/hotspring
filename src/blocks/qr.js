// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// QrBlock — encodes text/URL into a QR code and renders it as a crisp 1-bit
// image (integer module size, nothing to dither). Full quiet zone included.

import { Renderable } from '../renderable.js';
import { encodeQr } from '../qr.js';
import { fmtOpts } from '../code.js';
import { finiteNumber, oneOf } from '../validation.js';

export class QrBlock extends Renderable {
  validateOptions() {
    const { ecl = 'M', moduleSize = 0, quiet = 4, align = 'center' } = this.opts;
    oneOf(ecl, 'ecl', ['L', 'M', 'Q', 'H']);
    finiteNumber(moduleSize, 'moduleSize', { min: 0, integer: true });
    finiteNumber(quiet, 'quiet', { min: 0, integer: true });
    oneOf(align, 'align', ['left', 'center', 'right']);
  }

  assertPrintable() {
    super.assertPrintable();
    const data = String(this.opts.data ?? '');
    if (!data.length) throw new Error('QR data is empty');
    encodeQr(data, this.opts.ecl ?? 'M');
  }

  paint() {
    const { data = '', ecl = 'M', moduleSize = 0, quiet = 4, align = 'center' } = this.opts;
    const width = this.width;

    if (!String(data).length) return this._placeholder('enter text / URL');
    let grid;
    try {
      grid = encodeQr(String(data), ecl);
    } catch (e) {
      return this._placeholder(e.message);
    }

    const dim = grid.size + quiet * 2; // modules across, including quiet zone
    // moduleSize 0 = fit the printable width; otherwise use the given px size.
    const px = moduleSize > 0 ? moduleSize : Math.max(1, Math.floor(width / dim));
    const qrPx = dim * px;
    const height = qrPx;

    const cv = this._canvas(height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    const ox = align === 'left' ? 0 : align === 'right' ? width - qrPx : Math.floor((width - qrPx) / 2);
    ctx.fillStyle = '#000';
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        if (grid.modules[y][x]) {
          ctx.fillRect(ox + (x + quiet) * px, (y + quiet) * px, px, px);
        }
      }
    }
    return cv;
  }

  _placeholder(text) {
    const cv = this._canvas(60);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.width, 60);
    ctx.strokeStyle = '#000';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(4, 4, this.width - 8, 52);
    ctx.setLineDash([]);
    ctx.fillStyle = '#000';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`QR — ${text}`, this.width / 2, 30);
    return cv;
  }

  codeFragment() {
    const { data = '', ...rest } = this.opts;
    const opts = fmtOpts(rest);
    return `.qr(${JSON.stringify(data)}${opts ? ', ' + opts : ''})`;
  }
}
