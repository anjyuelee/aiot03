import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'

export default function App() {
  const [, setMap] = useState<MlMap | null>(null)
  return <MapView onReady={setMap} />
}
