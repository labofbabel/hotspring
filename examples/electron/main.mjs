// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Import this module from your existing Electron main process.
import { ipcMain } from 'electron';
import { CupsTransport } from 'hotspring/transports/cups';

const printer = new CupsTransport({ printer: 'PrinterCMD_ESCPO_POS80_Printer_USB' });

ipcMain.handle('thermal-printer:status', () => printer.status());
ipcMain.handle('thermal-printer:print', (_event, bytes) => printer.write(Uint8Array.from(bytes)));
ipcMain.handle('thermal-printer:cancel', (_event, jobId) => printer.cancel(jobId));
