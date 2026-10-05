// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ImageBlock — draws a bitmap and reduces it to 1-bit through the shared imaging
// pipeline (dither/tone). Two sizing modes:
//   scale: 'fit'   → scale proportionally to the full printable width (default)
//   scale: <pct>   → percentage of the image's natural size; then `height`
//                    (crop/letterbox) and offsetX/offsetY position it.
//
// `src` is any canvas-drawable image (HTMLImageElement / canvas / ImageBitmap).

import { Renderable } from '../renderable.js';
import { fmtOpts } from '../code.js';
import { finiteNumber, oneOf, positiveNumber } from '../validation.js';

export class ImageBlock extends Renderable {
  validateOptions() {
    const {
      scale = 'fit', height = 0, offsetX = 0, offsetY = 0,
      algo = 'atkinson', threshold = 128, brightness = 0, contrast = 1, gamma = 1, sharpen = 0,
    } = this.opts;
    if (scale !== 'fit') positiveNumber(scale, 'scale');
    finiteNumber(height, 'height', { min: 0, integer: true });
    finiteNumber(offsetX, 'offsetX', { integer: true });
    finiteNumber(offsetY, 'offsetY', { integer: true });
    oneOf(algo, 'algo', ['atkinson', 'floyd', 'ordered', 'none']);
    finiteNumber(threshold, 'threshold', { min: 0, max: 255 });
    finiteNumber(brightness, 'brightness', { min: -255, max: 255 });
    positiveNumber(contrast, 'contrast');
    positiveNumber(gamma, 'gamma');
    finiteNumber(sharpen, 'sharpen', { min: 0 });
  }

  assertPrintable() {
    super.assertPrintable();
    if (!this.opts.src) throw new Error('image source is missing');
    const iw = this.opts.src.naturalWidth || this.opts.src.width;
    const ih = this.opts.src.naturalHeight || this.opts.src.height;
    positiveNumber(iw, 'image source width');
    positiveNumber(ih, 'image source height');
  }

  paint() {
    const {
      src, scale = 'fit', height = 0, offsetX = 0, offsetY = 0,
      algo = 'atkinson', threshold = 128, brightness = 0, contrast = 1, gamma = 1, sharpen = 0,
    } = this.opts;
    const width = this.width;
    if (!src) return this._placeholder();

    const iw = src.naturalWidth || src.width;
    const ih = src.naturalHeight || src.height;
    positiveNumber(iw, 'image source width');
    positiveNumber(ih, 'image source height');

    let drawW, drawH, canvasH, smooth;
    if (scale === 'fit') {
      drawW = width;
      drawH = Math.max(1, Math.round(ih * width / iw));
      canvasH = drawH;
      smooth = true; // best for proportional downscaling of photos
    } else {
      const pct = scale / 100;
      drawW = Math.max(1, Math.round(iw * pct));
      drawH = Math.max(1, Math.round(ih * pct));
      canvasH = height > 0 ? height : drawH; // explicit height crops/letterboxes
      smooth = pct < 1;                       // smooth when shrinking, crisp when enlarging
    }

    const cv = this._canvas(canvasH);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = smooth;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, canvasH);
    // Uniform scale (drawW/drawH keep aspect); offset + canvas bounds do the cropping.
    ctx.drawImage(src, offsetX, offsetY, drawW, drawH);

    this._toMono(ctx, width, canvasH, { algo, threshold, brightness, contrast, gamma, sharpen });
    return cv;
  }

  // Shown until an image is supplied (test-page convenience).
  _placeholder() {
    const cv = this._canvas(80);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.width, 80);
    ctx.strokeStyle = '#000';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(4, 4, this.width - 8, 72);
    ctx.setLineDash([]);
    ctx.fillStyle = '#000';
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('drop an image', this.width / 2, 40);
    return cv;
  }

  codeFragment() {
    const { src, ...rest } = this.opts;
    const opts = fmtOpts(rest);
    return `.image(source${opts ? ', ' + opts : ''})`;
  }
}
