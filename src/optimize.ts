/**
 * Image optimization dispatcher.
 *
 * Detects format from magic bytes, decodes via the appropriate ts-* lib,
 * re-encodes with stronger settings, returns whichever is smaller.
 *
 * No external deps — only Bun + our own ts-{png,jpeg,webp,avif,gif,bmp,svg}.
 */

import { optimize as optimizePngBytes } from '@stacksjs/ts-png'
import * as jpeg from 'ts-jpeg'
import * as webp from '@stacksjs/ts-webp'
import * as bmp from '@stacksjs/ts-bmp'
import * as gif from 'ts-gif'
import * as avif from '@stacksjs/ts-avif'
import { optimize as optimizeSvgText } from '@stacksjs/ts-svg'

export type ImageFormat =
  | 'png' | 'jpeg' | 'webp' | 'avif' | 'gif' | 'bmp' | 'svg'
  // Detected but not optimised — return passthrough with a useful note so
  // the UI can surface "no optimiser yet" instead of "unknown".
  | 'tiff' | 'ico' | 'heic'
  | 'unknown'

export interface OptimizeResult {
  format: ImageFormat
  inputSize: number
  outputSize: number
  saved: number
  savedPct: number
  bytes: Uint8Array
  /** True if the output is the same as the input (no gain). */
  passthrough: boolean
  /** Optional human-readable note (e.g. "lossless PNG re-deflate"). */
  note?: string
  /** Format-specific extra detail (e.g. AVIF's stripped item types). */
  detail?: Record<string, unknown>
}

/** Detect format from leading magic bytes. */
export function detectFormat(buf: Uint8Array): ImageFormat {
  if (buf.length < 4) return 'unknown'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 8 && [137,80,78,71,13,10,26,10].every((value, i) => buf[i] === value)) return 'png'

  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg'

  // GIF: 'GIF87a' or 'GIF89a'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif'

  // BMP: 'BM'
  if (buf[0] === 0x42 && buf[1] === 0x4D) return 'bmp'

  // ICO: 00 00 01 00 (icon) — `02 00` would be cursor, both worth detecting.
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02) && buf[3] === 0x00) return 'ico'

  // TIFF: 'II' + 42 (little-endian) or 'MM' + 42 (big-endian).
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00)
    || (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A)) {
    return 'tiff'
  }

  // RIFF...WEBP / RIFF...other
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      return 'webp'
    }
  }

  // ISOBMFF box-based (AVIF / HEIC / HEIF). Skip 4-byte size, look for 'ftyp'.
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11])
    if (brand === 'avif' || brand === 'avis') return 'avif'
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') return 'heic'
    // `mif1` is generic MIAF — could be either. Look at compatible-brand list.
    if (brand === 'mif1') {
      const end = Math.min(buf.length, new DataView(buf.buffer, buf.byteOffset).getUint32(0))
      for (let off = 16; off + 4 <= end; off += 4) {
        const tag = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3])
        if (tag === 'avif' || tag === 'avis') return 'avif'
        if (tag === 'heic' || tag === 'heix' || tag === 'hevc' || tag === 'hevx') return 'heic'
      }
      return 'unknown'
    }
  }

  // SVG: '<?xml' or '<svg' (allow leading whitespace + optional BOM)
  let i = 0
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) i = 3
  while (i < buf.length && buf[i] <= 0x20) i++
  if (buf[i] === 0x3C) {
    if (/<svg(?:\s|>)/i.test(new TextDecoder().decode(buf.subarray(i, Math.min(buf.length, i + 4096))))) return 'svg'
  }

  return 'unknown'
}

/** Run optimization. Returns the original bytes if no gain was possible. */
export async function optimize(input: Uint8Array, hintExt?: string): Promise<OptimizeResult> {
  const inputSize = input.length
  const detected = detectFormat(input)
  const format = detected === 'unknown' ? formatFromExt(hintExt) : detected

  const result = await runFormat(format, input)

  // Only keep the new bytes if they're actually smaller.
  const winning = result.bytes.length < inputSize ? result.bytes : input
  const passthrough = winning === input
  const outputSize = winning.length
  const saved = inputSize - outputSize
  const savedPct = inputSize === 0 ? 0 : (saved / inputSize) * 100

  return {
    format,
    inputSize,
    outputSize,
    saved,
    savedPct,
    bytes: winning,
    passthrough,
    note: result.note,
    detail: result.detail,
  }
}

