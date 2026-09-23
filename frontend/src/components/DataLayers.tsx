import { useMemo } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { useObservations, useOverlay, useReprojected } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { SCALES } from '../lib/colorScale'
import { renderHeat } from '../lib/heat'
import { useImageOverlay } from '../map/useImageOverlay'

export default function DataLayers({ map }: { map: MlMap }) {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const def = LAYERS[layer]
  const obs = useObservations()
  const imageKind = layer === 'radar' || layer === 'satellite' ? layer : null
  const overlay = useOverlay(imageKind)
  const image = useReprojected(imageKind ? overlay.data?.data ?? null : null)

  const heat = useMemo(() => {
    if (t > 0 || !def.now || !obs.data) return null
    return renderHeat(obs.data.data, def.now.field, SCALES[def.now.scale].stops)
  }, [t, def, obs.data])

  useImageOverlay(map, 'heat', heat, 0.7)
  useImageOverlay(map, 'image', image.data ?? null, layer === 'radar' ? 0.9 : 0.7)
  return null
}
