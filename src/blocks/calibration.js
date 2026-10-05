// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// CalibrationBlock — the whole calibration sheet as a single addable component,
// so it appears in the preview stack like everything else and you can compare the
// on-screen render to the printed result. Internally it builds a throwaway
// Document, lays out the sheet, and flattens it to one 1-bit canvas.

import { Renderable } from '../renderable.js';
import { buildCalibration } from '../calibration.js';

// Document is injected by main.js (which imports this file) rather than imported
// here, so the module graph stays acyclic and bundles in any order.
let DocumentClass = null;
export function setDocumentClass(cls) { DocumentClass = cls; }

export class CalibrationBlock extends Renderable {
  paint() {
    if (!DocumentClass) throw new Error('CalibrationBlock requires Document (import from hotspring)');
    const inner = new DocumentClass({ width: this.width });
    buildCalibration(inner, { cut: false }); // no cut — the outer chain owns cuts
    return inner.toCanvas();
  }

  codeFragment() {
    return `.calibration()`;
  }
}
