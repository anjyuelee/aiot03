import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { Town } from '../../../shared/types'

export type CountyShapes = FeatureCollection<Polygon | MultiPolygon, { COUNTYCODE: string }>

/** 鄉鎮代碼前 5 碼即所屬縣市代碼 */
export const countyOf = (townId: string) => townId.slice(0, 5)

export function countyBounds(counties: CountyShapes, code: string): [[number, number], [number, number]] | null {
  const f = counties.features.find(x => x.properties.COUNTYCODE === code)
  if (!f) return null
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [[w, s], [e, n]]
}

export function nearest<T extends { lon: number; lat: number }>(items: T[], lon: number, lat: number): T | null {
  const k = Math.cos((lat * Math.PI) / 180)
  let best: T | null = null
  let bestD = Infinity
  for (const it of items) {
    const dx = (it.lon - lon) * k
    const dy = it.lat - lat
    const d = dx * dx + dy * dy
    if (d < bestD) { bestD = d; best = it }
  }
  return best
}

const norm = (s: string) => s.trim().replaceAll('台', '臺')

export function searchTowns(towns: Town[], q: string, limit = 10): Town[] {
  const query = norm(q)
  if (!query) return []
  return towns.filter(t => norm(t.county + t.name).includes(query)).slice(0, limit)
}
