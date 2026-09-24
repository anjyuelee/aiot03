import { useEffect } from 'react'
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl'
import { useTownShapes } from '../api'
import { fillColorExpr, type Stops } from '../lib/colorScale'
import { dataLayerBefore, removeLayerAndSource } from './helpers'

const ID = 'choropleth'
const VALUE: ExpressionSpecification = ['feature-state', 'value']

/** 圖層只建立一次；時間軸切換時只更新 feature-state，不重建圖層 */
export function useChoropleth(map: MlMap, values: Map<string, number | null> | null, stops: Stops | null) {
  const shapes = useTownShapes()
  const active = !!values && !!stops && !!shapes.data

  useEffect(() => {
    if (!active) return
    map.addSource(ID, { type: 'geojson', data: shapes.data!, promoteId: 'TOWNCODE' })
    map.addLayer({
      id: ID,
      type: 'fill',
      source: ID,
      paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.8, 'fill-outline-color': 'rgba(255,255,255,0.12)' },
    }, dataLayerBefore(map))
    return () => removeLayerAndSource(map, ID)
  }, [map, active, shapes.data])

  useEffect(() => {
    if (!active) return
    map.setPaintProperty(ID, 'fill-color',
      ['case', ['!=', VALUE, null], fillColorExpr(stops!, VALUE) as ExpressionSpecification, 'rgba(0,0,0,0)'] as ExpressionSpecification)
  }, [map, active, stops])

  useEffect(() => {
    if (!active) return
    map.removeFeatureState({ source: ID })
    values!.forEach((value, id) => {
      if (value != null) map.setFeatureState({ source: ID, id }, { value })
    })
  }, [map, active, values])
}
