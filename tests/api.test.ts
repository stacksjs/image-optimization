import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, symlink, readdir } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import png from '@stacksjs/ts-png'
import handle, { MAX_BYTES } from '../src/api'

const root = mkdtempSync(join(tmpdir(), 'imageoptimization-api-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const request = (path: string) => new Request(`http://127.0.0.1/optimize?path=${encodeURIComponent(path)}`, { method: 'POST' })

test('saves complete, smaller copies concurrently without changing originals or replacing existing outputs', async () => {
  const path = join(root, 'photo.png')
  const bytes = png.sync.write({ width: 64, height: 64, data: Buffer.alloc(16384, 255), gamma: 0 }, { deflateLevel: 0 })
  await Bun.write(path, bytes)
  await Bun.write(join(root, 'photo.optimized.png'), 'existing data')
  const results = await Promise.all([handle(request(path)), handle(request(path))])
  const outputs: string[] = []
  for (const result of results) {
    expect(result!.status).toBe(200)
    const meta = JSON.parse(decodeURIComponent(result!.headers.get('x-stx-result')!))
    expect(meta.wrote).toBe(true)
    expect(meta.outputSize).toBeLessThan(bytes.length)
    outputs.push(meta.outputPath)
    expect(png.sync.read(Buffer.from(await Bun.file(meta.outputPath).arrayBuffer())).data).toEqual(png.sync.read(bytes).data)
  }
  expect(outputs[0]).not.toBe(outputs[1])
  expect(await Bun.file(path).bytes()).toEqual(new Uint8Array(bytes))
  expect(await Bun.file(join(root, 'photo.optimized.png')).text()).toBe('existing data')
  expect((await readdir(root)).some(name => name.startsWith('.imageoptimization-'))).toBe(false)
})

test('rejects symlinks, directories, relative paths and oversized uploads', async () => {
  const alias = join(root, 'alias.png')
  await symlink(join(root, 'photo.png'), alias)
  for (const path of [alias, root, 'relative.png']) expect((await handle(request(path)))!.status).toBe(400)
  const tooLarge = new Request('http://127.0.0.1/optimize', { method: 'POST', headers: { 'content-length': String(MAX_BYTES + 1) } })
  expect((await handle(tooLarge))!.status).toBe(413)
  expect((await handle(new Request('http://127.0.0.1/optimize')))!.status).toBe(405)
})

test('failed codec work reports an error and creates no output', async () => {
  const path = join(root, 'broken.jpg')
  const bytes = new Uint8Array([255,216,255,254])
  await Bun.write(path, bytes)
  expect((await handle(request(path)))!.status).toBe(422)
  expect(await Bun.file(path).bytes()).toEqual(bytes)
  expect(await Bun.file(join(root, 'broken.optimized.jpg')).exists()).toBe(false)
})

test('saves atomically in a chosen output folder and rejects relative or symlink destinations', async () => {
  const source = join(root, 'frame.png')
  const destination = join(root, 'chosen-output')
  await mkdir(destination)
  const bytes = png.sync.write({ width: 32, height: 32, data: Buffer.alloc(4096, 255), gamma: 0 }, { deflateLevel: 0 })
  await Bun.write(source, bytes)
  const targetRequest = (folder: string) => new Request(`http://127.0.0.1/optimize?path=${encodeURIComponent(source)}&outputDirectory=${encodeURIComponent(folder)}`, { method: 'POST' })
  const response = await handle(targetRequest(destination))
  expect(response!.status).toBe(200)
  const meta = JSON.parse(decodeURIComponent(response!.headers.get('x-stx-result')!))
  expect(meta.outputPath).toBe(join(destination, 'frame.optimized.png'))
  expect(png.sync.read(Buffer.from(await Bun.file(meta.outputPath).bytes())).data).toEqual(png.sync.read(bytes).data)
  expect(await Bun.file(source).bytes()).toEqual(new Uint8Array(bytes))
  expect(await Bun.file(join(root, 'frame.optimized.png')).exists()).toBe(false)
  expect((await handle(targetRequest('relative-output')))!.status).toBe(400)
  const alias = join(root, 'output-alias')
  await symlink(destination, alias)
  expect((await handle(targetRequest(alias)))!.status).toBe(400)
  expect((await readdir(destination)).some(name => name.startsWith('.imageoptimization-'))).toBe(false)
})


test('preserves Unicode names and reserved URL characters through the native API', async () => {
  const path = join(root, 'фото 🌿 #1 & preview.png')
  const bytes = png.sync.write({ width: 16, height: 16, data: Buffer.alloc(1024, 255), gamma: 0 }, { deflateLevel: 0 })
  await Bun.write(path, bytes)
  const response = await handle(request(path))
  expect(response!.status).toBe(200)
  const result = JSON.parse(decodeURIComponent(response!.headers.get('x-stx-result')!))
  expect(result.outputPath).toBe(join(root, 'фото 🌿 #1 & preview.optimized.png'))
  expect(png.sync.read(Buffer.from(await Bun.file(result.outputPath).bytes())).data).toEqual(png.sync.read(bytes).data)
  expect(await Bun.file(path).bytes()).toEqual(new Uint8Array(bytes))
})
