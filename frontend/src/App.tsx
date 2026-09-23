import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'
import DataLayers from './components/DataLayers'
import SelectionMarker from './components/SelectionMarker'
import SearchBox from './components/SearchBox'
import StatusBadge from './components/StatusBadge'
import LayerPicker from './components/LayerPicker'
import Timeline from './components/Timeline'
import LocationCard from './components/LocationCard'

export default function App() {
  const [map, setMap] = useState<MlMap | null>(null)
  return (
    <>
      <MapView onReady={setMap} />
      {map && <DataLayers map={map} />}
      {map && <SelectionMarker map={map} />}
      <div className="top-left">
        <SearchBox map={map} />
        <StatusBadge />
      </div>
      <LayerPicker />
      <Timeline />
      <LocationCard />
    </>
  )
}
