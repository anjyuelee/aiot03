import { useEffect, useRef, useState } from 'react'
import { Map as MlMap, setWorkerUrl } from 'maplibre-gl'
// 預設以 import.meta.url 找 worker，vite build 不會輸出該檔；改由 Vite 打包 worker（含其相依）
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useTowns } from '../api'
import { useStore } from '../store'
import { nearest } from '../lib/geo'
import { TAIWAN_BOUNDS } from '../lib/heat'
import type { Town } from '../../../shared/types'

setWorkerUrl(workerUrl)

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export default function MapView({ onReady }: { onReady: (map: MlMap | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const towns = useRef<Town[]>([])
  // URL 帶入的地點，鄉鎮資料載入後飛過去一次
  const initialTown = useRef(useStore.getState().town)
  const { data } = useTowns()
  towns.current = data?.data ?? []
  // 沒指定地點時，以瀏覽器定位飛到使用者所在位置
  const [here, setHere] = useState<{ lon: number; lat: number } | null>(null)

  useEffect(() => {
    const map = new MlMap({
      container: ref.current!,
      style: BASEMAP,
      // 依視窗大小讓台灣本島填滿畫面；底部留給時間軸
      bounds: [[119.9, 21.85], [122.05, 25.35]],
      fitBoundsOptions: { padding: { top: 40, bottom: 110, left: 40, right: 40 } },
      minZoom: 4,
      maxZoom: 16,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.on('load', () => onReady(map))
    map.on('click', e => {
      const { lng, lat } = e.lngLat
      const [w, s, east, n] = TAIWAN_BOUNDS
      if (lng < w || lng > east || lat < s || lat > n) return
      const t = nearest(towns.current, lng, lat)
      if (t) useStore.getState().selectTown(t.id)
    })
    return () => {
      onReady(null)
      mapRef.current = null
      map.remove()
    }
  }, [onReady])

  useEffect(() => {
    const t = data?.data.find(x => x.id === initialTown.current)
    if (!t || !mapRef.current) return
    initialTown.current = null
    mapRef.current.flyTo({ center: [t.lon, t.lat], zoom: 10 })
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
    mapRef.current.flyTo({ center: [here.lon, here.lat], zoom: 10 })
  }, [here, data])

  return <div ref={ref} className="map" />
}
