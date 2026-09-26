import { describe, it, expect } from 'vitest'
import { unzlibSync } from 'fflate'
import { crc32, encodePng } from './png.js'

const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at)
const ascii = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4))

/** 依序切出各 chunk，順便驗 CRC */
function chunks(png: Uint8Array) {
  const out: { type: string; data: Uint8Array }[] = []
  for (let at = 8; at < png.length;) {
    const len = u32(png, at)
    const type = ascii(png, at + 4)
    const data = png.subarray(at + 8, at + 8 + len)
    expect(u32(png, at + 8 + len)).toBe(crc32(png.subarray(at + 4, at + 8 + len)))
    out.push({ type, data })
    at += 12 + len
  }
  return out
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('encodePng', () => {
  // 2×2：紅、綠／藍、透明
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0])
  const png = encodePng(2, 2, rgba)

  it('starts with the PNG signature', () => {
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })

  it('writes IHDR, IDAT and IEND with valid CRCs', () => {
    const list = chunks(png)
    expect(list.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    const ihdr = list[0].data
    expect([u32(ihdr, 0), u32(ihdr, 4)]).toEqual([2, 2])
    // bit depth 8、color type 6（RGBA）、壓縮／濾波／交錯皆 0
    expect(Array.from(ihdr.subarray(8))).toEqual([8, 6, 0, 0, 0])
  })

  it('stores each row with filter byte 0 followed by the raw pixels', () => {
    const raw = unzlibSync(chunks(png)[1].data)
    expect(Array.from(raw)).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)])
  })
})
