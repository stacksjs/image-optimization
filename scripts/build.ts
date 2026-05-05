#!/usr/bin/env bun
/**
 * Build the static site.
 *
 * Wraps buildApp() instead of `stx build` because the CLI hardcodes
 * --pages=pages and forwards it to buildApp, overriding pagesDir from
 * the loaded config. Calling buildApp() directly lets the bunfig-loaded
 * .config/stx.ts (pagesDir, publicDir, etc.) drive the build.
 */

import { buildApp } from '@stacksjs/stx'

const result = await buildApp()

if (result.ssg && result.ssg.failedCount > 0)
  process.exit(1)
