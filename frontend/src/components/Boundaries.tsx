import { useEffect } from 'react'
import type { ExpressionSpecification, FilterSpecification, Map as MlMap } from 'maplibre-gl'
import { useBoundaries, useTownShapes, useWarnings } from '../api'
import { useStore } from '../store'
import { inkOf } from '../lib/basemaps'
import {
  COUNTY_SELECTED_WIDTH, WARNING_CASING_WIDTH, WARNING_LINE_WIDTH, countyColor, countyFilter, countyRank, outlineOpacity, type WidthStops,
} from '../lib/warnings'
import { TOWN_HIT, firstSymbolLayer, removeLayerAndSource } from '../map/helpers'

const TOWN_LINE = 'town-line'
const COUNTY_LINE = 'county-line'
const SELECTED = 'town-selected'
const COUNTY = 'county-shape'
const COUNTY_SELECTED = 'county-selected'
const WARNING_CASING = 'warning-casing'
const WARNING_LINE = 'warning-line'
const selected = (town: string | null): FilterSpecification => ['==', ['get', 'TOWNCODE'], town ?? '']
const selectedCounty = (county: string | null): FilterSpecification => ['==', ['get', 'COUNTYCODE'], county ?? '']
const byZoom = ([z7, z11]: WidthStops): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 7, z7, 11, z11]

/** 縣市／鄉鎮界線、特報縣市描邊，以及鄉鎮點擊判定用的透明多邊形與縣市／鄉鎮選取外框 */
export default function Boundaries({ map }: { map: MlMap }) {
  const town = useStore(s => s.town)
  const county = useStore(s => s.county)
  const ink = useStore(s => inkOf(s.basemap))
  const outline = useStore(s => outlineOpacity(s.layer, s.pos))
  const warnings = useWarnings().data?.data
  const shapes = useTownShapes()
  const lines = useBoundaries()
  const ready = !!shapes.data && !!lines.data

  useEffect(() => {
    if (!ready) return
    const before = firstSymbolLayer(map)
    map.addSource(TOWN_HIT, { type: 'geojson', data: shapes.data! })
    map.addSource(TOWN_LINE, { type: 'geojson', data: lines.data!.towns })
    map.addSource(COUNTY_LINE, { type: 'geojson', data: lines.data!.counties })
    map.addSource(COUNTY, { type: 'geojson', data: lines.data!.countyShapes })
    // 透明度 0 仍可被 queryRenderedFeatures 查到
    map.addLayer({ id: TOWN_HIT, type: 'fill', source: TOWN_HIT, paint: { 'fill-opacity': 0 } }, before)
    // 縮小時鄉鎮界太密，放大後才漸漸出現
    map.addLayer({ id: TOWN_LINE, type: 'line', source: TOWN_LINE,
      paint: { 'line-color': ink, 'line-width': 0.6, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 9, 0.3] } }, before)
    map.addLayer({ id: COUNTY_LINE, type: 'line', source: COUNTY_LINE,
      paint: { 'line-color': ink, 'line-opacity': 0.45, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 11, 1.6] } }, before)
    // 特報描邊疊在縣市界之上、選取外框之下；以目前的值建立，之後由下方 effect 更新
    const list = warnings ?? []
    map.addLayer({ id: WARNING_CASING, type: 'line', source: COUNTY, filter: countyFilter(list), layout: { 'line-join': 'round' },
      paint: { 'line-color': 'rgba(0,0,0,0.55)', 'line-opacity': outline, 'line-width': byZoom(WARNING_CASING_WIDTH) } }, before)
    map.addLayer({ id: WARNING_LINE, type: 'line', source: COUNTY, filter: countyFilter(list),
      layout: { 'line-join': 'round', 'line-sort-key': countyRank(list) },
      paint: { 'line-color': countyColor(list), 'line-opacity': outline, 'line-width': byZoom(WARNING_LINE_WIDTH) } }, before)
    map.addLayer({ id: COUNTY_SELECTED, type: 'line', source: COUNTY, filter: selectedCounty(useStore.getState().county),
      paint: { 'line-color': ink, 'line-width': byZoom(COUNTY_SELECTED_WIDTH) } }, before)
    map.addLayer({ id: SELECTED, type: 'line', source: TOWN_HIT, filter: selected(useStore.getState().town),
      paint: { 'line-color': '#3b82f6', 'line-width': 2.5 } }, before)
    return () => {
      removeLayerAndSource(map, WARNING_LINE)
      removeLayerAndSource(map, WARNING_CASING)
      removeLayerAndSource(map, COUNTY_SELECTED)
      removeLayerAndSource(map, COUNTY)
      removeLayerAndSource(map, SELECTED)
      removeLayerAndSource(map, COUNTY_LINE)
      removeLayerAndSource(map, TOWN_LINE)
      removeLayerAndSource(map, TOWN_HIT)
    }
  }, [map, ready, shapes.data, lines.data, ink])

  useEffect(() => {
    if (ready) map.setFilter(SELECTED, selected(town))
  }, [map, ready, town])

  useEffect(() => {
    if (ready) map.setFilter(COUNTY_SELECTED, selectedCounty(county))
  }, [map, ready, county])

  // 特報變動時只換篩選、顏色與排序，不重建圖層
  useEffect(() => {
    if (!ready) return
    const list = warnings ?? []
    map.setFilter(WARNING_CASING, countyFilter(list))
    map.setFilter(WARNING_LINE, countyFilter(list))
    map.setPaintProperty(WARNING_LINE, 'line-color', countyColor(list))
    map.setLayoutProperty(WARNING_LINE, 'line-sort-key', countyRank(list))
  }, [map, ready, warnings])

  useEffect(() => {
    if (!ready) return
    map.setPaintProperty(WARNING_CASING, 'line-opacity', outline)
    map.setPaintProperty(WARNING_LINE, 'line-opacity', outline)
  }, [map, ready, outline])

  return null
}
