#!/usr/bin/env bun
/**
 * Build the `.dmg` for image-optimization.
 *
 * Pipeline:
 *   1. `stx build`   — produces the static site that the native window loads
 *   2. resolve craft — the native shell binary, installed by pantry from
 *                      `craft-native.org` (see deps.yaml)
 *   3. packageApp()  — wraps craft + the built site into `<name>.app` and
 *                      then a `<name>-<version>.dmg` (via `hdiutil`)
 *
 * Invoked from CI by `.github/workflows/release.yml` on `v*` tags. Locally:
 *   bun run build:dmg
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { packageApp } from '@craft-native/craft'
import pkg from '../package.json' with { type: 'json' }

const ROOT = resolve(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'dist')

function findCraftBinary(): string {
  // 1) Explicit override (CI sets this so we fail loud if pantry didn't run).
  if (process.env.CRAFT_BINARY_PATH && existsSync(process.env.CRAFT_BINARY_PATH))
    return process.env.CRAFT_BINARY_PATH

  // 2) Pantry installs craft into the PATH; try the canonical locations
  //    before falling back to whichever `craft` is on PATH.
  const candidates = [
    join(process.env.HOME ?? '', '.bun/bin/craft'),
    join(process.env.HOME ?? '', '.pantry/bin/craft'),
    '/usr/local/bin/craft',
    '/opt/homebrew/bin/craft',
  ]
  for (const c of candidates) {
    if (c && existsSync(c))
      return c
  }

  throw new Error(
    'Could not locate the `craft` binary. Run `pantry install` (or set CRAFT_BINARY_PATH) before packaging.',
  )
}

async function main(): Promise<void> {
  const binaryPath = findCraftBinary()
  console.log(`📦 Packaging image-optimization v${pkg.version}`)
  console.log(`   craft: ${binaryPath}`)

  // packageApp() handles: macOS .app bundle creation (Info.plist, Resources,
  // MacOS/), DMG creation via hdiutil, optional code-sign + notarize.
  const results = await packageApp({
    name: 'ImageOptimization',
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    homepage: 'https://github.com/stacksjs/image-optimization',
    binaryPath,
    outDir: OUT_DIR,
    bundleId: 'org.stacksjs.image-optimization',
    platforms: ['macos'],
    macos: {
      dmg: true,
      pkg: false,
      // Forwarded from CI when the secrets are present. Without them
      // packageApp produces an unsigned .dmg — usable, but Gatekeeper
      // will quarantine it on download.
      signIdentity: process.env.APPLE_SIGN_IDENTITY,
      notarize: Boolean(process.env.APPLE_ID && process.env.APPLE_APP_PASSWORD),
      appleId: process.env.APPLE_ID,
      applePassword: process.env.APPLE_APP_PASSWORD,
    },
  })

  let allOk = true
  for (const r of results) {
    if (r.success)
      console.log(`   ✓ ${r.platform}/${r.format}: ${r.outputPath}`)
    else {
      console.error(`   ✗ ${r.platform}/${r.format}: ${r.error}`)
      allOk = false
    }
  }

  if (!allOk)
    process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
