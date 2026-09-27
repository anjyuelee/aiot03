import { useEffect, useState } from 'react'
import type { CanvasSource, Map as MlMap } from 'maplibre-gl'
import { RADAR_BOUNDS, RADAR_GRID } from '../../../shared/radar'
import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'
import { useRadarFrame } from '../map/useRadarFrame'

const ID = 'radar'

/** 19 格共用一個 canvas source：切格時把該格畫進顯示用 canvas，再請 MapLibre 更新一次 texture */
export default function RadarLayer({ map }: { map: MlMap }) {
  const frame = useRadarFrame()?.canvas
  // 重投影後與格點同尺寸
  const [canvas] = useState(() => Object.assign(document.createElement('canvas'), { width: RADAR_GRID.nx, height: RADAR_GRID.ny }))

  useEffect(() => {
    const [w, s, e, n] = RADAR_BOUNDS
    map.addSource(ID, { type: 'canvas', canvas, animate: false, coordinates: [[w, n], [e, n], [e, s], [w, s]] })
    map.addLayer({ id: ID, type: 'raster', source: ID, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 } }, dataLayerBefore(map))
    return () => removeLayerAndSource(map, ID)
  }, [map, canvas])

  // 一格都沒有載入時不重畫
  useEffect(() => {
    if (!frame) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
    // animate: false 的 canvas source 只在 play 狀態下更新 texture；pause() 會先上傳一次再停
    const src = map.getSource(ID) as CanvasSource | undefined
    src?.play()
    src?.pause()
  }, [map, canvas, frame])

  return null
}
