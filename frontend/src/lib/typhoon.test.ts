import { describe, it, expect } from 'vitest'
import { circlePolygon, fixLines, toGeoJSON, typhoonBounds } from './typhoon'
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
