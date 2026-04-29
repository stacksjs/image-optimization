# image-optimization

A native-style image-optimization app modelled on [ImageOptim](https://imageoptim.com),
built with [stx](https://github.com/stacksjs/stx) + [Bun](https://bun.sh) and
pure-TypeScript image libraries (`ts-png`, `ts-jpeg`, `ts-webp`, `ts-bmp`,
`ts-gif`, `ts-avif`) — **no runtime deps beyond Bun and the `ts-*` libs**.

```
┌──────────────────────────────────────────────────────────┐
│ ●●●            ImageOptimization                         │
├──────────────────────────────────────────────────────────┤
│  cover.jpg     84.2 KB   21.0 KB   −75.0%  ⬇  ✕         │
│  hero.png       1.2 MB    872 KB   −28.4%  ⬇  ✕         │
│  banner.gif      62 KB    21 KB    −64.9%  ⬇  ✕         │
│                                                ┌────┐    │
│                                                │ ↓  │    │
│                                                └────┘    │
├──────────────────────────────────────────────────────────┤
│  +  3 files · saved 1.4 MB (66.2%)            ⋯  ↻ Again │
└──────────────────────────────────────────────────────────┘
```

## Run it

```bash
bun run dev          # browser
bun run dev:native   # native Craft window (macOS)
```

The `--native` flag relies on:

- `@stacksjs/desktop` being built in the local stx repo
- the `craft` binary on your `$PATH` (or at `~/.bun/bin/craft` /
  `CRAFT_BINARY_PATH=…`)

If `--native` can't find a craft binary, it transparently falls back to
opening the system browser at the dev URL.

## Layout

```
image-optimization/
├── pages/
│   └── index.stx           — the ImageOptim UI (drop zone, list, toolbar)
├── components/
│   ├── DropZone.stx        — full-window drop target
│   ├── Toolbar.stx         — bottom action bar
│   └── FileRow.stx         — per-file row template
├── optimize.ts             — magic-byte format detection → per-format pipeline
├── stx.config.ts           — registers /optimize via apiRoutes
├── crosswind.config.ts     — content paths for utility-class generation
└── package.json
```

## Architecture

```
┌─────────────────────────────────────┐
│  Craft native window (WKWebView)     │  ← UI
│   (or system browser w/o --native)   │
└────────────────┬────────────────────┘
                 │ fetch /optimize
                 ▼
┌─────────────────────────────────────┐
│  stx dev server (Bun.serve)          │  ← server
│   ├ /         → pages/index.stx      │
│   └ /optimize → apiRoutes (config)   │
└────────────────┬────────────────────┘
                 │ dispatch by magic bytes
                 ▼
┌──────────────────────────────────────────────────────────┐
│  ts-png · ts-jpeg · ts-webp · ts-bmp · ts-gif · ts-avif  │  ← image libs
│   (pure TS, zero runtime deps)                            │
└──────────────────────────────────────────────────────────┘
```

## Format coverage

| Format | Strategy                                                                   |
| ------ | -------------------------------------------------------------------------- |
| PNG    | decode → re-deflate at level 9 across 4 strategies, keep smallest          |
| JPEG   | decode → re-encode at q=85 (note: drops EXIF / orientation)                |
| WebP   | decode → re-encode lossless                                                |
| BMP    | decode → re-encode (drops alpha when fully opaque)                         |
| SVG    | text minify, CDATA-aware                                                   |
| GIF    | palette tightening per-frame + global-palette consolidation (lossless)     |
| AVIF   | ISOBMFF re-mux: strip Exif/XMP/`mime` items, thumbnails, redundant brands  |
| TIFF · ICO · HEIC | detected and reported, no optimizer yet (passthrough w/ note)   |

Output is only kept when smaller than the input — already-optimized files
come back unchanged with `passthrough: true` in `x-stx-result`.

## UX

- **Drag and drop** any number of images onto the window
- **Click `+`** to pick files via the system dialog
- **Per-row download** button to save the optimized bytes
- **Per-row remove** button to drop a file from the list
- **Toolbar summary** shows total bytes saved across all rows in real time
- **`Again`** button re-runs the optimizer on every file (useful after a
  settings change)
- After the first drop the **drop zone shrinks into the corner** but stays
  interactive — you can keep dropping files into it
- **Errors surface in the toolbar in red** so failures aren't silent

## Notes on dependencies

The image libs are imported by relative path from `~/Code/Libraries/ts-*`,
and stx itself is invoked via the local repo at `~/Code/Tools/stx/stx`.
This mirrors how the example in the stx monorepo is wired up — the libs
remain editable in place rather than being copied into `node_modules`.
