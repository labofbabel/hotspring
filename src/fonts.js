// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Font registry.
//
// Canvas renders text with whatever fonts are loaded in the host at draw time —
// there is nothing special about printing. The two things that DO matter:
//
//   1. A font must be fully loaded before you paint, or the canvas silently
//      falls back to a default face (no error, just wrong output). registerFont()
//      loads it and resolves only when it is ready to draw.
//   2. Pixel/bitmap fonts are only crisp at integer multiples of their design
//      grid (8px for Pixel Operator). The registry records that grid
//      so text layout can snap sizes, instead of hardcoding font names.
//
// Browser/Electron-renderer: pass a url, we use FontFace. Headless Node: register
// the face with your canvas implementation (e.g. node-canvas registerFont) and
// then call registerFont(name, { grid }) with no url, just to record the metrics.

import { finiteNumber, nonEmptyString, positiveNumber } from './validation.js';
import { PIXEL_OPERATOR } from './fonts/pixel-operator.js';

const registry = new Map();

function fontOptions(name, opts) {
  nonEmptyString(name, 'font name');
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw new TypeError('font options must be an object');
  const { url, grid = 0, lineHeight, threshold } = opts;
  if (url !== undefined && (typeof url !== 'string' || !url)) throw new TypeError('font url must be a non-empty string');
  finiteNumber(grid, 'grid', { min: 0, integer: true });
  if (lineHeight !== undefined) positiveNumber(lineHeight, 'lineHeight');
  if (threshold !== undefined) finiteNumber(threshold, 'threshold', { min: 0, max: 255 });
}

/**
 * @param {string} name        Family name used in `ctx.font` and block opts.
 * @param {object} [opts]
 * @param {string} [opts.url]  Font file to load (browser/Electron renderer).
 * @param {number} [opts.grid] Design-grid size in px; sizes snap to multiples.
 * @param {number} [opts.lineHeight] Multiplier for line spacing (default 1.35,
 *                                   or 1.5 for grid fonts).
 * @param {number} [opts.threshold]  1-bit cut point (default 160, grid: 128).
 * @returns {Promise<void>} resolves once the font is ready to paint with.
 */
export async function registerFont(name, opts = {}) {
  fontOptions(name, opts);
  const { url, grid = 0, lineHeight, threshold } = opts;
  if (url && (typeof FontFace === 'undefined' || typeof document === 'undefined')) {
    throw new Error('font URLs require a browser or Electron renderer');
  }
  if (url) {
    const face = new FontFace(name, `url(${JSON.stringify(url)})`);
    await face.load();
    document.fonts.add(face);
  }
  registry.set(name, {
    grid,
    lineHeight: lineHeight ?? (grid ? 1.5 : 1.35),
    threshold: threshold ?? (grid ? 128 : 160),
  });
}

/**
 * Register a font from a File/Blob/ArrayBuffer (drag-and-drop, file picker).
 * Same contract as registerFont: resolves only once it is ready to paint with.
 * @returns {Promise<string>} the family name it was registered under.
 */
export async function registerFontFromFile(file, opts = {}) {
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw new TypeError('font options must be an object');
  if (!file || (typeof file.arrayBuffer !== 'function' && !(file instanceof ArrayBuffer))) {
    throw new TypeError('file must be a File, Blob, or ArrayBuffer');
  }
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    throw new Error('registerFontFromFile requires a browser or Electron renderer');
  }
  const name = opts.name ?? String(file.name || 'Custom').replace(/\.[^.]+$/, '');
  fontOptions(name, opts);
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const face = new FontFace(name, buf);
  await face.load();
  document.fonts.add(face);
  const { grid = 0, lineHeight, threshold } = opts;
  registry.set(name, {
    grid,
    lineHeight: lineHeight ?? (grid ? 1.5 : 1.35),
    threshold: threshold ?? (grid ? 128 : 160),
  });
  return name;
}

/** Family names of the fonts embedded in the library (Pixel Operator, CC0). */
export const BUNDLED_FONTS = Object.freeze(Object.keys(PIXEL_OPERATOR));

/**
 * Raw TTF bytes of an embedded font — for headless Node, hand these to your
 * canvas implementation (e.g. write to a temp file for node-canvas registerFont).
 * @returns {Uint8Array}
 */
export function bundledFontData(name) {
  const face = PIXEL_OPERATOR[name];
  if (!face) throw new RangeError(`no bundled font named ${JSON.stringify(name)}`);
  const bin = atob(face.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Register the embedded fonts (Pixel Operator, Pixel Operator Mono) — no
 * network or file paths involved. In a browser/Electron renderer the faces are
 * loaded via FontFace; in headless Node only the metrics are recorded (load the
 * bytes from bundledFontData() into your canvas implementation yourself).
 * @returns {Promise<string[]>} the registered family names.
 */
export async function registerBundledFonts() {
  const browser = typeof FontFace !== 'undefined' && typeof document !== 'undefined';
  for (const [name, { grid }] of Object.entries(PIXEL_OPERATOR)) {
    if (browser) await registerFontFromFile(bundledFontData(name).buffer, { name, grid });
    else await registerFont(name, { grid });
  }
  return [...BUNDLED_FONTS];
}

/**
 * Fonts installed on the machine, via the Local Font Access API. Chromium-only
 * and permission-gated (the browser prompts); resolves to [] where unsupported.
 * These are available to the canvas without loading anything — they're local.
 */
export async function listSystemFonts() {
  if (typeof queryLocalFonts !== 'function') return [];
  try {
    const faces = await queryLocalFonts();
    return [...new Set(faces.map((f) => f.family))].sort();
  } catch {
    return []; // permission denied or unavailable
  }
}

/** Metrics for a registered font (falls back to sensible defaults). */
export function fontInfo(name) {
  return registry.get(name) || { grid: 0, lineHeight: 1.35, threshold: 160 };
}

/** Names of every registered font, in registration order. */
export function registeredFonts() {
  return [...registry.keys()];
}
