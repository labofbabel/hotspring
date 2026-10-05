// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Helpers for the "copy code" feature — turning a live document back into the
// chain source that would recreate it.

/** Format an opts object as a JS object literal, omitting the given keys. */
export function fmtOpts(opts, omit = ['width']) {
  const entries = Object.entries(opts).filter(([k]) => !omit.includes(k) && opts[k] !== undefined);
  if (!entries.length) return '';
  return '{ ' + entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ') + ' }';
}
