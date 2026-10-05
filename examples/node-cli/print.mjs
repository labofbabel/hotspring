// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createCanvas } from 'canvas';
import { Document, setCanvasFactory } from 'hotspring';
import { CupsTransport } from 'hotspring/transports/cups';

setCanvasFactory(createCanvas);

const [id = '1234', summary = 'Two coffees'] = process.argv.slice(2);
const doc = new Document({ width: 576, spacing: 8 })
  .text(`ORDER #${id}`, { size: 32, align: 'center', bold: true })
  .hr({ thickness: 2 })
  .text(summary, { size: 20 })
  .cut();

const printer = new CupsTransport({ printer: 'PrinterCMD_ESCPO_POS80_Printer_USB' });
const status = await printer.status();
if (!status.configured) throw new Error('Thermal-printer queue is not configured');
if (status.connected === false || status.offline) throw new Error('Thermal printer is not connected');

const submission = await printer.write(doc.toBytes());
console.log(`Accepted by CUPS: ${submission.jobId || submission.message}`);
