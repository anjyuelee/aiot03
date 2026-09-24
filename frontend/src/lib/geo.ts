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

/** 地圖著色：相鄰區域不同色（DSatur，失敗就回溯）；k 色不夠時回傳 null */
export function colorGraph(neighbors: number[][], k: number): number[] | null {
  const c: number[] = new Array(neighbors.length).fill(-1)
  const go = (left: number): boolean => {
    if (left === 0) return true
    // 挑鄰居已用顏色最多的點，同分取鄰居多的
    let v = -1, best = -1
    neighbors.forEach((ns, i) => {
      if (c[i] !== -1) return
      const score = new Set(ns.map(u => c[u]).filter(x => x !== -1)).size * 1000 + ns.length
      if (score > best) { best = score; v = i }
    })
    for (let color = 0; color < k; color++) {
      if (neighbors[v].some(u => c[u] === color)) continue
      c[v] = color
      if (go(left - 1)) return true
    }
    c[v] = -1
    return false
  }
  return go(neighbors.length) ? c : null
}
