<p align="center"><img src=".github/art/cover.jpg" alt="image-optimization — native-style image optimization, built on stx + Bun"></p>

[![GitHub Actions][github-actions-src]][github-actions-href]
[![License][license-src]][license-href]
[![Made with stx][stx-badge-src]][stx-badge-href]

# image-optimization

A native-style image-optimization app modelled on [ImageOptim](https://imageoptim.com), built with [stx](https://github.com/stacksjs/stx) + [Bun](https://bun.sh) and our pure-TypeScript image libraries.

**No runtime dependencies beyond Bun and the `ts-*` libs** — every codec is in-process TypeScript:

| Format | Library |
|--------|---------|
| PNG    | [`@stacksjs/ts-png`](https://github.com/stacksjs/ts-png) |
| JPEG   | [`ts-jpeg`](https://github.com/stacksjs/ts-jpeg) |
| WebP   | [`@stacksjs/ts-webp`](https://github.com/stacksjs/ts-webp) |
| BMP    | [`@stacksjs/ts-bmp`](https://github.com/stacksjs/ts-bmp) |
| GIF    | [`ts-gif`](https://github.com/stacksjs/ts-gif) |
| AVIF   | [`@stacksjs/ts-avif`](https://github.com/stacksjs/ts-avif) |
| SVG    | text minify (CDATA-aware) |

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

## Install

Download the latest `.dmg` from [Releases](https://github.com/stacksjs/image-optimization/releases/latest), drag the `.app` into `/Applications`, done.

## Run from source

```bash
bun run setup        # provision system + JS deps (pantry install + bun install)
bun run dev          # browser
bun run dev:native   # native Craft window (macOS)
```

Bun is the only system requirement — declared in `deps.yaml` and provisioned by [pantry](https://github.com/home-lang/pantry) when you run `pantry install` (or `bun run setup`). Everything else is a regular `package.json` dependency.

The `--native` flag relies on:

- `@stacksjs/desktop` being built in the local stx repo
- the `craft` binary on your `$PATH` (or at `~/.bun/bin/craft` / `CRAFT_BINARY_PATH=…`)

If `--native` can't find a craft binary, it transparently falls back to opening the system browser at the dev URL.

## Distribution

### `.dmg` builds

Pushing a `v*` tag triggers `.github/workflows/release.yml` which:

1. Spins up a **macOS** runner
2. Uses **pantry** to provision `bun` + `craft-native.org` (the native shell binary) — declared in [`deps.yaml`](./deps.yaml)
3. Builds the stx site with `bun run build`
4. Calls `packageApp()` from [`@craft-native/craft`](https://github.com/stacksjs/craft) to produce a signed-or-unsigned `.app` and a `.dmg` (via `hdiutil`)
5. Uploads the `.dmg` to the GitHub Release via [`stacksjs/action-releaser`](https://github.com/stacksjs/action-releaser)

The packaging logic lives in [`scripts/package.ts`](./scripts/package.ts). To package locally:

```bash
bun run build:dmg
# → dist/ImageOptimization-<version>.dmg
```

Optional code-signing / notarization: provide `APPLE_SIGN_IDENTITY`, `APPLE_ID`, and `APPLE_APP_PASSWORD` as repo secrets and the workflow forwards them to `packageApp`.

### Pantry registry

```bash
bun run release:patch   # 0.0.1 → 0.0.2 → tag → workflow runs → DMG on Releases
bun run release:minor   # 0.0.x → 0.1.0 → tag → workflow runs → DMG on Releases
```

Continuous-release tarballs are also published to the pantry registry at `registry.pantry.dev` on every push to `main` (see [`ci.yml`](./.github/workflows/ci.yml)). Auth: `PANTRY_REGISTRY_TOKEN` repo secret.

## Architecture

```
┌──────────────────────────────────────┐
│  Craft native window (WKWebView)     │  ← UI
│   (or system browser w/o --native)   │
└────────────────┬─────────────────────┘
                 │ fetch /optimize
                 ▼
┌──────────────────────────────────────┐
│  stx dev server (Bun.serve)          │  ← server
│   ├ /         → pages/index.stx      │
│   └ /optimize → apiRoutes (config)   │
└────────────────┬─────────────────────┘
                 │ dispatch by magic bytes
                 ▼
┌──────────────────────────────────────────────────────────┐
│  ts-png · ts-jpeg · ts-webp · ts-bmp · ts-gif · ts-avif  │  ← image libs
│   (pure TS, zero runtime deps)                            │
└──────────────────────────────────────────────────────────┘
```

## Format coverage

| Format | Strategy |
|--------|----------|
| PNG    | decode → re-deflate at level 9 across 4 strategies, keep smallest |
| JPEG   | decode → re-encode at q=85 (note: drops EXIF / orientation) |
| WebP   | decode → re-encode lossless |
| BMP    | decode → re-encode (drops alpha when fully opaque) |
| SVG    | text minify, CDATA-aware |
| GIF    | palette tightening per-frame + global-palette consolidation (lossless) |
| AVIF   | ISOBMFF re-mux: strip Exif/XMP/`mime` items, thumbnails, redundant brands |
| TIFF · ICO · HEIC | detected and reported, no optimizer yet (passthrough w/ note) |

Output is only kept when smaller than the input — already-optimized files come back unchanged with `passthrough: true` in `x-stx-result`.

## UX

- **Drag and drop** any number of images onto the window
- **Click `+`** to pick files via the system dialog
- **Per-row download** to save the optimized bytes
- **Per-row remove** to drop a file from the list
- **Toolbar summary** shows total bytes saved across all rows in real time
- **`Again`** re-runs the optimizer on every file (useful after a settings change)
- After the first drop, the **drop zone shrinks into the corner** but stays interactive
- **Errors surface in the toolbar in red** so failures aren't silent

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
├── scripts/
│   └── package.ts          — builds .app + .dmg via @craft-native/craft
├── stx.config.ts           — registers /optimize via apiRoutes
├── crosswind.config.ts     — content paths for utility-class generation
├── deps.yaml               — pantry-provisioned system deps (bun, craft)
└── package.json
```

## Notes on dependencies

The image libs are imported by relative path from `~/Code/Libraries/ts-*`, and stx itself is invoked via the local repo at `~/Code/Tools/stx/stx`. This mirrors how the example in the stx monorepo is wired up — the libs remain editable in place rather than being copied into `node_modules`.

## License

MIT — see [LICENSE](./LICENSE.md)

<!-- Badges -->

[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/image-optimization/ci.yml?branch=main&style=flat&colorA=18181B&colorB=4F46E5
[github-actions-href]: https://github.com/stacksjs/image-optimization/actions/workflows/ci.yml
[license-src]: https://img.shields.io/github/license/stacksjs/image-optimization.svg?style=flat&colorA=18181B&colorB=4F46E5
[license-href]: ./LICENSE.md
[stx-badge-src]: https://img.shields.io/badge/built%20with-stx-4F46E5?style=flat&colorA=18181B
[stx-badge-href]: https://github.com/stacksjs/stx
