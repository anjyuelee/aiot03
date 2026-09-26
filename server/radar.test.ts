import { describe, it, expect } from 'vitest'
import { RADAR_BOUNDS, RADAR_COLORS, radarColor } from '../shared/radar.js'
import { frameKey, framePath, parseRadarGrid, radarRgba } from './radar.js'

const xml = (nx: number, ny: number, values: string) => `<?xml version="1.0" encoding="UTF-8"?>
<cwaopendata><dataset><datasetInfo><parameterSet>
  <GridDimensionX>${nx}</GridDimensionX>
  <GridDimensionY>${ny}</GridDimensionY>
</parameterSet></datasetInfo>
<contents><content>${values}</content></contents></dataset></cwaopendata>`

describe('radarColor', () => {
  it('leaves negative, invalid and out-of-range values transparent', () => {
    for (const v of [-999, -99, -0.1, NaN]) expect(radarColor(v)).toBeNull()
  })
  it('uses one colour per whole dBZ', () => {
    expect(radarColor(0)).toEqual([0, 255, 255])
    expect(radarColor(14.9)).toEqual([0, 0, 255])
    expect(radarColor(15)).toEqual([0, 255, 0])
  })
  it('clamps at 65 dBZ', () => {
    expect(RADAR_COLORS).toHaveLength(66)
    expect(radarColor(65)).toEqual([150, 0, 255])
    expect(radarColor(80)).toEqual([150, 0, 255])
  })
})

describe('RADAR_BOUNDS', () => {
  it('extends half a cell beyond the outer grid points', () => {
    const [w, s, e, n] = RADAR_BOUNDS
    expect(w).toBeCloseTo(114.99375, 9)
    expect(s).toBeCloseTo(17.99375, 9)
    expect(e).toBeCloseTo(126.50625, 9)
    expect(n).toBeCloseTo(29.00625, 9)
  })
})

describe('parseRadarGrid', () => {
  it('reads values in CWA order', () => {
    const grid = parseRadarGrid(xml(3, 2, '-9.990E+02,1.500E+01,3.000E+01,-9.900E+01,4.500E+01,6.500E+01'), 3, 2)
    expect(Array.from(grid)).toEqual([-999, 15, 30, -99, 45, 65])
  })
  it('rejects unexpected dimensions', () => {
    expect(() => parseRadarGrid(xml(2, 2, '1,2,3,4'), 3, 2)).toThrow('Unexpected radar grid 2x2')
  })
  it('rejects a value count that does not match the dimensions', () => {
    expect(() => parseRadarGrid(xml(3, 2, '1,2,3,4,5'), 3, 2)).toThrow('5 values')
  })
})

describe('radarRgba', () => {
  it('puts the northern row first and leaves no-echo cells transparent', () => {
    // 南列：-999、15、30；北列：-99、45、65
    const rgba = radarRgba(Float32Array.from([-999, 15, 30, -99, 45, 65]), 3, 2)
    const px = (i: number) => Array.from(rgba.subarray(i * 4, i * 4 + 4))
    expect([px(0), px(1), px(2)]).toEqual([[0, 0, 0, 0], [255, 0, 0, 255], [150, 0, 255, 255]])
    expect([px(3), px(4), px(5)]).toEqual([[0, 0, 0, 0], [0, 255, 0, 255], [255, 255, 0, 255]])
  })
})

describe('frameKey / framePath', () => {
  it('turns a CWA time into the YYYYMMDDHHmm key and the key into the getData path', () => {
    expect(frameKey('2026-09-26T11:30:00+08:00')).toBe('202609261130')
    expect(framePath('202609261130')).toBe('2026/09/26/11/30/00')
  })
  it('rejects keys that are not on the 10-minute grid', () => {
    for (const t of ['202609261135', '2026092611', '20260926113000', 'abcdefghijkl']) expect(framePath(t)).toBeNull()
  })
  it('rejects keys outside real month, day, hour and minute ranges', () => {
    for (const t of ['202609261160', '202609261190', '202613261100', '202600261100', '202609321100', '202609001100', '202609262400']) {
      expect(framePath(t)).toBeNull()
    }
    expect(framePath('202612312350')).toBe('2026/12/31/23/50/00')
  })
})
