import { useEffect } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { CanvasOverlay } from '../lib/reproject'
import { dataLayerBefore, removeLayerAndSource } from './helpers'

export function useImageOverlay(map: MlMap, id: string, src: CanvasOverlay | null, opacity: number) {
  useEffect(() => {
    if (!src) return
    const [w, s, e, n] = src.bounds
    map.addSource(id, { type: 'canvas', canvas: src.canvas, animate: false, coordinates: [[w, n], [e, n], [e, s], [w, s]] })
    // 先以 0 加入，再由下方的 effect 調整，利用 style 預設 300ms transition 淡入
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, dataLayerBefore(map))
    return () => removeLayerAndSource(map, id)
  }, [map, id, src])

  // 透明度分開更新，時間軸淡入淡出時不必重建圖層
  useEffect(() => {
    if (!src) return
    const raf = requestAnimationFrame(() => map.setPaintProperty(id, 'raster-opacity', opacity))
    return () => cancelAnimationFrame(raf)
  }, [map, id, src, opacity])
}
