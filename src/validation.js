// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Small shared validators for public document/block options. Keeping these
// messages consistent makes invalid templates fail at their source.

export function finiteNumber(value, name, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (integer && !Number.isInteger(value)) throw new TypeError(`${name} must be an integer`);
  if (value < min || value > max) {
    const range = min !== -Infinity && max !== Infinity ? ` from ${min} to ${max}`
      : min !== -Infinity ? ` greater than or equal to ${min}` : ` less than or equal to ${max}`;
    throw new RangeError(`${name} must be${range}`);
  }
  return value;
}

export function positiveNumber(value, name, { integer = false } = {}) {
  finiteNumber(value, name, { integer });
  if (value <= 0) throw new RangeError(`${name} must be greater than 0`);
  return value;
}

export function oneOf(value, name, values) {
  if (!values.includes(value)) throw new RangeError(`${name} must be one of: ${values.join(', ')}`);
  return value;
}

export function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  return value;
}

export function nonEmptyString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value;
}

export function width(value, name = 'width') {
  positiveNumber(value, name, { integer: true });
  if (value % 8 !== 0) throw new RangeError(`${name} must be a multiple of 8 dots`);
  return value;
}
