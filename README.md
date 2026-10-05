# hotspring.js

Zero-dependency JavaScript library for composing thermal-printer documents and
rendering them to 1-bit ESC/POS. Built for 203 dpi ESC/POS printers (POS58 / POS80).

A document is a vertical stack of components (text, images, tables, QR codes,
rules), each painted to a 1-bit canvas and converted to printer bytes.

## Workbench

`index.html` is the project homepage, a visual document designer, a code
generator, and a local print hub. It runs on the same `dist/` bundle you vendor,
so it also works as a starting point for your own printing app.

```sh
npm install
npm start      # builds dist/, serves http://localhost:4000
```

`PORT` sets the port; `PRINTER` sets the CUPS queue.

## Workflow

1. **Design** in the workbench. Print test pages until it looks right; add a
   **Calibration** component to tune dither and gamma for your printer.
2. **Copy code.** You get plain JavaScript:

   ```js
   import { Document } from 'hotspring';

   const doc = new Document({ width: 576, spacing: 6 });
   doc
     .text("ORDER #1042", { font: "Pixel Operator", size: 32, align: "center" })
     .qr("https://example.com/o/1042")
     .cut();

   const bytes = doc.toBytes();
   ```

3. **Replace sample values with your data:**

   ```js
   import { Document, registerBundledFonts } from 'hotspring';

   await registerBundledFonts();

   export const receipt = (order) => new Document({ width: 576, spacing: 6 })
     .text(`ORDER #${order.id}`, { font: 'Pixel Operator', size: 32, align: 'center' })
     .qr(order.url)
     .cut();
   ```

4. **Print:** send `receipt(order).toBytes()` to the printer (see [Printing](#printing)).

**Paste code** loads copied code back into the workbench for editing. It parses
the code without running it, so keep an unmodified copy alongside your edited
version. Image files are not stored in the code and must be added again.

## Install

### Vendoring (canonical)

Copy at most two files into your project. Neither has dependencies.

| Copy | Runs in | Import |
|---|---|---|
| `dist/hotspring.esm.min.js` | browser / Electron renderer | `import { Document, registerBundledFonts } from './vendor/hotspring.esm.min.js'` |
| `src/transports/cups.js` (only if you print via CUPS) | Node / Electron main | `import { CupsTransport } from './vendor/cups.js'` |

- For a classic `<script>` tag, use `dist/hotspring.min.js` instead of the ESM
  file; it exposes a global `Hotspring`.
- Pixel Operator is embedded in the bundle, so no font files are needed and it
  works offline.
- Keep the license header at the top of each file.
- `.map` files are optional. The bundle doesn't reference them.
- To upgrade, replace the files. The version is in the bundle's header comment.

```html
<script src="hotspring.min.js"></script>
<script>
  Hotspring.registerBundledFonts().then(() => {
    const doc = new Hotspring.Document({ width: 576 }).text('Hello').cut();
    document.body.append(doc.toCanvas());
  });
</script>
```

### npm from GitHub

```sh
npm install github:labofbabel/hotspring#v0.2.0
```

## API

```js
const doc = new Document({ width: 576, spacing: 8, cutFeed: 120 })
  .text('Hello', { font: 'Pixel Operator', size: 24, align: 'center', bold: true })
  .image(img, { algo: 'atkinson', gamma: 1.3 })
  .table('Item,Qty\nWidget,2', { header: true })
  .qr('https://example.com', { ecl: 'M' })
  .hr({ thickness: 3 })
  .spacer(24)
  .calibration()
  .cut();

doc.toBytes();   // Uint8Array of ESC/POS
doc.toCanvas();  // preview
doc.toCode();    // source, as Copy code produces
parseTemplateCode(source);  // what Paste code uses; safe, no eval
```

- `width`: dots, multiple of 8. Paper: 58 mm = 384, 76 mm = 512, 80 mm = 576.
- `spacing`: dots before and after each component. `cutFeed`: dots fed before a cut.
- There is no automatic cut; add `.cut()` where you want one.
- `toBytes()` throws on missing images, empty QR data, and empty tables.

## Fonts

| Font | How |
|---|---|
| Pixel Operator, Pixel Operator Mono | `await registerBundledFonts()` (embedded) |
| `monospace`, `sans-serif`, `serif` | nothing needed; `text()` defaults to `monospace` |
| Your own | `await registerFont(name, { url })` or `registerFontFromFile(file)` |

Register a font before rendering with it, or the canvas silently substitutes
another. Pass `grid: 8` for bitmap fonts so sizes snap to crisp multiples.

## Printing

`toBytes()` returns raw ESC/POS. How you deliver it depends on where you run:

| Environment | How | Example |
|---|---|---|
| Browser | POST bytes to a localhost backend (browsers can't reach CUPS) | `examples/local-web`, `server.mjs` |
| Electron | Render in the renderer; `CupsTransport` in the main process via IPC | `examples/electron` |
| Node CLI | `setCanvasFactory(createCanvas)` from `canvas`, then `CupsTransport` | `examples/node-cli` |

```js
import { CupsTransport } from 'hotspring/transports/cups';

const printer = new CupsTransport({ printer: 'My_POS80' });
await printer.status();               // { configured, connected, offline, jobs, ... }
await printer.write(doc.toBytes());   // returns the CUPS job ID
```

A job ID means CUPS accepted the job, not that it printed.

`server.mjs` (the workbench backend) binds to `127.0.0.1` only and rejects
cross-origin requests: `POST /print` (raw bytes), `GET /status`, and
`POST /cancel` / `POST /reset` (JSON). Don't expose it to a network.

## Building on the workbench

Copy `index.html`, `dist/hotspring.esm.min.js`, `server.mjs`, and
`src/transports/cups.js`, then edit `index.html` as you like.

## Develop

```sh
npm test              # source tests, build, bundle tests
npm run build         # writes dist/
npm run embed-fonts   # regenerate the embedded font module
```

The workbench uses `dist/`, so rebuild (or restart `npm start`) after editing `src/`.

## License

[MPL-2.0](LICENSE) © 2026 Lior Ben-Gai. Use it in any project, open or closed.
If you distribute modified Hotspring files, those files stay MPL-2.0. Third-party
notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
