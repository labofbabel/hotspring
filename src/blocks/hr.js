// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// HrBlock — a horizontal rule rendered as a 1-bit image (not text), so it is
// exactly full width and fully controllable: line thickness, and dash on/off
// lengths (both 0 = a solid line). Optional inset pulls it in from the edges.

import { Renderable } from '../renderable.js';
import { createCanvas } from '../canvas.js';
import { fmtOpts } from '../code.js';
import { finiteNumber, positiveNumber } from '../validation.js';

export class HrBlock extends Renderable {
  validateOptions() {
    const { thickness = 4, dashOn = 0, dashOff = 0, inset = 0 } = this.opts;
    positiveNumber(thickness, 'thickness', { integer: true });
    finiteNumber(dashOn, 'dashOn', { min: 0, integer: true });
    finiteNumber(dashOff, 'dashOff', { min: 0, integer: true });
    finiteNumber(inset, 'inset', { min: 0, integer: true });
    if (inset * 2 >= this.width) throw new RangeError('inset must leave positive rule width');
  }

  paint() {
    const { thickness = 4, dashOn = 0, dashOff = 0, inset = 0 } = this.opts;
    const w = this.width;
    const h = Math.max(1, thickness);
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    const x0 = inset, x1 = w - inset;
    if (dashOn > 0 && dashOff > 0) {
      for (let x = x0; x < x1; x += dashOn + dashOff) {
        ctx.fillRect(x, 0, Math.min(dashOn, x1 - x), thickness);
      }
    } else {
      ctx.fillRect(x0, 0, Math.max(0, x1 - x0), thickness);
    }
    return cv;
  }

  codeFragment() {
    const opts = fmtOpts(this.opts);
    return `.hr(${opts})`;
  }
}
