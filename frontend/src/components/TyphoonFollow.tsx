import { useEffect, useMemo, useRef } from 'react'
import type { FilterSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { Typhoon } from '../../../shared/types'
import { followGeoJSON, toGeoJSON } from '../lib/typhoon'
import { TYPHOON_FOLLOW_BOTTOM, overlayBefore, removeLayerAndSource } from '../map/helpers'
import { useStore } from '../store'
import { BASEMAPS, inkOf } from '../lib/basemaps'

const TRACK = 'typhoon-follow'
const NOW = 'typhoon-follow-now'
const LABEL = 'typhoon-follow-label'
const LAYER_IDS = [TYPHOON_FOLLOW_BOTTOM, 'typhoon-follow-wind-line', 'typhoon-follow-past', 'typhoon-follow-forecast', 'typhoon-follow-center', LABEL]
const role = (r: string): FilterSpecification => ['==', ['get', 'role'], r]

/** 天氣圖層上的颱風：路徑細線，以及跟著預報時間軸移動的中心、名稱與七級風圈；不參與點擊 */
export default function TyphoonFollow({ map, list, times, pos }: { map: MlMap; list: Typhoon[]; times: string[]; pos: number }) {
  const ink = useStore(s => inkOf(s.basemap))
  const dark = useStore(s => BASEMAPS[s.basemap].dark)
  const now = useMemo(() => followGeoJSON(list, times, pos), [list, times, pos])
  // 重建圖層時帶入目前位置，不必讓時間軸的每一步都重建
  const latest = useRef(now)
  latest.current = now

  useEffect(() => {
    const before = overlayBefore(map)
    map.addSource(TRACK, { type: 'geojson', data: toGeoJSON(list) })
    map.addSource(NOW, { type: 'geojson', data: latest.current })
    // 先加的在下：風圈 → 路徑 → 中心
    map.addLayer({ id: TYPHOON_FOLLOW_BOTTOM, type: 'fill', source: NOW, filter: role('wind'),
      paint: { 'fill-color': '#fa5252', 'fill-opacity': 0.15 } }, before)
    map.addLayer({ id: 'typhoon-follow-wind-line', type: 'line', source: NOW, filter: role('wind'),
      paint: { 'line-color': '#fa5252', 'line-width': 1.5 } }, before)
    map.addLayer({ id: 'typhoon-follow-past', type: 'line', source: TRACK, filter: role('track-past'),
      paint: { 'line-color': ink, 'line-width': 1, 'line-opacity': 0.6 } }, before)
    map.addLayer({ id: 'typhoon-follow-forecast', type: 'line', source: TRACK, filter: role('track-forecast'),
      paint: { 'line-color': ink, 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [2, 2] } }, before)
    map.addLayer({ id: 'typhoon-follow-center', type: 'circle', source: NOW, filter: role('center'),
      paint: { 'circle-radius': 6, 'circle-color': '#fa5252', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }, before)
    // 名稱放最上層：插在界線之下會變成最下面的文字圖層，Boundaries 重建時會把界線插進中心與名稱之間
    map.addLayer({ id: LABEL, type: 'symbol', source: NOW, filter: role('center'),
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
        'text-size': 12,
        'text-anchor': 'left',
        'text-offset': [0.8, 0],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': ink, 'text-halo-color': dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)', 'text-halo-width': 1.5 } })
    return () => {
      for (const id of LAYER_IDS) removeLayerAndSource(map, id)
      removeLayerAndSource(map, TRACK)
      removeLayerAndSource(map, NOW)
    }
  }, [map, list, ink, dark])

  useEffect(() => {
    map.getSource<GeoJSONSource>(NOW)?.setData(now)
  }, [map, now])

  return null
}
