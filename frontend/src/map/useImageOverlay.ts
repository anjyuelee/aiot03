import { useEffect } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { CanvasOverlay } from '../lib/reproject'
import { dataLayerBefore, removeLayerAndSource } from './helpers'

export function useImageOverlay(map: MlMap, id: string, src: CanvasOverlay | null, opacity: number) {
  useEffect(() => {
    if (!src) return
    const [w, s, e, n] = src.bounds
    map.addSource(id, { type: 'canvas', canvas: src.canvas, animate: false, coordinates: [[w, n], [e, n], [e, s], [w, s]] })
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, dataLayerBefore(map))
    // 先以 0 加入再調整，利用 style 預設 300ms transition 淡入
    const raf = requestAnimationFrame(() => map.setPaintProperty(id, 'raster-opacity', opacity))
    return () => {
      cancelAnimationFrame(raf)
      removeLayerAndSource(map, id)
    }
  }, [map, id, src, opacity])
}
