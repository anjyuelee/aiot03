import { useRadar, useRadarFrames } from '../api'
import { useStore } from '../store'
import { nearestLoaded, radarIndex } from '../lib/radar'
import type { CanvasOverlay } from '../lib/reproject'

/** 雷達時間軸目前這格重投影後的 canvas；還沒載入或失敗時用它之前最接近的已載入格。雷達圖層與點查共用，兩者一定是同一格 */
export function useRadarFrame(): CanvasOverlay | null {
  const radar = useRadar(true)
  const frames = useRadarFrames(radar.data?.data ?? null)
  const index = useStore(s => radarIndex(s.radarPos, frames.length))
  return nearestLoaded(frames.map(f => f.data), index)
}
