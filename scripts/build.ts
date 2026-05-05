#!/usr/bin/env bun
/**
 * Build the static site. Wraps `buildApp` so that `pagesDir` is sourced
 * from `.config/stx.ts` rather than a CLI flag — `stx build` (the CLI)
 * ignores the config's pagesDir and only looks at its own `--pages`
 * flag, which would force every package.json script to repeat the path.
 *
 * `stx .` (dev) already honors the config's pagesDir, so no wrapper is
 * needed there.
 */

import { buildApp } from '@stacksjs/stx'
import stxConfig from '../.config/stx'

const result = await buildApp({
  ssg: {
    pagesDir: stxConfig.pagesDir,
  },
})

if (result.ssg && result.ssg.failedCount > 0)
  process.exit(1)
