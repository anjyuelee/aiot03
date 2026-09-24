import { useEffect, useMemo } from 'react'
import type { ExpressionSpecification, FilterSpecification, Map as MlMap } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { useTownShapes, useTowns } from '../api'
import { useStore } from '../store'
import { countyOf } from '../lib/geo'
import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'

const HIGHLIGHT = '#3b82f6'
const FILL = 'admin-fill'
const LABELS = 'admin-labels'
const inCounty = (county: string | null): ExpressionSpecification => ['==', ['get', 'COUNTYCODE'], county ?? '']

/** 行政區圖層：平常只有界線與名稱；點選的縣市或鄉鎮整塊填滿重點色 */
export default function AdminLayer({ map }: { map: MlMap }) {
  const county = useStore(s => s.county)
  const town = useStore(s => s.town)
  const shapes = useTownShapes().data
  const towns = useTowns().data?.data

  // 鄉鎮名放在中心點；縣市名放在其鄉鎮中心點的平均位置
  const labels = useMemo((): FeatureCollection<Point> | null => {
    if (!towns) return null
    const counties = new Map<string, { name: string; lon: number; lat: number; n: number }>()
    for (const t of towns) {
      const c = counties.get(countyOf(t.id)) ?? { name: t.county, lon: 0, lat: 0, n: 0 }
      counties.set(countyOf(t.id), { ...c, lon: c.lon + t.lon, lat: c.lat + t.lat, n: c.n + 1 })
    }
    const point = (lon: number, lat: number, props: object) =>
      ({ type: 'Feature' as const, properties: props, geometry: { type: 'Point' as const, coordinates: [lon, lat] } })
    return {
      type: 'FeatureCollection',
      features: [
        ...[...counties].map(([code, c]) => point(c.lon / c.n, c.lat / c.n, { name: c.name, level: 'county', COUNTYCODE: code })),
        ...towns.map(t => point(t.lon, t.lat, { name: t.name, level: 'town', COUNTYCODE: countyOf(t.id) })),
      ],
    }
  }, [towns])

  useEffect(() => {
    if (!shapes || !labels) return
    const before = dataLayerBefore(map)
    map.addSource(FILL, { type: 'geojson', data: shapes })
    map.addSource(LABELS, { type: 'geojson', data: labels })
    map.addLayer({ id: FILL, type: 'fill', source: FILL, paint: { 'fill-color': HIGHLIGHT, 'fill-opacity': 0 } }, before)
    // 放在最上層，與底圖地名碰撞時優先顯示
    map.addLayer({ id: LABELS, type: 'symbol', source: LABELS,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
        'text-size': ['case', ['==', ['get', 'level'], 'county'], 14, 12],
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.5 } })
    return () => {
      removeLayerAndSource(map, LABELS)
      removeLayerAndSource(map, FILL)
    }
  }, [map, shapes, labels])

  useEffect(() => {
    if (!shapes || !labels) return
    // 選了鄉鎮：該鄉鎮填滿、同縣市其他鄉鎮淡淡上色；只選縣市：整個縣市填滿
    map.setPaintProperty(FILL, 'fill-opacity', (town
      ? ['case', ['==', ['get', 'TOWNCODE'], town], 0.55, inCounty(county), 0.15, 0]
      : ['case', inCounty(county), 0.45, 0]) as ExpressionSpecification)
    const labelFilter: FilterSpecification = county
      ? ['all', ['==', ['get', 'level'], 'town'], inCounty(county)]
      : ['==', ['get', 'level'], 'county']
    map.setFilter(LABELS, labelFilter)
  }, [map, shapes, labels, county, town])

  return null
}
