// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Renderable — the base class every component extends.
//
// The core idea of Hotspring: a receipt is just a vertical stack of fixed-width
// 1-bit images. A subclass only implements paint() — drawing its own content onto
// a black/white canvas of the document width. Everything shared lives HERE:
// spacing above/below, packing to raster, and turning that into printer bytes.

import { createCanvas } from './canvas.js';
import { rasterBands, feedDots, concat } from './escpos.js';
import { fmtOpts } from './code.js';
import { reduceToMono } from './imaging.js';
import { finiteNumber, width as validWidth } from './validation.js';

export class Renderable {
  constructor(opts = {}) {
    if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw new TypeError('block options must be an object');
    this.opts = { ...opts };
    // Width (dots), default spacing (dots), and cut-feed (dots) are normally set
    // by the Document when the component is added.
    this.width = opts.width ?? 576;
    this.space = opts.space ?? 0;
    this.cutFeed = opts.cutFeed ?? 0;
    this._validateShared();
  }

  _validateShared() {
    validWidth(this.width);
    for (const [key, value] of [
      ['space', this.space], ['cutFeed', this.cutFeed],
      ['spaceBefore', this.opts.spaceBefore], ['spaceAfter', this.opts.spaceAfter],
    ]) {
      if (value !== undefined) finiteNumber(value, key, { min: 0, integer: true });
    }
  }

  /** Validate shared options plus the subclass-specific contract. */
  validate() {
    this._validateShared();
    this.validateOptions();
    return this;
  }

  /** Subclasses override to validate their own options. */
  validateOptions() {}

  /** Preview placeholders are allowed; subclasses reject them for printing here. */
  assertPrintable() { this.validate(); }

  /**
   * Subclasses MUST implement this: paint the component's CONTENT onto a canvas
   * that is `this.width` dots wide, reduced to pure black/white, and return it.
   * Subclasses never deal with spacing — the base adds it.
   */
  paint() {
    throw new Error(`${this.constructor.name} must implement paint()`);
  }

  /** Convenience: a blank working canvas at the component's width. */
  _canvas(height) {
    return createCanvas(this.width, height);
  }

  /**
   * Shared grayscale → 1-bit reduction (tone + dither/threshold). Any subclass
   * that draws greyscale content (text, image) calls this instead of rolling its
   * own — so the imaging pipeline lives in one place.
   */
  _toMono(ctx, width, height, opts) {
    const img = ctx.getImageData(0, 0, width, height);
    reduceToMono(img, opts);
    ctx.putImageData(img, 0, 0);
  }

  // Spacing (in dots) before/after the content. A per-component override wins
  // over the document-wide default.
  _before() { return Math.max(0, this.opts.spaceBefore ?? this.space ?? 0); }
  _after() { return Math.max(0, this.opts.spaceAfter ?? this.space ?? 0); }

  /** Preview canvas = content wrapped in its spacing, so the screen matches print. */
  render() {
    this.validate();
    const content = this.paint();
    const before = this._before(), after = this._after();
    if (!before && !after) return content;
    const cv = createCanvas(this.width, before + content.height + after);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(content, 0, before);
    return cv;
  }

  /**
   * Pack the CONTENT (no spacing) into 1bpp ESC/POS raster: row-major, MSB-first,
   * bit=1 is a black dot. Width must be a multiple of 8.
   */
  toRaster() {
    this.validate();
    const cv = this.paint();
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
    if (width % 8 !== 0) throw new Error(`raster width ${width} is not a multiple of 8`);
    const widthBytes = width / 8;
    const bytes = new Uint8Array(widthBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4] < 128) {
          bytes[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }
    return { bytes, widthBytes, height };
  }

  /**
   * Bytes this component contributes to the job: spacing feed + content raster +
   * spacing feed. Control blocks (e.g. CutBlock) override this to emit commands
   * instead of a picture.
   */
  emit() {
    return concat([feedDots(this._before()), rasterBands(this.toRaster()), feedDots(this._after())]);
  }

  /**
   * The chain source that recreates this component, for the "copy code" button.
   * Subclasses override with their nice chain method.
   */
  codeFragment() {
    return `.add(new ${this.constructor.name}(${fmtOpts(this.opts)}))`;
  }
}
