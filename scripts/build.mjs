// Builds the vendorable single-file bundles from src/index.js:
//   dist/hotspring.min.js      IIFE, exposes a global `Hotspring` (<script> tag)
//   dist/hotspring.esm.min.js  ES module (import { Document } from './hotspring.esm.min.js')
// Both embed Pixel Operator and contain no Node-only code (the CUPS transport
// is a separate entry point and is never bundled here).

import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const banner = `/*! hotspring v${pkg.version} | MPL-2.0 | https://github.com/labofbabel/hotspring
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 * Includes: QR Code generator (c) Project Nayuki, MIT License;
 * Pixel Operator font by Jayvee Enaguas, CC0 1.0.
 * See THIRD_PARTY_NOTICES.md for full notices. */`;

const common = {
  entryPoints: ['src/index.js'],
  bundle: true,
  minify: true,
  sourcemap: 'external', // .map files are optional; no sourceMappingURL comment, so no 404 when vendored alone
  platform: 'browser',
  target: 'es2020',
  keepNames: true,     // class names stay intact (constructor.name is public-facing)
  legalComments: 'none', // the banner carries the required notices
  banner: { js: banner },
  logLevel: 'info',
};

await build({ ...common, format: 'iife', globalName: 'Hotspring', outfile: 'dist/hotspring.min.js' });
await build({ ...common, format: 'esm', outfile: 'dist/hotspring.esm.min.js' });
