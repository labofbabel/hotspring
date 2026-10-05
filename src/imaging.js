// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Shared grayscale → 1-bit pipeline: tone (gamma / contrast / brightness),
// unsharp-mask sharpen, then a dithering/threshold reduction. Pure — operates on
// an ImageData-like object ({ data, width, height }) in place, so it runs in the
// browser and (with a plain object) headless in Node. Exposed to components via
// the Renderable base's _toMono() helper.

import { finiteNumber, oneOf, positiveNumber } from './validation.js';

// 8×8 Bayer matrix (values 0..63) for ordered dithering.
const BAYER8 = (() => {
  let m = [[0]];
  for (let n = 1; n < 8; n *= 2) {
    const s = m.length;
    const next = Array.from({ length: s * 2 }, () => new Array(s * 2));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v; next[y][x + s] = v + 2;
        next[y + s][x] = v + 3; next[y + s][x + s] = v + 1;
      }
    }
    m = next;
  }
  return m;
})();

// Separable 3×3 box blur used by the unsharp mask.
function blur3(src, w, h) {
  const t = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    t[i] = (src[i] + src[y * w + Math.max(0, x - 1)] + src[y * w + Math.min(w - 1, x + 1)]) / 3;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    out[i] = (t[i] + t[Math.max(0, y - 1) * w + x] + t[Math.min(h - 1, y + 1) * w + x]) / 3;
  }
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Reduce an image to pure black/white in place.
 * @param {{data:Uint8ClampedArray|Uint8Array, width:number, height:number}} imageData
 * @param {object} opts
 * @param {'atkinson'|'floyd'|'ordered'|'none'} [opts.algo='atkinson']
 * @param {number} [opts.threshold=128]   black/white decision point (0..255)
 * @param {number} [opts.brightness=0]    added to luminance (-128..128)
 * @param {number} [opts.contrast=1]      multiplier around mid-grey (1 = none)
 * @param {number} [opts.gamma=1]         >1 lightens midtones (fights dot-gain)
 * @param {number} [opts.sharpen=0]       unsharp-mask amount
 */
export function reduceToMono(imageData, opts = {}) {
  if (!imageData || typeof imageData !== 'object') throw new TypeError('imageData must be an object');
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw new TypeError('opts must be an object');
  const { data, width, height } = imageData;
  const {
    algo = 'atkinson', threshold = 128,
    brightness = 0, contrast = 1, gamma = 1, sharpen = 0,
  } = opts;
  positiveNumber(width, 'imageData.width', { integer: true });
  positiveNumber(height, 'imageData.height', { integer: true });
  if (!data || typeof data.length !== 'number' || data.length < width * height * 4) {
    throw new RangeError('imageData.data must contain four channels per pixel');
  }
  oneOf(algo, 'algo', ['atkinson', 'floyd', 'ordered', 'none']);
  finiteNumber(threshold, 'threshold', { min: 0, max: 255 });
  finiteNumber(brightness, 'brightness', { min: -255, max: 255 });
  positiveNumber(contrast, 'contrast');
  positiveNumber(gamma, 'gamma');
  finiteNumber(sharpen, 'sharpen', { min: 0 });

  // 1. Luminance.
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  // 2. Gamma.
  if (gamma !== 1) for (let i = 0; i < gray.length; i++) gray[i] = 255 * Math.pow(clamp01(gray[i] / 255), 1 / gamma);
  // 3. Contrast + brightness.
  if (contrast !== 1 || brightness !== 0) {
    for (let i = 0; i < gray.length; i++) gray[i] = (gray[i] - 128) * contrast + 128 + brightness;
  }
  // 4. Unsharp mask.
  if (sharpen > 0) {
    const b = blur3(gray, width, height);
    for (let i = 0; i < gray.length; i++) gray[i] += sharpen * (gray[i] - b[i]);
  }

  // 5. Reduce to 1-bit.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      let nw;
      if (algo === 'ordered') {
        nw = old > (BAYER8[y & 7][x & 7] + 0.5) / 64 * 255 + (threshold - 128) ? 255 : 0;
      } else {
        nw = old < threshold ? 0 : 255;
      }
      const err = old - nw;
      if (algo === 'floyd') {
        if (x + 1 < width) gray[i + 1] += err * 7 / 16;
        if (y + 1 < height) {
          if (x > 0) gray[i + width - 1] += err * 3 / 16;
          gray[i + width] += err * 5 / 16;
          if (x + 1 < width) gray[i + width + 1] += err * 1 / 16;
        }
      } else if (algo === 'atkinson') {
        const e = err / 8; // diffuses 6/8 of the error — crisper, less mud
        if (x + 1 < width) gray[i + 1] += e;
        if (x + 2 < width) gray[i + 2] += e;
        if (y + 1 < height) {
          if (x > 0) gray[i + width - 1] += e;
          gray[i + width] += e;
          if (x + 1 < width) gray[i + width + 1] += e;
        }
        if (y + 2 < height) gray[i + 2 * width] += e;
      }
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = nw;
      data[i * 4 + 3] = 255;
    }
  }
}
