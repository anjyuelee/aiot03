import { useEffect, useMemo, useRef } from 'react'
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import type { Earthquake } from '../../../shared/types'
import { pickQuake, quakeBounds, toGeoJSON } from '../lib/quakes'
import { cardFitPadding, dataLayerBefore, removeLayerAndSource } from '../map/helpers'
import { useStore } from '../store'
import { inkOf } from '../lib/basemaps'

const SRC = 'quake'
const STATIONS = 'quake-stations'
const EPICENTERS = 'quake-epicenters'
const SELECTED = 'quake-selected'
const STAR = 'quake-star'

/** 紅色白邊五角星；用 canvas 畫，不依賴底圖字型有沒有 ★ */
function starImage(size = 48): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const c = size / 2
  const r = c - 3
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5
    const d = i % 2 ? r * 0.45 : r
    g.lineTo(c + d * Math.cos(a), c + d * Math.sin(a))
  }
  g.closePath()
  g.fillStyle = '#fa5252'
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = '#ffffff'
  g.stroke()
  return g.getImageData(0, 0, size, size)
}

export default function QuakeLayer({ map, list }: { map: MlMap; list: Earthquake[] }) {
  const quake = useStore(s => s.quake)
  const ink = useStore(s => inkOf(s.basemap))
  const selected = pickQuake(list, quake)
  const selectedId = selected?.id ?? null
  const data = useMemo(() => toGeoJSON(list, selectedId), [list, selectedId])
  // 重建圖層（換底圖 ink 色）時要用最新資料，不必把 data 放進依賴而每次都重建
  const latest = useRef({ data, selected })
  latest.current = { data, selected }

  useEffect(() => {
    const before = dataLayerBefore(map)
    if (!map.hasImage(STAR)) map.addImage(STAR, starImage(), { pixelRatio: 2 })
    map.addSource(SRC, { type: 'geojson', data: latest.current.data })
    map.addLayer({ id: STATIONS, type: 'circle', source: SRC, filter: ['==', ['get', 'role'], 'station'],
      paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': ink, 'circle-stroke-width': 0.5 } }, before)
    map.addLayer({ id: EPICENTERS, type: 'circle', source: SRC,
      filter: ['all', ['==', ['get', 'role'], 'epicenter'], ['!', ['get', 'selected']]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2, 4, 6, 16],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.5,
        'circle-stroke-color': ink,
        'circle-stroke-width': 1,
      } }, before)
    map.addLayer({ id: SELECTED, type: 'symbol', source: SRC,
      filter: ['all', ['==', ['get', 'role'], 'epicenter'], ['get', 'selected']],
      layout: { 'icon-image': STAR, 'icon-allow-overlap': true, 'icon-ignore-placement': true } }, before)

    const onClick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      if (typeof id === 'string') useStore.getState().selectQuake(id)
    }
    const pointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const unpointer = () => { map.getCanvas().style.cursor = '' }
    map.on('click', EPICENTERS, onClick)
    map.on('mouseenter', EPICENTERS, pointer)
    map.on('mouseleave', EPICENTERS, unpointer)

    return () => {
      map.off('click', EPICENTERS, onClick)
      map.off('mouseenter', EPICENTERS, pointer)
      map.off('mouseleave', EPICENTERS, unpointer)
      unpointer()
      for (const id of [SELECTED, EPICENTERS, STATIONS, SRC]) removeLayerAndSource(map, id)
      try {
        if (map.hasImage(STAR)) map.removeImage(STAR)
      } catch {
        // 地圖已被 remove
      }
    }
  }, [map, ink])

  // 資料或選取改變時只換資料，不重建圖層
  useEffect(() => {
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(data)
  }, [map, data])

  // 選取的地震換了才縮放（含切入圖層的預設選取）；同一筆重新取得資料不再移動畫面
  useEffect(() => {
    const q = latest.current.selected
    if (!q) return
    const [w, s, e, n] = quakeBounds(q)
    map.fitBounds([[w, s], [e, n]], { padding: cardFitPadding(), maxZoom: 9 })
  }, [map, selectedId])

  return null
}
