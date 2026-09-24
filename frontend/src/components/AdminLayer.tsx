import { useEffect, useMemo } from 'react'
import type { ExpressionSpecification, FilterSpecification, Map as MlMap } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import { useBoundaries, useTowns } from '../api'
import { useStore } from '../store'
import { countyOf } from '../lib/geo'
import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'

// 前三色可兩兩區分（含色盲模擬）；第四色用淺灰，只有鄉鎮需要
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c3c2b7']
const COLOR: ExpressionSpecification = ['match', ['get', 'color'], 0, PALETTE[0], 1, PALETTE[1], 2, PALETTE[2], PALETTE[3]]
const COUNTY_FILL = 'admin-county'
const TOWN_FILL = 'admin-town'
const LABELS = 'admin-labels'
const inCounty = (county: string | null): ExpressionSpecification => ['==', ['get', 'COUNTYCODE'], county ?? '']

/** 行政區圖層：全台時各縣市分色；選了縣市後改為其中鄉鎮分色，其他縣市變淡 */
export default function AdminLayer({ map }: { map: MlMap }) {
  const county = useStore(s => s.county)
  const shapes = useBoundaries().data
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
    map.addSource(COUNTY_FILL, { type: 'geojson', data: shapes.countyShapes })
    map.addSource(TOWN_FILL, { type: 'geojson', data: shapes.townShapes })
    map.addSource(LABELS, { type: 'geojson', data: labels })
    map.addLayer({ id: COUNTY_FILL, type: 'fill', source: COUNTY_FILL, paint: { 'fill-color': COLOR } }, before)
    map.addLayer({ id: TOWN_FILL, type: 'fill', source: TOWN_FILL, paint: { 'fill-color': COLOR, 'fill-opacity': 0.5 } }, before)
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
      removeLayerAndSource(map, TOWN_FILL)
      removeLayerAndSource(map, COUNTY_FILL)
    }
  }, [map, shapes, labels])

  useEffect(() => {
    if (!shapes || !labels) return
    map.setPaintProperty(COUNTY_FILL, 'fill-opacity',
      ['case', inCounty(county), 0, county ? 0.15 : 0.5] as ExpressionSpecification)
    map.setFilter(TOWN_FILL, inCounty(county))
    const labelFilter: FilterSpecification = county
      ? ['all', ['==', ['get', 'level'], 'town'], inCounty(county)]
      : ['==', ['get', 'level'], 'county']
    map.setFilter(LABELS, labelFilter)
  }, [map, shapes, labels, county])

  return null
}
