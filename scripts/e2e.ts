#!/usr/bin/env bun
import { strict as assert } from 'node:assert'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import png from '@stacksjs/ts-png'
import * as jpeg from 'ts-jpeg'
import * as webp from '@stacksjs/ts-webp'
import * as bmp from '@stacksjs/ts-bmp'
import * as gif from 'ts-gif'
import * as avif from '@stacksjs/ts-avif'

// Exercise the shipped executable from an unrelated directory. No development
// server, project files, installed Bun or package resolution at runtime.
const bundle = resolve('dist/ImageOptimization.app')
const manifest = await Bun.file(join(bundle, 'Contents/Resources/craft.json')).json()
assert.deepEqual((await readdir(join(bundle, 'Contents/MacOS'))).sort(), ['ImageOptimization', 'stx-backend'], 'Bundle must contain exactly one Craft host and one Bun helper')
assert.equal(manifest.runtimeProfile, 'webview', 'Build with the official Craft webview profile')
const profile = Bun.spawnSync([join(bundle, 'Contents/MacOS/ImageOptimization'), '--runtime-profile'], { stdout: 'pipe', stderr: 'pipe', timeout: 10_000 })
assert.equal(profile.exitCode, 0, profile.stderr.toString())
assert.equal(profile.stdout.toString().trim(), 'webview', 'Packaged Craft runtime does not match the configured profile')
// Verify the OS requirement encoded in each executable, rather than relying
// on the bundle's advertised minimum alone.
const minimum = Bun.spawnSync(['/usr/bin/plutil', '-extract', 'LSMinimumSystemVersion', 'raw', '-o', '-', join(bundle, 'Contents/Info.plist')])
assert.equal(minimum.exitCode, 0, minimum.stderr.toString())
const advertised = minimum.stdout.toString().trim()
assert.match(advertised, /^\d+(?:\.\d+){0,2}$/)
function versionNumber(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  return major * 1_000_000 + minor * 1000 + patch
}
for (const executable of ['ImageOptimization', manifest.backend.executable]) {
  const metadata = Bun.spawnSync(['/usr/bin/xcrun', 'vtool', '-show-build', join(bundle, 'Contents/MacOS', executable)])
  assert.equal(metadata.exitCode, 0, metadata.stderr.toString())
  const versions = [...metadata.stdout.toString().matchAll(/^\s*minos\s+(\d+(?:\.\d+){0,2})/gm)]
  assert.ok(versions.length, `${executable} has no macOS deployment metadata`)
  for (const [, actual] of versions)
    assert.ok(versionNumber(actual) <= versionNumber(advertised), `${executable} requires macOS ${actual}; bundle advertises ${advertised}`)
}
const root = await mkdtemp(join(tmpdir(), 'imageoptimization-e2e-'))
const nativeStarted = performance.now()
const native = Bun.spawn([join(bundle, 'Contents/MacOS/ImageOptimization'), '--benchmark'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
const nativeOutput = new Response(native.stdout).text()
const nativeError = new Response(native.stderr).text()
let nativeTimeout: ReturnType<typeof setTimeout> | undefined
let nativeVerified = false
try {
  const code = await Promise.race([
    native.exited,
    new Promise<never>((_, reject) => { nativeTimeout = setTimeout(() => reject(new Error('Native window did not become ready')), 15000) }),
  ])
  assert.equal(code, 0, await nativeError)
  assert.ok((await nativeOutput).split('\n').includes('ready'), 'Craft did not create the native window')
  nativeVerified = true
}
finally {
  clearTimeout(nativeTimeout)
  if (native.exitCode === null) {
    native.kill('SIGTERM')
    await native.exited
  }
  if (!nativeVerified) await rm(root, { recursive: true, force: true })
}
const nativeLaunchMs = performance.now() - nativeStarted
const started = performance.now()
const child = Bun.spawn([join(bundle, 'Contents/MacOS', manifest.backend.executable), '--serve'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
try {
  const reader = child.stdout.getReader()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const first = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Native host did not start')), 5000) })]).finally(() => clearTimeout(timeout))
  const startupMs = performance.now() - started
  const session = new TextDecoder().decode(first.value).trim()
  const origin = new URL(session).origin
  assert.equal((await fetch(`${origin}/optimize`, { method: 'POST' })).status, 403)
  const login = await fetch(session, { redirect: 'manual' })
  assert.equal(login.status, 303)
  const cookie = login.headers.get('set-cookie')!.split(';')[0]
  const ui = await (await fetch(origin, { headers: { cookie } })).text()
  assert.ok(ui.includes('ImageOptimization'))
  assert.ok(!ui.includes('<script client>'))
  // The WebView evaluates classic scripts as scripts, not ES modules. Catch
  // host-only import.meta/require glue before a blank native window ships.
  for (const [, attributes, source] of ui.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type=["'](?:module|application\/[^"']+)["']/i.test(attributes)) continue
    assert.doesNotThrow(() => new Function(source), 'Packaged UI contains invalid classic-script JavaScript')
  }
  const input = png.sync.write({ width: 640, height: 480, data: Buffer.alloc(640 * 480 * 4, 255), gamma: 0.45455 }, { deflateLevel: 0 })
  const path = join(root, 'photo.png')
  await Bun.write(path, input)
  const optimizeStarted = performance.now()
  const result = await fetch(`${origin}/optimize?path=${encodeURIComponent(path)}`, { method: 'POST', headers: { cookie } })
  const optimizeMs = performance.now() - optimizeStarted
  assert.equal(result.status, 200, await result.text())
  const meta = JSON.parse(decodeURIComponent(result.headers.get('x-stx-result')!))
  assert.ok(meta.saved > 0)
  assert.ok(meta.wrote)
  const output = await Bun.file(meta.outputPath).bytes()
  assert.deepEqual(png.sync.read(Buffer.from(output)).data, png.sync.read(input).data)
  assert.equal(png.sync.read(input).gamma, 0.45455)
  assert.equal(png.sync.read(Buffer.from(output)).gamma, 0.45455, 'PNG color metadata changed')
  assert.deepEqual(await Bun.file(path).bytes(), new Uint8Array(input))
  // Exercise every codec through the compiled helper. Source tests alone
  // cannot catch missing bundled modules or runtime-only encoder failures.
  const formats: Record<string, { inputBytes: number, outputBytes: number }> = {}
  async function checkImage(name: string, bytes: Uint8Array, verify: (result: Uint8Array) => void): Promise<void> {
    const source = join(root, name)
    await Bun.write(source, bytes)
    const response = await fetch(`${origin}/optimize?path=${encodeURIComponent(source)}`, { method: 'POST', headers: { cookie } })
    assert.equal(response.status, 200, `${name}: ${await response.text()}`)
    const result = JSON.parse(decodeURIComponent(response.headers.get('x-stx-result')!))
    assert.ok(result.outputSize <= bytes.length, `${name} grew`)
    assert.equal(result.wrote, result.saved > 0, `${name} copy does not match its savings`)
    const optimized = result.wrote ? await Bun.file(result.outputPath).bytes() : bytes
    assert.equal(optimized.length, result.outputSize)
    verify(optimized)
    assert.deepEqual(await Bun.file(source).bytes(), new Uint8Array(bytes), `${name} original changed`)
    formats[name] = { inputBytes: bytes.length, outputBytes: optimized.length }
  }
  const bitmap = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(255) }
  const encodedJpeg = new Uint8Array(jpeg.encode(bitmap, 90).data)
  // A valid little-endian EXIF IFD with orientation 6 (90° clockwise).
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from([73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0])])
  const app1 = Buffer.alloc(exif.length + 4)
  app1.writeUInt16BE(0xFFE1, 0)
  app1.writeUInt16BE(exif.length + 2, 2)
  exif.copy(app1, 4)
  const commentedJpeg = Buffer.concat([encodedJpeg.subarray(0, 2), app1, Buffer.from([255, 254, 0, 7, 72, 101, 108, 108, 111]), encodedJpeg.subarray(2)])
  await checkImage('photo.jpg', commentedJpeg, bytes => {
    assert.deepEqual(jpeg.decode(bytes).data, jpeg.decode(commentedJpeg).data)
    assert.ok(Buffer.from(bytes).includes(app1), 'JPEG EXIF orientation changed')
  })
  const encodedWebp = webp.encode(bitmap, { lossless: true, backend: 'pure-ts' })
  await checkImage('photo.webp', encodedWebp, bytes => assert.deepEqual(webp.decode(bytes).data, webp.decode(encodedWebp).data))
  const encodedBmp = bmp.encode(bitmap, { bitsPerPixel: 32 })
  await checkImage('photo.bmp', encodedBmp, bytes => assert.deepEqual(bmp.decode(bytes).data, bmp.decode(encodedBmp).data))
  const gifBuffer = Buffer.alloc(8192)
  const writer = new gif.Writer(gifBuffer, 20, 20, { palette: Array.from({ length: 256 }, (_, i) => i * 0x010101), loop: 3 })
  writer.addFrame(2, 2, 2, 2, new Uint8Array([0, 1, 1, 0]), { delay: 8, disposal: 2 })
  writer.addFrame(3, 3, 2, 2, new Uint8Array([1, 0, 0, 1]), { delay: 12, disposal: 1 })
  writer.end()
  const encodedGif = gifBuffer.subarray(0, writer.getOutputBufferPosition())
  await checkImage('animation.gif', encodedGif, bytes => {
    const before = new gif.Reader(encodedGif), after = new gif.Reader(Buffer.from(bytes))
    assert.deepEqual([after.getWidth(), after.getHeight(), after.getLoopCount(), after.numFrames()], [20, 20, 3, 2])
    for (let frame = 0; frame < before.numFrames(); frame++) {
      const a = Buffer.alloc(20 * 20 * 4), b = Buffer.alloc(a.length)
      before.decodeAndBlitFrameRGBA(frame, a)
      after.decodeAndBlitFrameRGBA(frame, b)
      assert.deepEqual(b, a)
      for (const field of ['delay', 'disposal', 'transparent_index', 'interlaced'] as const)
        assert.equal(after.frameInfo(frame)[field], before.frameInfo(frame)[field])
    }
  })
  const padding = Buffer.alloc(1032)
  padding.writeUInt32BE(padding.length, 0)
  padding.write('free', 4)
  const encodedAvif = Buffer.concat([avif.encode(bitmap, { quality: 85 }), padding])
  await checkImage('photo.avif', encodedAvif, bytes => assert.deepEqual(avif.decode(bytes).data, avif.decode(encodedAvif).data))
  const broken = join(root, 'broken.jpg')
  const invalid = new Uint8Array([255, 216, 255, 254])
  await Bun.write(broken, invalid)
  assert.equal((await fetch(`${origin}/optimize?path=${encodeURIComponent(broken)}`, { method: 'POST', headers: { cookie } })).status, 422)
  assert.deepEqual(await Bun.file(broken).bytes(), invalid)
  assert.equal(await Bun.file(join(root, 'broken.optimized.jpg')).exists(), false)
  await checkImage('vector.svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><!-- remove --><text xml:space="preserve">a  b   c</text></svg>'), bytes => {
    const text = new TextDecoder().decode(bytes)
    assert.ok(text.includes('a  b   c'))
    assert.ok(!text.includes('<!--'))
  })
  assert.equal((await fetch(`${origin}/optimize?path=${encodeURIComponent(path)}`, { method: 'POST', headers: { cookie, origin: 'https://external.example' } })).status, 403)
  console.log(JSON.stringify({ passed: true, nativeLaunchMs: Number(nativeLaunchMs.toFixed(1)), startupMs: Number(startupMs.toFixed(1)), optimizeMs: Number(optimizeMs.toFixed(1)), inputBytes: input.length, outputBytes: output.length, formats, sourcePreserved: true }))
  child.kill('SIGTERM')
  await child.exited
  await assert.rejects(fetch(origin))
}
finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await child.exited
  }
  await rm(root, { recursive: true, force: true })
}
