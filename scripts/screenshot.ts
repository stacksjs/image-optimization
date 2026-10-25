#!/usr/bin/env bun
import { Buffer } from 'node:buffer'
import { resolve } from 'node:path'
import png from '@stacksjs/ts-png'
import { decode, encode } from 'ts-jpeg'

const source = process.argv[2]
if (!source) throw new Error('Usage: bun run screenshot /absolute/path/to/native-capture')
const output = resolve('.github/art/mac-app-store.jpg')
if (resolve(source) === output) throw new Error('Keep the original capture separate from the exported screenshot')
const bytes = await Bun.file(source).bytes()
// Capture tools may return JPEG bytes regardless of the requested filename.
// Decode the actual format and export a baseline JFIF through our codec.
const pixels = Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ? png.sync.read(Buffer.from(bytes))
  : decode(bytes)
await Bun.write(output, encode(pixels, 95).data)
console.log(`Exported ${pixels.width}×${pixels.height} native screenshot: ${output}`)
