import { useEffect } from 'react'
import type { FilterSpecification, Map as MlMap } from 'maplibre-gl'
import { useBoundaries, useTownShapes } from '../api'
import { useStore } from '../store'
import { TOWN_HIT, firstSymbolLayer, removeLayerAndSource } from '../map/helpers'

const TOWN_LINE = 'town-line'
const COUNTY_LINE = 'county-line'
const SELECTED = 'town-selected'
const COUNTY = 'county-shape'
const COUNTY_SELECTED = 'county-selected'
const selected = (town: string | null): FilterSpecification => ['==', ['get', 'TOWNCODE'], town ?? '']
const selectedCounty = (county: string | null): FilterSpecification => ['==', ['get', 'COUNTYCODE'], county ?? '']

/** 縣市／鄉鎮界線，以及鄉鎮點擊判定用的透明多邊形與縣市／鄉鎮選取外框 */
export default function Boundaries({ map }: { map: MlMap }) {
  const town = useStore(s => s.town)
  const county = useStore(s => s.county)
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
      paint: { 'line-color': '#ffffff', 'line-width': 0.6, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 9, 0.3] } }, before)
    map.addLayer({ id: COUNTY_LINE, type: 'line', source: COUNTY_LINE,
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.45, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 11, 1.6] } }, before)
    map.addLayer({ id: COUNTY_SELECTED, type: 'line', source: COUNTY, filter: selectedCounty(useStore.getState().county),
      paint: { 'line-color': '#ffffff', 'line-width': 2 } }, before)
    map.addLayer({ id: SELECTED, type: 'line', source: TOWN_HIT, filter: selected(useStore.getState().town),
      paint: { 'line-color': '#3b82f6', 'line-width': 2.5 } }, before)
    return () => {
      removeLayerAndSource(map, COUNTY_SELECTED)
      removeLayerAndSource(map, COUNTY)
      removeLayerAndSource(map, SELECTED)
      removeLayerAndSource(map, COUNTY_LINE)
      removeLayerAndSource(map, TOWN_LINE)
      removeLayerAndSource(map, TOWN_HIT)
    }
  }, [map, ready, shapes.data, lines.data])

  useEffect(() => {
    if (ready) map.setFilter(SELECTED, selected(town))
  }, [map, ready, town])

  useEffect(() => {
    if (ready) map.setFilter(COUNTY_SELECTED, selectedCounty(county))
  }, [map, ready, county])

  return null
}
