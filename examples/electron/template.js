// Copyright (c) 2026 Lior Ben-Gai
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Document } from 'hotspring';

export function receipt(order) {
  return new Document({ width: 576, spacing: 8 })
    .text(`ORDER #${order.id}`, { size: 32, align: 'center', bold: true })
    .hr({ thickness: 2 })
    .text(order.summary, { size: 20 })
    .qr(order.url)
    .cut();
}
