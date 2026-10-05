// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// CutBlock — the first *control* component. It renders nothing to paper; instead
// it emits a paper-cut command into the byte stream. Because it lives in the
// component chain like everything else, you can drop as many cuts as you want
// into a single job (e.g. to split one print run into several tickets).

import { Renderable } from '../renderable.js';
import { feedDots, cut, concat } from '../escpos.js';
import { createCanvas } from '../canvas.js';

export class CutBlock extends Renderable {
  // Preview-only marker (dashed rule + "CUT", ASCII, 1-bit). NOT printed — emit()
  // below is what actually goes to the printer.
  paint() {
    const w = this.width, h = 32, midY = Math.floor(h / 2);
    const cv = createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    for (let x = 0; x < w; x += 12) ctx.fillRect(x, midY, 6, 1); // crisp 1-dot dashes
    const label = ' CUT ';
    ctx.font = '16px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(w / 2 - lw / 2, 0, lw, h); // clear behind the label
    ctx.fillStyle = '#000';
    ctx.fillText(label, w / 2, midY);
    this._toMono(ctx, w, h, { algo: 'none', threshold: 160 }); // keep it strictly 1-bit
    return cv;
  }

  // Consistent with every other component: the global spacing applies before and
  // after, and an extra `cutFeed` (dots) pushes content clear of the cutter blade
  // before cutting — tune it per printer if the cut lands in a strange place.
  emit() {
    return concat([feedDots(this._before() + (this.cutFeed ?? 0)), cut(), feedDots(this._after())]);
  }

  codeFragment() {
    return `.cut()`;
  }
}
