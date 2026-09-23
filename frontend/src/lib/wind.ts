import type { Bounds, Observation } from '../../../shared/types'
import { idwGrid } from './idw'

export interface WindField { west: number; south: number; step: number; cols: number; rows: number; u: Float32Array; v: Float32Array }

/** 氣象風向是「吹來的方向」，轉成往哪裡吹的 u（東）/ v（北）分量 */
export function windToUV(speed: number, dirDeg: number): [number, number] {
  const r = (dirDeg * Math.PI) / 180
  return [-speed * Math.sin(r), -speed * Math.cos(r)]
}

export function buildWindField(obs: Observation[], [west, south, east, north]: Bounds, step = 0.05): WindField {
  const us: { lon: number; lat: number; v: number }[] = []
  const vs: { lon: number; lat: number; v: number }[] = []
  for (const o of obs) {
    if (o.windSpeed == null || o.windDir == null) continue
    const [u, v] = windToUV(o.windSpeed, o.windDir)
    us.push({ lon: o.lon, lat: o.lat, v: u })
    vs.push({ lon: o.lon, lat: o.lat, v })
  }
  const cols = Math.round((east - west) / step) + 1
  const rows = Math.round((north - south) / step) + 1
  const lons = Array.from({ length: cols }, (_, i) => west + i * step)
  const lats = Array.from({ length: rows }, (_, j) => south + j * step)
  return { west, south, step, cols, rows, u: idwGrid(us, lons, lats, 0.35), v: idwGrid(vs, lons, lats, 0.35) }
}

export function sampleField(f: WindField, lon: number, lat: number): [number, number] | null {
  const i = Math.round((lon - f.west) / f.step)
  const j = Math.round((lat - f.south) / f.step)
  if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) return null
  const u = f.u[j * f.cols + i]
  const v = f.v[j * f.cols + i]
  return Number.isNaN(u) || Number.isNaN(v) ? null : [u, v]
}
