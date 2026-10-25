import { constants } from 'node:fs'
import { lstat, open, link, unlink } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import type { OptimizeResult } from './optimize'
import { optimize } from './optimize'

export const MAX_BYTES = 32 * 1024 * 1024

/** Native host authentication is supplied by STX before this handler runs. */
export default async function handle(request: Request): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/optimize') return null
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } })
  try {
    const path = url.searchParams.get('path')
    if (path) return await optimizePath(path, url.searchParams.get('outputDirectory') || undefined)
    const declared = Number(request.headers.get('content-length'))
    if (declared > MAX_BYTES) return new Response('Image exceeds 32 MB', { status: 413 })
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.length > MAX_BYTES) return new Response('Image exceeds 32 MB', { status: 413 })
    const result = await optimize(bytes, extname(url.searchParams.get('name') ?? ''))
    return response(result.bytes, result)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Optimization failed'
    return new Response(message, { status: 422 })
  }
}

async function optimizePath(path: string, outputDirectory?: string): Promise<Response> {
  if (!isAbsolute(path)) return new Response('Choose an absolute file path', { status: 400 })
  const destination = outputDirectory || dirname(path)
  if (!isAbsolute(destination)) return new Response('Choose an absolute output folder', { status: 400 })
  if (outputDirectory) {
    const folder = await lstat(destination)
    if (!folder.isDirectory() || folder.isSymbolicLink()) return new Response('Choose a regular output folder', { status: 400 })
  }
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) return new Response('Choose a regular file', { status: 400 })
  if (info.size > MAX_BYTES) return new Response('Image exceeds 32 MB', { status: 413 })
  // O_NOFOLLOW closes the symlink race between inspection and opening.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  let bytes: Uint8Array
  try {
    const current = await file.stat()
    if (!current.isFile() || current.size > MAX_BYTES) throw new Error('File changed while opening')
    bytes = new Uint8Array(current.size)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) throw new Error('File changed while reading')
      offset += bytesRead
    }
    const extra = new Uint8Array(1)
    if ((await file.read(extra, 0, 1, offset)).bytesRead) throw new Error('File changed while reading')
  }
  finally { await file.close() }
  const result = await optimize(bytes, extname(path))
  let outputPath: string | null = null
  if (!result.passthrough) {
    // Write a complete sibling first, then link atomically without replacing
    // an existing file. A crash never leaves a partially written image.
    const temporary = join(destination, `.imageoptimization-${crypto.randomUUID()}`)
    try {
      const output = await open(temporary, 'wx', info.mode & 0o777)
      try {
        await output.writeFile(result.bytes)
        await output.sync()
      }
      finally { await output.close() }
      const extension = extname(path)
      const stem = basename(path, extension)
      for (let count = 0; count < 1000; count++) {
        const target = join(destination, `${stem}.optimized${count ? `-${count}` : ''}${extension}`)
        try {
          await link(temporary, target)
          outputPath = target
          break
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
      }
      if (!outputPath) throw new Error('Too many optimized copies; choose another folder')
    }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
  return response(new Uint8Array(), { ...result, outputPath, wrote: Boolean(outputPath) })
}

function response(body: Uint8Array, result: OptimizeResult & { outputPath?: string | null, wrote?: boolean }): Response {
  const { bytes, ...meta } = result
  return new Response(new Uint8Array(body), { headers: {
    'content-type': 'application/octet-stream',
    'cache-control': 'no-store',
    'x-stx-result': encodeURIComponent(JSON.stringify(meta)),
  } })
}
