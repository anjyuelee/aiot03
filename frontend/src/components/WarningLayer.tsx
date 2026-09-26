import { useEffect } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { Warning } from '../../../shared/types'
import { useBoundaries } from '../api'
import { countyColor } from '../lib/warnings'
import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'

const ID = 'warning-fill'
const NONE = 'rgba(0,0,0,0)'

export default function WarningLayer({ map, list }: { map: MlMap; list: Warning[] }) {
  const counties = useBoundaries().data?.countyShapes

  useEffect(() => {
    if (!counties) return
    map.addSource(ID, { type: 'geojson', data: counties })
    // 插在界線之下，縣市／鄉鎮界仍疊在色塊上
    map.addLayer({ id: ID, type: 'fill', source: ID, paint: { 'fill-color': NONE, 'fill-opacity': 0.45 } }, dataLayerBefore(map))
    return () => removeLayerAndSource(map, ID)
  }, [map, counties])

  // 特報變動時只換顏色，不重建圖層
  useEffect(() => {
    if (counties) map.setPaintProperty(ID, 'fill-color', countyColor(list))
  }, [map, counties, list])

  return null
}
