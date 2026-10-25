import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import png from '@stacksjs/ts-png'
import { encode, decode } from 'ts-jpeg'
import { optimize, detectFormat } from '../src/optimize'

test('PNG saves bytes with identical pixels', async () => {
  const input = png.sync.write({ width: 64, height: 64, data: Buffer.alloc(16384, 255), gamma: 0 }, { deflateLevel: 0 })
  const result = await optimize(input)
  expect(result.saved).toBeGreaterThan(0)
  expect(png.sync.read(Buffer.from(result.bytes)).data).toEqual(png.sync.read(input).data)
  expect((await optimize(result.bytes)).passthrough).toBe(true)
})

test('JPEG remains lossless and malformed known formats fail visibly', async () => {
  const encoded = new Uint8Array(encode({ width: 2, height: 2, data: new Uint8Array(16).fill(255) }, 90).data)
  const input = new Uint8Array(Buffer.concat([encoded.subarray(0, 2), Buffer.from([255,254,0,7,72,101,108,108,111]), encoded.subarray(2)]))
  const result = await optimize(input)
  expect(result.saved).toBe(9)
  expect(decode(result.bytes).data).toEqual(decode(input).data)
  await expect(optimize(new Uint8Array([255,216,255,254]), '.jpg')).rejects.toThrow()
})

test('SVG preserves text and attribute whitespace', async () => {
  const input = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><!-- remove me --><text xml:space="preserve">a  b   c</text></svg>')
  const result = await optimize(input)
  expect(new TextDecoder().decode(result.bytes)).toContain('a  b   c')
  expect(result.saved).toBeGreaterThan(0)
})

test('does not misidentify XML and generic HEIF as optimizable images', () => {
  expect(detectFormat(new TextEncoder().encode('<?xml version="1.0"?><document/>'))).toBe('unknown')
  expect(detectFormat(new Uint8Array([0,0,0,16,102,116,121,112,109,105,102,49,0,0,0,0]))).toBe('unknown')
})

test('WebP re-encoding preserves RGBA pixels without an external encoder', async () => {
  const webp = await import('@stacksjs/ts-webp')
  const input = webp.encode({ width: 4, height: 4, data: new Uint8Array(64).fill(255) }, { lossless: true, backend: 'pure-ts' })
  const result = await optimize(input)
  expect(webp.decode(result.bytes).data).toEqual(webp.decode(input).data)
  expect(result.outputSize).toBeLessThanOrEqual(input.length)
})

test('BMP optimization keeps every pixel and does not grow the file', async () => {
  const bmp = await import('@stacksjs/ts-bmp')
  const input = bmp.encode({ width: 8, height: 8, data: new Uint8Array(256).fill(255) }, { bitsPerPixel: 32 })
  const result = await optimize(input)
  expect(result.outputSize).toBeLessThan(input.length)
  expect(bmp.decode(result.bytes).data).toEqual(bmp.decode(input).data)
})

test('animated GIF retains its canvas, finite loop and decoded frame', async () => {
  const gif = await import('ts-gif')
  const buffer = Buffer.alloc(8192)
  const writer = new gif.Writer(buffer, 20, 20, { palette: Array.from({ length: 256 }, (_, i) => i * 0x010101), loop: 3 })
  writer.addFrame(2, 2, 2, 2, new Uint8Array([0,1,1,0]), { delay: 8, disposal: 2 })
  writer.addFrame(3, 3, 2, 2, new Uint8Array([1,0,0,1]), { delay: 12, disposal: 1 })
  writer.end()
  const input = buffer.subarray(0, writer.getOutputBufferPosition())
  const result = await optimize(input)
  const before = new gif.Reader(input)
  const after = new gif.Reader(Buffer.from(result.bytes))
  expect(after.getWidth()).toBe(20)
  expect(after.getHeight()).toBe(20)
  expect(after.getLoopCount()).toBe(3)
  expect(result.saved).toBeGreaterThan(0)
  for (let i = 0; i < 2; i++) {
    const a = Buffer.alloc(1600)
    const b = Buffer.alloc(1600)
    before.decodeAndBlitFrameRGBA(i, a)
    after.decodeAndBlitFrameRGBA(i, b)
    expect(b).toEqual(a)
  }
})

test('AVIF container optimization keeps the decoded image', async () => {
  const avif = await import('@stacksjs/ts-avif')
  const encoded = avif.encode({ width: 2, height: 2, data: new Uint8Array([255,0,0,0, 0,255,0,85, 0,0,255,170, 255,255,255,255]) }, { quality: 85 })
  const padding = Buffer.alloc(1032)
  padding.writeUInt32BE(padding.length, 0)
  padding.write('free', 4)
  const input = new Uint8Array(Buffer.concat([encoded, padding]))
  const result = await optimize(input)
  expect(result.saved).toBeGreaterThan(0)
  expect(avif.decode(result.bytes).data).toEqual(avif.decode(input).data)
})

test('GIF optimization preserves colors from a frame-local palette', async () => {
  const gif = await import('ts-gif')
  const buffer = Buffer.alloc(8192)
  const writer = new gif.Writer(buffer, 2, 1, { palette: [0, 0xFFFFFF] })
  writer.addFrame(0, 0, 2, 1, new Uint8Array([0, 1]), { palette: [0xFF0000, 0x00FF00, ...Array(254).fill(0)] })
  writer.end()
  const result = await optimize(buffer.subarray(0, writer.getOutputBufferPosition()))
  expect(result.saved).toBeGreaterThan(0)
  const pixels = Buffer.alloc(8)
  new gif.Reader(Buffer.from(result.bytes)).decodeAndBlitFrameRGBA(0, pixels)
  expect([...pixels]).toEqual([255, 0, 0, 255, 0, 255, 0, 255])
})
