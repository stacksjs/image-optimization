/**
 * Crosswind config for the image-optimization app.
 *
 * Content paths are resolved against this file's own directory rather than
 * `process.cwd()`. The dev server loads this config but Crosswind's content
 * scanner resolves relative globs against the Bun process cwd — anchoring
 * to `import.meta.dir` makes the config portable.
 */
import { resolve } from 'node:path'

export default {
  content: [
    resolve(import.meta.dir, 'pages/**/*.stx'),
    resolve(import.meta.dir, 'components/**/*.stx'),
  ],
}
