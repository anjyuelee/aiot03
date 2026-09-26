import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unzlibSync } from 'fflate'
import { NotFoundError, type Fetcher } from './cwa/client.js'
import { radarFrameResponse } from './radarFrame.js'

/** 完整尺寸的格點 XML：全部 -999，只有 index 的格子是 dbz */
function gridXml(index: number, dbz: string, nx = 921, ny = 881) {
  const values = new Array<string>(nx * ny).fill('-9.990E+02')
  values[index] = dbz
  return `<cwaopendata><dataset><datasetInfo><parameterSet><GridDimensionX>${nx}</GridDimensionX><GridDimensionY>${ny}</GridDimensionY>`
    + `</parameterSet></datasetInfo><contents><content>${values.join(',')}</content></contents></dataset></cwaopendata>`
}

function withFrame(historyData: Fetcher['historyData']): Fetcher {
  return {
    dataset: async () => { throw new Error('unexpected dataset') },
    file: async () => { throw new Error('unexpected file') },
    bytes: async () => { throw new Error('unexpected bytes') },
    historyMetadata: async () => { throw new Error('unexpected historyMetadata') },
    historyData,
  }
}

const unused = withFrame(async () => { throw new Error('should not fetch') })

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('radarFrameResponse', () => {
  it('rejects a missing or malformed t without calling CWA', async () => {
    for (const t of [null, '', '2026092611', '202609261135', '2026-09-26T11:30', '2026092611300']) {
      const res = await radarFrameResponse(t, unused)
      expect(res.status).toBe(400)
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('renders the frame as a long-cached PNG with the northern row first', async () => {
    const paths: string[] = []
    // 最南一列的第一格（115.0°E, 18.0°N）為 30 dBZ
    const f = withFrame(async (id, path) => { paths.push(`${id} ${path}`); return new TextEncoder().encode(gridXml(0, '3.000E+01')) })
    const res = await radarFrameResponse('202609261130', f)
    expect(paths).toEqual(['O-A0059-001 2026/09/26/11/30/00'])
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, s-maxage=31536000, immutable')
    const png = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(png.subarray(1, 4))).toEqual([80, 78, 71])
    // IDAT 緊接在 IHDR（8 + 25 bytes）之後
    const idatLen = new DataView(png.buffer).getUint32(33)
    const raw = unzlibSync(png.subarray(41, 41 + idatLen))
    const stride = 921 * 4 + 1
    expect(raw).toHaveLength(stride * 881)
    // 輸出最後一列（最南）第一格為 30 dBZ 的黃色，其他列全透明
    expect(Array.from(raw.subarray(880 * stride + 1, 880 * stride + 5))).toEqual([255, 255, 0, 255])
    expect(raw.subarray(0, 880 * stride).some((b, i) => i % stride !== 0 && b !== 0)).toBe(false)
  })

  it('caches a missing frame briefly', async () => {
    const res = await radarFrameResponse('202609261130', withFrame(async () => { throw new NotFoundError('gone') }))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60')
  })

  it('reports other CWA failures as 502 without caching', async () => {
    const res = await radarFrameResponse('202609261130', withFrame(async () => { throw new Error('CWA HTTP 500') }))
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('throws when the grid has unexpected dimensions', async () => {
    const f = withFrame(async () => new TextEncoder().encode(gridXml(0, '1', 10, 10)))
    await expect(radarFrameResponse('202609261130', f)).rejects.toThrow('Unexpected radar grid 10x10')
  })
})
