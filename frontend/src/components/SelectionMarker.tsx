import { useEffect } from 'react'
import { Marker, type Map as MlMap } from 'maplibre-gl'
import { useTowns } from '../api'
import { useStore } from '../store'

export default function SelectionMarker({ map }: { map: MlMap }) {
  const town = useStore(s => s.town)
  const { data } = useTowns()
  useEffect(() => {
    const t = data?.data.find(x => x.id === town)
    if (!t) return
    const marker = new Marker({ color: '#3b82f6' }).setLngLat([t.lon, t.lat]).addTo(map)
    return () => { marker.remove() }
  }, [map, town, data])
  return null
}
