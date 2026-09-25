import type { Bounds, ImageOverlay, SatelliteOverlay } from '../../../shared/types'
import { reprojectImage, type CanvasOverlay } from './reproject'
import { styleClouds, type CloudMode } from './clouds'

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  return img
}

export async function radarOverlay(o: ImageOverlay): Promise<CanvasOverlay> {
  // 圖檔名固定，以觀測時間避開瀏覽器快取
  const img = await loadImage(`${o.url}?t=${encodeURIComponent(o.obsTime)}`)
  return reprojectImage(img, o.bounds)
}

/** 圖塊先拼成一張經緯度影像再整張重投影，各塊分開重投影會在接縫處錯位 */
export async function satelliteOverlay(sat: SatelliteOverlay, mode: CloudMode): Promise<CanvasOverlay> {
  const imgs = await Promise.all(sat.tiles.map(t => loadImage(t.url)))
  const bounds: Bounds = [
    Math.min(...sat.tiles.map(t => t.bounds[0])),
    Math.min(...sat.tiles.map(t => t.bounds[1])),
    Math.max(...sat.tiles.map(t => t.bounds[2])),
    Math.max(...sat.tiles.map(t => t.bounds[3])),
  ]
  // 圖塊解析度一致，以第一塊換算每度像素
  const [w0, s0, e0, n0] = sat.tiles[0].bounds
  const pxX = imgs[0].width / (e0 - w0)
  const pxY = imgs[0].height / (n0 - s0)
  const [west, south, east, north] = bounds
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((east - west) * pxX)
  canvas.height = Math.round((north - south) * pxY)
  const ctx = canvas.getContext('2d')!
  sat.tiles.forEach(({ bounds: [w, s, e, n] }, i) => {
    const x = Math.round((w - west) * pxX)
    const y = Math.round((north - n) * pxY)
    ctx.drawImage(imgs[i], x, y, Math.round((e - west) * pxX) - x, Math.round((north - s) * pxY) - y)
  })
  const out = reprojectImage(canvas, bounds)
  styleClouds(out.canvas, mode)
  return out
}
