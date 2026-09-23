import type { Bounds, Observation } from '../../../shared/types'
import { colorAt, type Stops } from './colorScale'
import { idwGrid } from './idw'
import { latToMercY, mercYToLat } from './mercator'
import type { CanvasOverlay } from './reproject'

/** 含澎湖、金門、馬祖 */
export const TAIWAN_BOUNDS: Bounds = [118.1, 21.8, 122.1, 26.4]

/** 熱圖範圍比資料範圍寬，淡出處不會被矩形邊界切掉 */
const HEAT_BOUNDS: Bounds = [117.5, 20.8, 123.5, 27.2]
const FADE_IN = 0.15
const FADE_OUT = 0.45

/** 依距最近測站的距離（度）決定不透明度：FADE_IN 內全不透明，線性淡到 FADE_OUT 為 0 */
export function edgeFade(dist: number): number {
  return Math.min(1, Math.max(0, (FADE_OUT - dist) / (FADE_OUT - FADE_IN)))
}

type Field = 'temp' | 'humidity' | 'windSpeed' | 'rain1h'

/** 測站 IDW 內插成熱圖；列以 Mercator 等距排列，疊到地圖上不會變形 */
export function renderHeat(obs: Observation[], field: Field, stops: Stops, cols = 240, rows = 288): CanvasOverlay {
  const points = obs.flatMap(o => (o[field] == null ? [] : [{ lon: o.lon, lat: o.lat, v: o[field] as number }]))
  const [w, s, e, n] = HEAT_BOUNDS
  const yN = latToMercY(n)
  const yS = latToMercY(s)
  const lons = Array.from({ length: cols }, (_, i) => w + ((e - w) * (i + 0.5)) / cols)
  const lats = Array.from({ length: rows }, (_, j) => mercYToLat(yN + ((yS - yN) * (j + 0.5)) / rows))
  const near = new Float32Array(cols * rows)
  const grid = idwGrid(points, lons, lats, FADE_OUT, near)

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(cols, rows)
  grid.forEach((v, k) => {
    if (Number.isNaN(v)) return
    const c = colorAt(stops, v)
    c[3] = Math.round(c[3] * edgeFade(near[k]))
    img.data.set(c, k * 4)
  })
  ctx.putImageData(img, 0, 0)
  return { canvas, bounds: HEAT_BOUNDS }
}
