// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('thermalPrinter', {
  status: () => ipcRenderer.invoke('thermal-printer:status'),
  print: (bytes) => ipcRenderer.invoke('thermal-printer:print', bytes),
  cancel: (jobId) => ipcRenderer.invoke('thermal-printer:cancel', jobId),
});
