import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Map as MlMap, setWorkerUrl } from 'maplibre-gl'
// 預設以 import.meta.url 找 worker，vite build 不會輸出該檔；改由 Vite 打包 worker（含其相依）
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useBoundaries, useTowns } from '../api'
import { useStore } from '../store'
import { countyBounds, nearest } from '../lib/geo'
import { TAIWAN_BOUNDS } from '../lib/heat'
import { FIT_PADDING, MAIN_ISLAND, TOWN_HIT } from '../map/helpers'
import { BASEMAPS } from '../lib/basemaps'
import type { Town } from '../../../shared/types'

setWorkerUrl(workerUrl)

// 颱風、地震圖層自己處理地圖點擊，切入時也會自動縮放到資料範圍
const ownsMap = () => ['typhoon', 'quake'].includes(useStore.getState().layer)

export default function MapView({ onReady }: { onReady: (map: MlMap | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const towns = useRef<Town[]>([])
  // URL 帶入的地點，鄉鎮資料載入後飛過去一次
  const initialTown = useRef(useStore.getState().town)
  const { data } = useTowns()
  towns.current = data?.data ?? []
  const shapes = useBoundaries().data
  const counties = useRef(shapes?.countyShapes)
  counties.current = shapes?.countyShapes
  const basemap = useStore(s => s.basemap)
  const applied = useRef(basemap)
  // 沒指定地點時，以瀏覽器定位飛到使用者所在位置
  const [here, setHere] = useState<{ lon: number; lat: number } | null>(null)

  useEffect(() => {
    const map = new MlMap({
      container: ref.current!,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      bounds: MAIN_ISLAND,
      fitBoundsOptions: { padding: FIT_PADDING },
      minZoom: 4,
      maxZoom: 16,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.on('load', () => onReady(map))
    map.on('click', e => {
      if (ownsMap()) return
      const { lng, lat } = e.lngLat
      const [w, s, east, n] = TAIWAN_BOUNDS
      if (lng < w || lng > east || lat < s || lat > n) return
      // 界線尚未載入時退回最近的鄉鎮中心
      if (!map.getLayer(TOWN_HIT)) {
        const t = nearest(towns.current, lng, lat)
        if (t) useStore.getState().selectTown(t.id)
        return
      }
      // 逐層選取：先選縣市並縮放過去，在該縣市內再點才選鄉鎮
      const hit = map.queryRenderedFeatures(e.point, { layers: [TOWN_HIT] })[0]?.properties
      if (!hit) return
      const { county, selectCounty, selectTown } = useStore.getState()
      if (hit.COUNTYCODE === county) return selectTown(hit.TOWNCODE)
      selectCounty(hit.COUNTYCODE)
      const b = counties.current && countyBounds(counties.current, hit.COUNTYCODE)
      if (b) map.fitBounds(b, { padding: FIT_PADDING, maxZoom: 11 })
    })
    return () => {
      onReady(null)
      mapRef.current = null
      map.remove()
    }
  }, [onReady])

  // 換底圖會清掉 style 裡所有圖層：先同步卸下資料圖層，新 style 載入後再掛回去讓它們重新加入
  useEffect(() => {
    const map = mapRef.current
    if (!map || basemap === applied.current) return
    applied.current = basemap
    let cancelled = false
    BASEMAPS[basemap].style().then(style => {
      if (cancelled) return
      flushSync(() => onReady(null))
      map.once('style.load', () => onReady(map))
      map.setStyle(style, { diff: false })
    })
    return () => { cancelled = true }
  }, [basemap, onReady])

  useEffect(() => {
    const t = data?.data.find(x => x.id === initialTown.current)
    if (!t || !mapRef.current) return
    initialTown.current = null
    // 颱風、地震圖層已自動縮放到資料範圍，不要被晚到的地點蓋掉
    if (!ownsMap()) mapRef.current.flyTo({ center: [t.lon, t.lat], zoom: 10 })
  }, [data])

  useEffect(() => {
    if (initialTown.current || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(p => setHere({ lon: p.coords.longitude, lat: p.coords.latitude }))
  }, [])

  useEffect(() => {
    if (!here || !data || !mapRef.current) return
    setHere(null)
    const [w, s, east, n] = TAIWAN_BOUNDS
    if (here.lon < w || here.lon > east || here.lat < s || here.lat > n) return
    // 定位回來前使用者已自行選了地點就不覆蓋
    if (useStore.getState().town) return
    const t = nearest(data.data, here.lon, here.lat)
    if (t) useStore.getState().selectTown(t.id)
    if (!ownsMap()) mapRef.current.flyTo({ center: [here.lon, here.lat], zoom: 10 })
  }, [here, data])

  return <div ref={ref} className="map" />
}
