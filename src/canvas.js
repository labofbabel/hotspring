// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Canvas provider — the one environment-specific seam in the render path.
//
// In a browser or Electron renderer this uses the DOM/Offscreen canvas
// automatically. For headless Node (no built-in canvas), inject one with
// setCanvasFactory(), e.g. a node-canvas createCanvas. Everything else in the
// library is plain JS and needs no host.

import { positiveNumber } from './validation.js';

let factory = null;

/** Supply a canvas implementation for headless use: fn(width, height) -> canvas. */
export function setCanvasFactory(fn) {
  if (typeof fn !== 'function') throw new TypeError('canvas factory must be a function');
  factory = fn;
}

/** Create a working canvas. Prefers a displayable DOM canvas in the browser. */
export function createCanvas(width, height) {
  const w = positiveNumber(width, 'canvas width', { integer: true });
  const h = positiveNumber(height, 'canvas height', { integer: true });
  if (factory) {
    const canvas = factory(w, h);
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new TypeError('canvas factory must return a canvas-like object with getContext()');
    }
    return canvas;
  }
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error(
    'hotspring: no canvas available. In headless Node, call setCanvasFactory() ' +
    'with a canvas implementation (e.g. node-canvas createCanvas).'
  );
}
