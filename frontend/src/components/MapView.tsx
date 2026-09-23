import { useEffect, useRef } from 'react'
import { Map as MlMap } from 'maplibre-gl'
import { useTowns } from '../api'
import { useStore } from '../store'
import { nearest } from '../lib/geo'
import type { Town } from '../../../shared/types'

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export default function MapView({ onReady }: { onReady: (map: MlMap | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const towns = useRef<Town[]>([])
  const { data } = useTowns()
  towns.current = data?.data ?? []

  useEffect(() => {
    const map = new MlMap({
      container: ref.current!,
      style: BASEMAP,
      center: [120.9, 23.7],
      zoom: 6.6,
      minZoom: 4,
      maxZoom: 12,
      attributionControl: { compact: true },
    })
    map.on('load', () => onReady(map))
    map.on('click', e => {
      const t = nearest(towns.current, e.lngLat.lng, e.lngLat.lat)
      if (t) useStore.getState().selectTown(t.id)
    })
    return () => {
      onReady(null)
      map.remove()
    }
  }, [onReady])

  return <div ref={ref} className="map" />
}
