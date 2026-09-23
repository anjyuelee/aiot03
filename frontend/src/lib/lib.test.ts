import { describe, it, expect } from 'vitest'
import { latToMercY, mercYToLat } from './mercator'
import { idwGrid } from './idw'
import { parseHex, colorAt, fillColorExpr } from './colorScale'
import { nearest, searchTowns } from './geo'
import { fmtHour, fmtSlot, weekdayOf } from './format'
import { groupWeekByDay } from './week'
import { wxIcon } from './wx'
import { windToUV, sampleField, type WindField } from './wind'
import { parseUrlState, toSearch } from './urlState'
import { sourceRowForMercRow } from './reproject'
import { cloudAlpha } from './clouds'
import type { Town, WeekSlot } from '../../../shared/types'

describe('mercator', () => {
  it('round-trips latitude', () => {
    for (const lat of [0, 23.5, 50, -30]) expect(mercYToLat(latToMercY(lat))).toBeCloseTo(lat, 9)
  })
})

describe('idwGrid', () => {
  const pts = [{ lon: 120, lat: 23, v: 10 }, { lon: 121, lat: 23, v: 20 }]
  it('returns exact value on a station and average at midpoint', () => {
    const g = idwGrid(pts, [120, 120.5], [23], 2)
    expect(g[0]).toBe(10)
    expect(g[1]).toBeCloseTo(15, 6)
  })
  it('returns NaN beyond maxDist from every station', () => {
    expect(Number.isNaN(idwGrid(pts, [125], [23], 0.5)[0])).toBe(true)
  })
})

describe('colorScale', () => {
  const stops: [number, string][] = [[0, '#000000'], [10, '#ff000080']]
  it('parses hex with alpha', () => { expect(parseHex('#ff000080')).toEqual([255, 0, 0, 128]) })
  it('clamps and interpolates', () => {
    expect(colorAt(stops, -5)).toEqual([0, 0, 0, 255])
    expect(colorAt(stops, 99)).toEqual([255, 0, 0, 128])
    expect(colorAt(stops, 5)).toEqual([128, 0, 0, 192])
  })
  it('builds a maplibre interpolate expression', () => {
    expect(fillColorExpr(stops, ['get', 'value'])).toEqual(['interpolate', ['linear'], ['get', 'value'], 0, 'rgba(0,0,0,1)', 10, 'rgba(255,0,0,0.502)'])
  })
})

const towns: Town[] = [
  { id: '1', name: '中區', county: '臺中市', lat: 24.14, lon: 120.68 },
  { id: '2', name: '宜蘭市', county: '宜蘭縣', lat: 24.75, lon: 121.75 },
]

describe('geo', () => {
  it('finds nearest item', () => { expect(nearest(towns, 121.7, 24.7)?.id).toBe('2') })
  it('returns null for empty list', () => { expect(nearest([], 0, 0)).toBeNull() })
  it('searches with 台/臺 equivalence', () => {
    expect(searchTowns(towns, '台中').map(t => t.id)).toEqual(['1'])
    expect(searchTowns(towns, '宜蘭').map(t => t.id)).toEqual(['2'])
    expect(searchTowns(towns, '  ')).toEqual([])
  })
})

describe('format', () => {
  it('formats slot labels from +08:00 strings', () => {
    expect(weekdayOf('2026-09-23')).toBe('三')
    expect(fmtHour('2026-09-23T18:00:00+08:00')).toBe('18時')
    expect(fmtSlot('2026-09-24T03:00:00+08:00')).toBe('週四 03:00')
  })
})

describe('groupWeekByDay', () => {
  const slot = (start: string, min: number, max: number, pop: number, wxCode: string): WeekSlot =>
    ({ start, end: start, minTemp: min, maxTemp: max, pop, wx: null, wxCode })
  it('merges day and night slots per date', () => {
    const days = groupWeekByDay([
      slot('2026-09-23T18:00:00+08:00', 23, 27, 20, '04'),
      slot('2026-09-24T06:00:00+08:00', 24, 30, 10, '02'),
      slot('2026-09-24T18:00:00+08:00', 22, 26, 40, '08'),
    ])
    expect(days).toEqual([
      { date: '2026-09-23', label: '今天', min: 23, max: 27, pop: 20, wxCode: '04' },
      { date: '2026-09-24', label: '週四', min: 22, max: 30, pop: 40, wxCode: '02' },
    ])
  })
})

describe('wxIcon', () => {
  it('maps CWA weather codes', () => {
    expect(wxIcon('01')).toBe('☀️')
    expect(wxIcon('04')).toBe('☁️')
    expect(wxIcon('15')).toBe('⛈️')
    expect(wxIcon('08')).toBe('🌧️')
    expect(wxIcon(null)).toBe('')
  })
})

describe('wind', () => {
  it('converts meteorological direction to u/v', () => {
    const [u1, v1] = windToUV(10, 0)
    expect(u1).toBeCloseTo(0, 9); expect(v1).toBeCloseTo(-10, 9)
    const [u2, v2] = windToUV(10, 90)
    expect(u2).toBeCloseTo(-10, 9); expect(v2).toBeCloseTo(0, 9)
  })
  it('samples a grid and returns null outside or on NaN', () => {
    const f: WindField = { west: 120, south: 23, step: 1, cols: 2, rows: 1, u: new Float32Array([1, NaN]), v: new Float32Array([2, NaN]) }
    expect(sampleField(f, 120.2, 23.1)).toEqual([1, 2])
    expect(sampleField(f, 121, 23)).toBeNull()
    expect(sampleField(f, 130, 23)).toBeNull()
  })
})

describe('urlState', () => {
  it('parses with defaults and rejects bad values', () => {
    expect(parseUrlState('')).toEqual({ layer: 'temp', t: 0, town: null })
    expect(parseUrlState('?layer=wind&t=6&town=10002010')).toEqual({ layer: 'wind', t: 6, town: '10002010' })
    expect(parseUrlState('?layer=bogus&t=-3')).toEqual({ layer: 'temp', t: 0, town: null })
  })
  it('serializes', () => {
    expect(toSearch({ layer: 'rain', t: 0, town: null })).toBe('?layer=rain')
    expect(toSearch({ layer: 'wind', t: 6, town: '1' })).toBe('?layer=wind&t=6&town=1')
  })
})

describe('sourceRowForMercRow', () => {
  it('maps edges to edges', () => {
    expect(sourceRowForMercRow(0, 100, 1000, 0, 50)).toBeLessThan(15)
    expect(sourceRowForMercRow(99, 100, 1000, 0, 50)).toBeGreaterThan(985)
  })
  it('stretches rows toward the pole', () => {
    // Mercator 中線對應的緯度高於 25°，所以來源列在上半部
    expect(sourceRowForMercRow(50, 100, 1000, 0, 50)).toBeLessThan(500)
  })
})

describe('cloudAlpha', () => {
  it('keeps warm ocean and night-time land transparent', () => {
    expect(cloudAlpha(0)).toBe(0)
    expect(cloudAlpha(90)).toBe(0)
    expect(cloudAlpha(130)).toBe(0)
  })
  it('makes cold (bright) cloud tops opaque', () => {
    expect(cloudAlpha(240)).toBe(255)
    expect(cloudAlpha(255)).toBe(255)
  })
  it('ramps monotonically in between', () => {
    expect(cloudAlpha(185)).toBeGreaterThan(100)
    expect(cloudAlpha(185)).toBeLessThan(155)
    expect(cloudAlpha(150)).toBeLessThan(cloudAlpha(220))
  })
})
