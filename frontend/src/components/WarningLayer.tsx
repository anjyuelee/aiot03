import { useEffect } from 'react'
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl'
import type { Warning } from '../../../shared/types'
import { useBoundaries } from '../api'
import { worstByCounty } from '../lib/warnings'
import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'

const ID = 'warning-fill'
const NONE = 'rgba(0,0,0,0)'

/** 有特報的縣市依最嚴重種類著色，其餘透明；match 至少要一組對應，沒有特報時直接給透明色 */
function fillColor(list: Warning[]): string | ExpressionSpecification {
  const colors = [...worstByCounty(list)]
  if (colors.length === 0) return NONE
  const expr: unknown[] = ['match', ['get', 'COUNTYCODE'], ...colors.flat(), NONE]
  return expr as ExpressionSpecification
}

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
    if (counties) map.setPaintProperty(ID, 'fill-color', fillColor(list))
  }, [map, counties, list])

  return null
}
