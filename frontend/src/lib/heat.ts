import type { Bounds, Observation } from '../../../shared/types'
import { colorAt, type Stops } from './colorScale'
import { idwGrid } from './idw'
import { latToMercY, mercYToLat } from './mercator'
import type { CanvasOverlay } from './reproject'

/** 含澎湖、金門、馬祖 */
export const TAIWAN_BOUNDS: Bounds = [118.1, 21.8, 122.1, 26.4]

type Field = 'temp' | 'humidity' | 'windSpeed' | 'rain1h'

/** 測站 IDW 內插成熱圖；列以 Mercator 等距排列，疊到地圖上不會變形 */
export function renderHeat(obs: Observation[], field: Field, stops: Stops, cols = 200, rows = 240): CanvasOverlay {
  const points = obs.flatMap(o => (o[field] == null ? [] : [{ lon: o.lon, lat: o.lat, v: o[field] as number }]))
  const [w, s, e, n] = TAIWAN_BOUNDS
  const yN = latToMercY(n)
  const yS = latToMercY(s)
  const lons = Array.from({ length: cols }, (_, i) => w + ((e - w) * (i + 0.5)) / cols)
  const lats = Array.from({ length: rows }, (_, j) => mercYToLat(yN + ((yS - yN) * (j + 0.5)) / rows))
  const grid = idwGrid(points, lons, lats, 0.35)

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(cols, rows)
  grid.forEach((v, k) => {
    if (!Number.isNaN(v)) img.data.set(colorAt(stops, v), k * 4)
  })
  ctx.putImageData(img, 0, 0)
  return { canvas, bounds: TAIWAN_BOUNDS }
}
