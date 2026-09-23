import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'
import DataLayers from './components/DataLayers'
import StatusBadge from './components/StatusBadge'
import Timeline from './components/Timeline'

export default function App() {
  const [map, setMap] = useState<MlMap | null>(null)
  return (
    <>
      <MapView onReady={setMap} />
      {map && <DataLayers map={map} />}
      <div className="top-left">
        <StatusBadge />
      </div>
      <Timeline />
    </>
  )
}
