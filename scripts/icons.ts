#!/usr/bin/env bun
import { Buffer } from 'node:buffer'
import png from '@stacksjs/ts-png'

// Generate the same image mark at every native icon size using our PNG codec.
const chunks: Buffer[] = []
for (const [size, type] of [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']] as const) {
  const data = Buffer.alloc(size * size * 4)
  const samples = size < 256 ? 4 : 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0]
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) / samples) * 1024 / size
          const py = (y + (sy + 0.5) / samples) * 1024 / size
          const rounded = (left: number, top: number, width: number, height: number, radius: number) => {
            const dx = Math.max(left + radius - px, 0, px - left - width + radius)
            const dy = Math.max(top + radius - py, 0, py - top - height + radius)
            return px >= left && px <= left + width && py >= top && py <= top + height && dx * dx + dy * dy <= radius * radius
          }
          if (!rounded(72, 72, 880, 880, 196)) continue
          const t = (py - 72) / 880
          let color = [144 - 52 * t, 111 - 48 * t, 249 - 35 * t]
          const border = rounded(242, 276, 540, 472, 54) && !rounded(272, 306, 480, 412, 26)
          const sun = (px - 638) ** 2 + (py - 402) ** 2 < 48 ** 2
          const mountain = px >= 279 && px <= 745 && py >= Math.min(566 + Math.abs(px - 438) * 0.92, 584 + Math.abs(px - 621) * 0.9) && py < 710
          if (border || sun || mountain) color = [255, 255, 255]
          for (let c = 0; c < 3; c++) sum[c] += color[c]
          sum[3]++
        }
      }
      const offset = (y * size + x) * 4
      if (sum[3]) for (let c = 0; c < 3; c++) data[offset + c] = Math.round(sum[c] / sum[3])
      data[offset + 3] = Math.round(sum[3] * 255 / (samples * samples))
    }
  }
  const bytes = png.sync.write({ width: size, height: size, data, gamma: 0 })
  if (size === 1024) await Bun.write('assets/icon.png', bytes)
  const header = Buffer.alloc(8)
  header.write(type)
  header.writeUInt32BE(bytes.length + 8, 4)
  chunks.push(header, bytes)
}
const header = Buffer.alloc(8)
header.write('icns')
header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4)
await Bun.write('assets/AppIcon.icns', Buffer.concat([header, ...chunks]))
