import { useEffect, useRef } from 'react'
import { Popup, type FilterSpecification, type Map as MlMap, type MapLayerMouseEvent } from 'maplibre-gl'
import type { Typhoon } from '../../../shared/types'
import { fixLines, toGeoJSON, typhoonBounds } from '../lib/typhoon'
import { firstSymbolLayer, removeLayerAndSource } from '../map/helpers'

const SRC = 'typhoon'
const POINTS = 'typhoon-points'
const LAYER_IDS = ['typhoon-cone', 'typhoon-wind-fill', 'typhoon-wind-line', 'typhoon-track-past', 'typhoon-track-forecast', POINTS]
const role = (r: string): FilterSpecification => ['==', ['get', 'role'], r]
// 左側避開 .card（340px＋間距）；手機版卡片在底部
const fitPadding = () => matchMedia('(max-width: 640px)').matches
  ? { top: 60, bottom: Math.round(innerHeight * 0.45), left: 20, right: 20 }
  : { top: 60, bottom: 110, left: 380, right: 140 }

export default function TyphoonLayer({ map, list }: { map: MlMap; list: Typhoon[] }) {
  const fitted = useRef(false)

  useEffect(() => {
    const before = firstSymbolLayer(map)
    map.addSource(SRC, { type: 'geojson', data: toGeoJSON(list) })
    map.addLayer({ id: 'typhoon-cone', type: 'line', source: SRC, filter: role('cone'),
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 1 } }, before)
    map.addLayer({ id: 'typhoon-wind-fill', type: 'fill', source: SRC, filter: role('wind'),
      paint: { 'fill-color': '#fa5252', 'fill-opacity': 0.2 } }, before)
    map.addLayer({ id: 'typhoon-wind-line', type: 'line', source: SRC, filter: role('wind'),
      paint: { 'line-color': '#fa5252', 'line-width': 1.5 } }, before)
    map.addLayer({ id: 'typhoon-track-past', type: 'line', source: SRC, filter: role('track-past'),
      paint: { 'line-color': '#ffffff', 'line-width': 2 } }, before)
    map.addLayer({ id: 'typhoon-track-forecast', type: 'line', source: SRC, filter: role('track-forecast'),
      paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] } }, before)
    map.addLayer({ id: POINTS, type: 'circle', source: SRC, filter: role('point'),
      paint: {
        'circle-radius': ['case', ['get', 'current'], 7, 4],
        'circle-color': ['case', ['get', 'current'], '#fa5252', ['==', ['get', 'kind'], 'past'], '#ffffff', '#0b0e17'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['get', 'current'], 2, 1],
      } })

    // 每次點擊建新的 popup：沿用同一個時，addTo 期間舊的 closeOnClick 監聽仍會在同一次 click 觸發而立刻關掉它
    let popup: Popup | null = null
    const onClick = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      const t = list[p.ti]
      const f = (p.kind === 'past' ? t.past : t.forecast)[p.i]
      const el = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = t.name
      el.append(title, ...fixLines(f).map(line => Object.assign(document.createElement('div'), { textContent: line })))
      popup?.remove()
      popup = new Popup({ closeButton: false, className: 'typhoon-popup' }).setLngLat([f.lon, f.lat]).setDOMContent(el).addTo(map)
    }
    const pointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const unpointer = () => { map.getCanvas().style.cursor = '' }
    map.on('click', POINTS, onClick)
    map.on('mouseenter', POINTS, pointer)
    map.on('mouseleave', POINTS, unpointer)

    return () => {
      map.off('click', POINTS, onClick)
      map.off('mouseenter', POINTS, pointer)
      map.off('mouseleave', POINTS, unpointer)
      unpointer()
      popup?.remove()
      for (const id of LAYER_IDS) removeLayerAndSource(map, id)
      removeLayerAndSource(map, SRC)
    }
  }, [map, list])

  // 每次切入颱風圖層只縮放一次，之後不干擾使用者自行移動
  useEffect(() => {
    if (fitted.current || list.length === 0) return
    fitted.current = true
    const [w, s, e, n] = typhoonBounds(list)
    map.fitBounds([[w, s], [e, n]], { padding: fitPadding(), maxZoom: 7 })
  }, [map, list])

  return null
}
