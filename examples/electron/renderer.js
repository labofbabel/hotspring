// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// This file runs in the Electron renderer and assumes a normal bundler setup.
import { receipt } from './template.js';

export async function printOrder(order) {
  const status = await window.thermalPrinter.status();
  if (!status.configured) throw new Error('Thermal-printer queue is not configured');
  if (status.connected === false || status.offline) throw new Error('Thermal printer is not connected');
  return window.thermalPrinter.print(receipt(order).toBytes());
}
