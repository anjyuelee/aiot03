import type { Bounds } from '../../../shared/types'
import { latToMercY, mercYToLat } from './mercator'

export interface CanvasOverlay { canvas: HTMLCanvasElement; bounds: Bounds }

/** 輸出（Mercator）第 j 列對應到來源（經緯度等距）影像的哪一列 */
export function sourceRowForMercRow(j: number, rowsOut: number, rowsIn: number, south: number, north: number): number {
  const yN = latToMercY(north)
  const yS = latToMercY(south)
  const lat = mercYToLat(yN + ((yS - yN) * (j + 0.5)) / rowsOut)
  return Math.min(rowsIn - 1, Math.max(0, Math.floor(((north - lat) / (north - south)) * rowsIn)))
}

/** 經緯度等距的影像逐列重排成 Mercator 列距，疊到地圖上不會南北錯位 */
export function reprojectImage(src: HTMLImageElement | HTMLCanvasElement, bounds: Bounds, maxSize = 2048): CanvasOverlay {
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(src.width * scale)
  canvas.height = Math.round(src.height * scale)
  const ctx = canvas.getContext('2d')!
  const [, south, , north] = bounds
  for (let j = 0; j < canvas.height; j++) {
    const sr = sourceRowForMercRow(j, canvas.height, src.height, south, north)
    ctx.drawImage(src, 0, sr, src.width, 1, 0, j, canvas.width, 1)
  }
  return { canvas, bounds }
}
