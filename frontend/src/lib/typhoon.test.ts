import { describe, it, expect } from 'vitest'
import { circlePolygon, fixLines, followGeoJSON, timeAtPos, toGeoJSON, typhoonAt, typhoonBounds } from './typhoon'
import { TAIWAN_BOUNDS } from './heat'
import type { LineString } from 'geojson'
import type { Typhoon, TyphoonFix } from '../../../shared/types'

const fix = (lon: number, lat: number, extra: Partial<TyphoonFix> = {}): TyphoonFix => ({
  time: '2026-09-24T02:00:00+08:00', forecastHour: null, lat, lon, pressure: 998, maxWind: 20, maxGust: 28,
  moveDir: 'WNW', moveSpeed: 34, radius15ms: 120, radius70: null, ...extra,
})
const ty: Typhoon = {
  id: '2026-29', name: '舒力基', nameEn: 'SURIGAE',
  past: [fix(137, 16), fix(135.6, 17.4)],
  forecast: [fix(134.6, 17.7, { forecastHour: 6, time: '2026-09-24T08:00:00+08:00', radius70: 40 })],
}

// haversine，公里
function km([lon1, lat1]: number[], [lon2, lat2]: number[]) {
  const r = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

describe('circlePolygon', () => {
  it('produces a closed ring whose vertices are radiusKm from the centre', () => {
    const ring = circlePolygon(135.6, 17.4, 120, 16)
    expect(ring).toHaveLength(17)
    expect(ring[0]).toEqual(ring[16])
    for (const p of ring) expect(km([135.6, 17.4], p)).toBeCloseTo(120, 0)
  })
})

describe('typhoonBounds', () => {
  it('covers Taiwan and every track point', () => {
    const [w, s, e, n] = typhoonBounds([ty])
    expect(w).toBe(TAIWAN_BOUNDS[0])
    expect(s).toBe(16)
    expect(e).toBe(137)
    expect(n).toBe(TAIWAN_BOUNDS[3])
  })
  it('is Taiwan alone when there are no typhoons', () => {
    expect(typhoonBounds([])).toEqual(TAIWAN_BOUNDS)
  })
})

describe('toGeoJSON', () => {
  it('emits tracks, points, wind circle and forecast cones', () => {
    const roles = toGeoJSON([ty]).features.map(f => f.properties!.role)
    expect(roles.filter(r => r === 'track-past')).toHaveLength(1)
    expect(roles.filter(r => r === 'track-forecast')).toHaveLength(1)
    expect(roles.filter(r => r === 'point')).toHaveLength(3)
    expect(roles.filter(r => r === 'wind')).toHaveLength(1)
    expect(roles.filter(r => r === 'cone')).toHaveLength(1)
  })
  it('starts the forecast track at the current position', () => {
    const f = toGeoJSON([ty]).features.find(f => f.properties!.role === 'track-forecast')!
    expect((f.geometry as LineString).coordinates[0]).toEqual([135.6, 17.4])
  })
})

describe('fixLines', () => {
  it('labels forecast points and skips missing values', () => {
    const lines = fixLines(ty.forecast[0])
    expect(lines[0]).toContain('+6h 預測')
    expect(lines).toContain('中心氣壓 998 hPa')
    expect(lines).toContain('七級風半徑 120 km')
    expect(lines).toContain('70% 機率半徑 40 km')
    expect(fixLines(fix(1, 1, { pressure: null }))).not.toContainEqual(expect.stringContaining('氣壓'))
  })
})

// 最新觀測點 26 日 20:00；預測點 +6h、+12h、+24h，後兩點沒有七級風半徑
const T0 = Date.parse('2026-09-26T20:00:00+08:00')
const H = 3600_000
const moving: Typhoon = {
  id: '2026-30', name: '舒力基', nameEn: 'SURIGAE',
  past: [
    fix(130, 20, { time: '2026-09-26T14:00:00+08:00', radius15ms: 150 }),
    fix(128, 22, { time: '2026-09-26T20:00:00+08:00', radius15ms: 100 }),
  ],
  forecast: [
    fix(127, 23, { time: '2026-09-27T02:00:00+08:00', forecastHour: 6, radius15ms: 80 }),
    fix(126, 24, { time: '2026-09-27T08:00:00+08:00', forecastHour: 12, radius15ms: null }),
    fix(125, 25, { time: '2026-09-27T20:00:00+08:00', forecastHour: 24, radius15ms: null }),
  ],
}

describe('timeAtPos', () => {
  const times = ['2026-09-27T00:00:00+08:00', '2026-09-27T03:00:00+08:00', '2026-09-27T06:00:00+08:00']
  it('maps 0 to the latest fix and k to the k-th forecast slot', () => {
    expect(timeAtPos(0, times, T0)).toBe(T0)
    expect(timeAtPos(1, times, T0)).toBe(Date.parse(times[0]))
    expect(timeAtPos(3, times, T0)).toBe(Date.parse(times[2]))
  })
  it('interpolates between neighbouring anchors', () => {
    expect(timeAtPos(0.5, times, T0)).toBe(T0 + 2 * H)
    expect(timeAtPos(1.5, times, T0)).toBe(Date.parse('2026-09-27T01:30:00+08:00'))
  })
  it('clamps positions outside the timeline', () => {
    expect(timeAtPos(-1, times, T0)).toBe(T0)
    expect(timeAtPos(5, times, T0)).toBe(Date.parse(times[2]))
  })
  it('never goes before the latest fix', () => {
    const start = Date.parse('2026-09-27T01:00:00+08:00')
    expect(timeAtPos(1, times, start)).toBe(start)
    expect(timeAtPos(2, times, start)).toBe(Date.parse(times[1]))
  })
  it('stays at the latest fix without forecast slots', () => {
    expect(timeAtPos(3, [], T0)).toBe(T0)
  })
})

describe('typhoonAt', () => {
  it('returns the latest fix at or before its time', () => {
    expect(typhoonAt(moving, T0)).toEqual({ lon: 128, lat: 22, radius15ms: 100 })
    expect(typhoonAt(moving, T0 - 3 * H)).toEqual({ lon: 128, lat: 22, radius15ms: 100 })
  })
  it('returns a forecast fix exactly at its time', () => {
    expect(typhoonAt(moving, T0 + 6 * H)).toEqual({ lon: 127, lat: 23, radius15ms: 80 })
    expect(typhoonAt(moving, T0 + 12 * H)).toEqual({ lon: 126, lat: 24, radius15ms: null })
    expect(typhoonAt(moving, T0 + 24 * H)).toEqual({ lon: 125, lat: 25, radius15ms: null })
  })
  it('interpolates position and radius between fixes', () => {
    expect(typhoonAt(moving, T0 + 3 * H)).toEqual({ lon: 127.5, lat: 22.5, radius15ms: 90 })
  })
  it('takes the radius from the only end that has one', () => {
    expect(typhoonAt(moving, T0 + 9 * H)).toEqual({ lon: 126.5, lat: 23.5, radius15ms: 80 })
    expect(typhoonAt(moving, T0 + 18 * H)).toEqual({ lon: 125.5, lat: 24.5, radius15ms: null })
  })
  it('is null after the last forecast fix', () => {
    expect(typhoonAt(moving, T0 + 25 * H)).toBeNull()
  })
  it('only has a position at the latest fix when there is no forecast', () => {
    const still = { ...moving, forecast: [] }
    expect(typhoonAt(still, T0)).toEqual({ lon: 128, lat: 22, radius15ms: 100 })
    expect(typhoonAt(still, T0 + H)).toBeNull()
  })
  it('is null without any fix', () => {
    expect(typhoonAt({ ...moving, past: [] }, T0)).toBeNull()
  })
})

describe('followGeoJSON', () => {
  it('emits a named centre and a wind circle for each typhoon', () => {
    const { features } = followGeoJSON([moving], [], 0)
    expect(features.map(f => f.properties!.role)).toEqual(['center', 'wind'])
    expect(features[0].geometry).toEqual({ type: 'Point', coordinates: [128, 22] })
    expect(features[0].properties!.name).toBe('舒力基')
    expect(features[1].geometry.type).toBe('Polygon')
  })
  it('follows the timeline position', () => {
    const { features } = followGeoJSON([moving], ['2026-09-27T02:00:00+08:00'], 1)
    expect(features[0].geometry).toEqual({ type: 'Point', coordinates: [127, 23] })
  })
  it('skips the wind circle without a radius', () => {
    const { features } = followGeoJSON([moving], ['2026-09-27T08:00:00+08:00'], 1)
    expect(features.map(f => f.properties!.role)).toEqual(['center'])
  })
  it('skips typhoons without a fix or past their forecast', () => {
    expect(followGeoJSON([{ ...moving, past: [] }], [], 0).features).toEqual([])
    expect(followGeoJSON([moving], ['2026-09-28T08:00:00+08:00'], 1).features).toEqual([])
  })
})
