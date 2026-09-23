import { useEffect } from 'react'
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl'
import { useTownShapes } from '../api'
import { fillColorExpr, type Stops } from '../lib/colorScale'
import { firstSymbolLayer, removeLayerAndSource } from './helpers'

const ID = 'choropleth'

export function useChoropleth(map: MlMap, values: Map<string, number | null> | null, stops: Stops | null) {
  const shapes = useTownShapes()
  useEffect(() => {
    if (!values || !stops || !shapes.data) return
    const data = {
      ...shapes.data,
      features: shapes.data.features.map(f => {
        const v = values.get(f.properties.TOWNCODE)
        return v == null ? f : { ...f, properties: { ...f.properties, value: v } }
      }),
    }
    map.addSource(ID, { type: 'geojson', data })
    map.addLayer({
      id: ID,
      type: 'fill',
      source: ID,
      paint: {
        'fill-color': ['case', ['has', 'value'], fillColorExpr(stops) as ExpressionSpecification, 'rgba(0,0,0,0)'] as ExpressionSpecification,
        'fill-opacity': 0.8,
        'fill-outline-color': 'rgba(255,255,255,0.12)',
      },
    }, firstSymbolLayer(map))
    return () => removeLayerAndSource(map, ID)
  }, [map, values, stops, shapes.data])
}
