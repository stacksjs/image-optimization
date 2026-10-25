import { afterAll, expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import png from '@stacksjs/ts-png'
import { decode, encode } from 'ts-jpeg'

const root = mkdtempSync(join(tmpdir(), 'imageoptimization-artwork-'))
const exporter = resolve(import.meta.dir, '../scripts/screenshot.ts')
afterAll(() => rmSync(root, { recursive: true, force: true }))

test('exports real PNG and mislabeled JPEG captures as baseline JFIF without changing originals', async () => {
  const pixels = { width: 16, height: 8, data: Buffer.alloc(16 * 8 * 4, 255), gamma: 0 }
  const captures = [png.sync.write(pixels), encode(pixels, 95).data]
  for (const [index, original] of captures.entries()) {
    const cwd = join(root, String(index))
    const source = join(cwd, 'capture.png')
    await Bun.write(source, original)
    const child = Bun.spawn([process.execPath, exporter, source], { cwd, stdout: 'pipe', stderr: 'pipe' })
    const error = await new Response(child.stderr).text()
    expect(await child.exited, error).toBe(0)
    const output = await Bun.file(join(cwd, '.github/art/mac-app-store.jpg')).bytes()
    expect(Buffer.from(output.subarray(6, 11)).toString()).toBe('JFIF\0')
    const decoded = decode(output)
    expect([decoded.width, decoded.height]).toEqual([16, 8])
    expect(await Bun.file(source).bytes()).toEqual(new Uint8Array(original))
  }
})
