// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// main.js — the Document: hosts components and owns everything about turning
// them into printer bytes (ESC/POS commands, the reliability envelope, banding,
// cutting). Rendering lives in the Renderable subclasses; this file never draws.

import { createCanvas } from './canvas.js';
import { CLEAR_BUFFER, PRIMER, INIT, feedDots, warmupLine, concat } from './escpos.js';
import { TextBlock } from './blocks/text.js';
import { CutBlock } from './blocks/cut.js';
import { SpacerBlock } from './blocks/spacer.js';
import { HrBlock } from './blocks/hr.js';
import { ImageBlock } from './blocks/image.js';
import { QrBlock } from './blocks/qr.js';
import { TableBlock } from './blocks/table.js';
import { CalibrationBlock, setDocumentClass } from './blocks/calibration.js';
import { Renderable } from './renderable.js';
import { finiteNumber, width as validWidth } from './validation.js';

// Common thermal print-head widths, in dots (8 dots = 1 mm at 203 dpi).
export const WIDTHS = Object.freeze({ '58mm': 384, '76mm': 512, '80mm': 576 });

// --- Document ---------------------------------------------------------------
export class Document {
  constructor({ width = WIDTHS['80mm'], spacing = 0, cutFeed = 120 } = {}) {
    this.width = width;
    this.spacing = spacing; // dots of blank space added before & after each component
    this.cutFeed = cutFeed; // dots fed before each cut, to clear the cutter (tune per printer)
    this.components = [];
    this.validate();
  }

  validate() {
    validWidth(this.width);
    finiteNumber(this.spacing, 'spacing', { min: 0, integer: true });
    finiteNumber(this.cutFeed, 'cutFeed', { min: 0, integer: true });
    return this;
  }

  /** Add any Renderable; the document stamps it with its width + defaults. */
  add(component) {
    this.validate();
    if (!(component instanceof Renderable)) throw new TypeError('component must extend Renderable');
    component.width = this.width;
    component.space = component.opts.space ?? this.spacing;
    component.cutFeed = component.opts.cutFeed ?? this.cutFeed;
    component.validate();
    this.components.push(component);
    return this;
  }

  /** Chainable text block. */
  text(text, opts = {}) {
    return this.add(new TextBlock({ ...opts, text, width: this.width }));
  }

  /** Chainable paper cut — a control component you can place anywhere. */
  cut(opts = {}) {
    return this.add(new CutBlock({ ...opts, width: this.width }));
  }

  /** Chainable blank vertical space, in dots. */
  spacer(height = 24, opts = {}) {
    return this.add(new SpacerBlock({ ...opts, height, width: this.width }));
  }

  /** Chainable horizontal rule (rendered as a full-width 1-bit image). */
  hr(opts = {}) {
    return this.add(new HrBlock({ ...opts, width: this.width }));
  }

  /** Chainable image (dithered to 1-bit). `src` is any canvas-drawable image. */
  image(src, opts = {}) {
    return this.add(new ImageBlock({ ...opts, src, width: this.width }));
  }

  /** Chainable QR code from text/URL. */
  qr(data, opts = {}) {
    return this.add(new QrBlock({ ...opts, data, width: this.width }));
  }

  /** Chainable table from a CSV string (first row = header). */
  table(csv, opts = {}) {
    return this.add(new TableBlock({ ...opts, csv, width: this.width }));
  }

  /** Chainable calibration sheet (ruler, dither/gamma ramps, font samples). */
  calibration(opts = {}) {
    return this.add(new CalibrationBlock({ ...opts, width: this.width }));
  }

  /** Stack every component into one preview canvas (top-to-bottom). */
  toCanvas() {
    this.validate();
    const canvases = this.components.map((c) => c.render());
    const height = canvases.reduce((h, c) => h + c.height, 0) || 1;
    const out = createCanvas(this.width, height);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false; // keep the composited preview strictly 1-bit
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.width, height);
    let y = 0;
    for (const c of canvases) { ctx.drawImage(c, 0, Math.round(y)); y += c.height; }
    return out;
  }

  /**
   * Assemble the full ESC/POS job as a Uint8Array, ready for any transport.
   * The envelope keeps unattended printing bullet-proof:
   *   clear buffer → NUL primer → init → native-text warmup → top margin.
   * All feeds are in DOTS (consistent with per-component spacing). Cuts are NOT
   * automatic — add CutBlock(s) where you want the paper cut.
   */
  toBytes({ marginTop = 24, marginBottom = 24 } = {}) {
    this.validate();
    finiteNumber(marginTop, 'marginTop', { min: 0, integer: true });
    finiteNumber(marginBottom, 'marginBottom', { min: 0, integer: true });
    this.components.forEach((component, index) => {
      try {
        component.assertPrintable();
      } catch (error) {
        throw new Error(`Component ${index + 1} (${component.constructor.name}) is not printable: ${error.message}`);
      }
    });
    const parts = [CLEAR_BUFFER, PRIMER, INIT, warmupLine(this.width), feedDots(marginTop)];
    for (const component of this.components) parts.push(component.emit());
    parts.push(feedDots(marginBottom));
    return concat(parts);
  }

  /** Regenerate the chain source that would recreate this document. */
  toCode({ width = this.width, spacing = this.spacing, cutFeed = this.cutFeed } = {}) {
    this.validate();
    this.components.forEach((component) => component.validate());
    validWidth(width);
    finiteNumber(spacing, 'spacing', { min: 0, integer: true });
    finiteNumber(cutFeed, 'cutFeed', { min: 0, integer: true });
    const extra = [`width: ${width}`];
    if (spacing) extra.push(`spacing: ${spacing}`);
    if (cutFeed !== 120) extra.push(`cutFeed: ${cutFeed}`);
    const docOpts = `{ ${extra.join(', ')} }`;
    const chain = ['doc', ...this.components.map((c) => '  ' + c.codeFragment())].join('\n') + ';';
    return [
      "import { Document } from 'hotspring';",
      '',
      `const doc = new Document(${docOpts});`,
      chain,
      '',
      'const bytes = doc.toBytes();',
    ].join('\n');
  }
}

setDocumentClass(Document);
