// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Public API surface for Hotspring.
export { Document, WIDTHS } from './main.js';
export { Renderable } from './renderable.js';
export { TextBlock } from './blocks/text.js';
export { CutBlock } from './blocks/cut.js';
export { SpacerBlock } from './blocks/spacer.js';
export { HrBlock } from './blocks/hr.js';
export { ImageBlock } from './blocks/image.js';
export { QrBlock } from './blocks/qr.js';
export { TableBlock, parseCsv } from './blocks/table.js';
export { CalibrationBlock } from './blocks/calibration.js';
export { reduceToMono } from './imaging.js';
export { encodeQr } from './qr.js';
export { buildCalibration } from './calibration.js';
export { setCanvasFactory, createCanvas } from './canvas.js';
export { registerFont, registerFontFromFile, registerBundledFonts, bundledFontData, BUNDLED_FONTS, listSystemFonts, fontInfo, registeredFonts } from './fonts.js';
export { parseTemplateCode, TEMPLATE_IMAGE_SOURCE } from './template-code.js';
