import { useMemo } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected, useSatellite, useSatelliteTiles } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { SCALES } from '../lib/colorScale'
import { renderHeat } from '../lib/heat'
import { ImageOverlay, useImageOverlay } from '../map/useImageOverlay'
import { useChoropleth } from '../map/useChoropleth'
import WindParticles from './WindParticles'

export default function DataLayers({ map }: { map: MlMap }) {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const def = LAYERS[layer]
  const times = useFutureTimes()
  const obs = useObservations()
  const grid = useForecastGrid(t > 0 ? times[t - 1] ?? null : null)
  const radar = useOverlay(layer === 'radar' ? 'radar' : null)
  const image = useReprojected(layer === 'radar' ? radar.data?.data ?? null : null)
  const satellite = useSatellite(layer === 'satellite')
  const clouds = useSatelliteTiles(layer === 'satellite' ? satellite.data?.data ?? null : null)

  const heat = useMemo(() => {
    if (t > 0 || !def.now || !obs.data) return null
    return renderHeat(obs.data.data, def.now.field, SCALES[def.now.scale].stops)
  }, [t, def, obs.data])

  const choropleth = useMemo(() => {
    if (t === 0 || !def.future || !grid.data) return null
    const field = def.future.field
    return new Map(grid.data.data.cells.map(c => [c.townId, c[field]] as const))
  }, [t, def, grid.data])

  useImageOverlay(map, 'heat', heat, 0.7)
  useImageOverlay(map, 'image', image.data ?? null, 0.9)
  useChoropleth(map, choropleth, t > 0 && def.future ? SCALES[def.future.scale].stops : null)
  const tiles = layer === 'satellite' ? clouds.data ?? [] : []
  return (
    <>
      {/* 雲的透明度已在像素裡，整體不透明度可以調高 */}
      {tiles.map((src, i) => <ImageOverlay key={i} map={map} id={`sat-${i}`} src={src} opacity={0.9} />)}
      {layer === 'wind' && t === 0 && obs.data && <WindParticles map={map} obs={obs.data.data} />}
    </>
  )
}
