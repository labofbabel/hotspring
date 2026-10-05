// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Browser entry point. Bundle this file with the rest of your local web app.
import { Document } from 'hotspring';

function receipt(order) {
  return new Document({ width: 576, spacing: 8 })
    .text(`ORDER #${order.id}`, { size: 32, align: 'center', bold: true })
    .hr({ thickness: 2 })
    .text(order.summary, { size: 20 })
    .qr(order.url, { ecl: 'M' })
    .cut();
}

export async function printOrder(order) {
  const status = await fetch('/status').then((response) => response.json());
  if (!status.configured) throw new Error('Thermal-printer queue is not configured');
  if (status.connected === false || status.offline) throw new Error('Thermal printer is not connected');

  const response = await fetch('/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: receipt(order).toBytes(),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Print request failed');
  return result.submission;
}