async function runFormat(format: ImageFormat, input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string, detail?: Record<string, unknown> }> {
  switch (format) {
    case 'png': return optimizePng(input)
    case 'jpeg': return optimizeJpeg(input)
    case 'webp': return optimizeWebp(input)
    case 'bmp': return optimizeBmp(input)
    case 'svg': return optimizeSvg(input)
    case 'gif': return optimizeGif(input)
    case 'avif': return optimizeAvif(input)
    case 'tiff': return { bytes: input, note: 'TIFF preserved without changes' }
    case 'ico': return { bytes: input, note: 'Icon preserved without changes' }
    case 'heic': return { bytes: input, note: 'HEIC preserved without changes' }
    default: return { bytes: input, note: 'Unsupported format; original preserved' }
  }
}

function formatFromExt(ext?: string): ImageFormat {
  if (!ext) return 'unknown'
  const e = ext.toLowerCase().replace(/^\./, '')
  if (e === 'jpg' || e === 'jpeg') return 'jpeg'
  if (e === 'tif') return 'tiff'
  if (e === 'heif') return 'heic'
  if (e === 'png' || e === 'webp' || e === 'avif' || e === 'gif' || e === 'bmp'
    || e === 'svg' || e === 'tiff' || e === 'ico' || e === 'heic') {
    return e as ImageFormat
  }
  return 'unknown'
}

// ---------------------------------------------------------------------------
// PNG — recompress the original filtered stream without metadata loss
// ---------------------------------------------------------------------------
async function optimizePng(input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string }> {
  return { bytes: optimizePngBytes(input), note: 'Lossless PNG compression; metadata and animation preserved' }
}

async function optimizeJpeg(input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string }> {
  return { bytes: jpeg.optimize(input), note: 'Lossless JPEG; orientation and color profiles preserved' }
}

async function optimizeWebp(input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string }> {
  // Animated frames and image metadata must survive unchanged.
  for (let offset = 12; offset + 8 <= input.length;) {
    const type = new TextDecoder().decode(input.subarray(offset, offset + 4))
    if (['ANIM', 'ANMF', 'ICCP', 'EXIF', 'XMP '].includes(type))
      return { bytes: input, note: 'WebP animation and metadata preserved' }
    const size = new DataView(input.buffer, input.byteOffset + offset + 4, 4).getUint32(0, true)
    offset += 8 + size + (size % 2)
    if (offset > input.length) throw new Error('Truncated WebP chunk')
  }
  const info = webp.getWebpInfo(webp.parseRiff(input))
  if (info.width * info.height > 32 * 1024 * 1024) throw new Error('WebP exceeds 32 megapixels')
  const decoded = webp.decode(input)
  const out = webp.encode(decoded, { lossless: true, backend: 'pure-ts' })
  return { bytes: out, note: 'Lossless WebP compression' }
}

// ---------------------------------------------------------------------------
// BMP — decode then re-encode (BMP is mostly uncompressed; rarely a win)
// ---------------------------------------------------------------------------
async function optimizeBmp(input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string }> {
  if (input.length < 54) throw new Error('Truncated BMP header')
  const header = new DataView(input.buffer, input.byteOffset, input.byteLength)
  if (header.getUint32(14, true) >= 108) return { bytes: input, note: 'BMP color profile preserved' }
  const pixels = Math.abs(header.getInt32(18, true)) * Math.abs(header.getInt32(22, true))
  if (pixels > 32 * 1024 * 1024) throw new Error('BMP exceeds 32 megapixels')
  const decoded = bmp.decode(input)
  // Drop alpha if the image is fully opaque — saves ~25 % on RGBA bitmaps.
  const fullyOpaque = isFullyOpaque(decoded.data)
  const out = bmp.encode(decoded, { bitsPerPixel: fullyOpaque ? 24 : 32 })
  return { bytes: out, note: 'Lossless BMP compression' }
}

function isFullyOpaque(rgba: Uint8Array | Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 0xFF) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// GIF — palette tightening + global-palette consolidation (lossless)
// ---------------------------------------------------------------------------
async function optimizeGif(input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string }> {
  const out = gif.reencode(input)
  return { bytes: out, note: 'Lossless GIF compression; animation preserved' }
}

// ---------------------------------------------------------------------------
// AVIF — lossless container compression with metadata retained
// ---------------------------------------------------------------------------
async function optimizeAvif(input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string }> {
  const bytes = avif.remux(input, { preserveMetadata: true })
  return { bytes, note: 'Lossless AVIF container compression; metadata and animation preserved' }
}

// ---------------------------------------------------------------------------
// SVG — parse and remove comments without changing text spacing.
// ---------------------------------------------------------------------------
async function optimizeSvg(input: Uint8Array): Promise<{ bytes: Uint8Array, note?: string }> {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(input)
  const result = optimizeSvgText(text, { plugins: ['removeComments'] })
  return { bytes: new TextEncoder().encode(result.data), note: 'SVG comments removed; text spacing preserved' }
}
