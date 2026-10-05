// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// SpacerBlock — blank vertical space, measured in dots. It paints white for the
// preview, but emits an efficient dot-feed rather than a big blank raster.

import { Renderable } from '../renderable.js';
import { feedDots } from '../escpos.js';
import { createCanvas } from '../canvas.js';
import { positiveNumber } from '../validation.js';

export class SpacerBlock extends Renderable {
  validateOptions() {
    positiveNumber(this.opts.height ?? 24, 'height', { integer: true });
  }

  paint() {
    const h = Math.max(1, this.opts.height ?? 24);
    const cv = createCanvas(this.width, h);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.width, h);
    return cv;
  }

  emit() {
    return feedDots(this._before() + (this.opts.height ?? 24) + this._after());
  }

  codeFragment() {
    return `.spacer(${this.opts.height ?? 24})`;
  }
}
