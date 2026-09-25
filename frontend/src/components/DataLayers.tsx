import { useMemo } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { lerpValues } from '../lib/playback'
import { usePrefetchGrids, useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected, useSatellite, useSatelliteClouds, useTyphoons } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { SCALES } from '../lib/colorScale'
import { renderHeat } from '../lib/heat'
import type { CanvasOverlay } from '../lib/reproject'
import { useImageOverlay } from '../map/useImageOverlay'
import { useChoropleth } from '../map/useChoropleth'
import WindParticles from './WindParticles'
import TyphoonLayer from './TyphoonLayer'
import AdminLayer from './AdminLayer'

export default function DataLayers({ map }: { map: MlMap }) {
  const layer = useStore(s => s.layer)
  const pos = useStore(s => s.pos)
  const playing = useStore(s => s.playing)
  const cloudMode = useStore(s => s.cloudMode)
  // 每格切成 20 階看起來就是連續的，也不必每一幀都重設 368 個鄉鎮的顏色
  const q = Math.round(pos * 20) / 20
  const i = Math.floor(q)
  const f = q - i
  const future = q > 0
  const def = LAYERS[layer]
  const times = useFutureTimes()
  const obs = useObservations()
  usePrefetchGrids(times, playing && !!def.future)
  // 位置落在第 i 格與第 i + 1 格之間；第 0 格是「現在」的觀測熱圖，不是預報
  const gridA = useForecastGrid(i >= 1 ? times[i - 1] ?? null : null)
  const gridB = useForecastGrid(f > 0 ? times[i] ?? null : null)
  const radar = useOverlay(layer === 'radar' ? 'radar' : null)
  const image = useReprojected(layer === 'radar' ? radar.data?.data ?? null : null)
  const satellite = useSatellite(layer === 'satellite')
  const clouds = useSatelliteClouds(layer === 'satellite' ? satellite.data?.data ?? null : null, cloudMode)
  const typhoon = useTyphoons(layer === 'typhoon')

  // 熱圖只依欄位與觀測資料而定，時間軸來回切換時重用
  const heatCache = useMemo(() => new Map<string, CanvasOverlay>(), [obs.data])
  const heat = useMemo(() => {
    if (i >= 1 || !def.now || !obs.data) return null
    const { field, scale } = def.now
    let overlay = heatCache.get(field)
    if (!overlay) heatCache.set(field, overlay = renderHeat(obs.data.data, field, SCALES[scale].stops))
    return overlay
  }, [i, def, obs.data, heatCache])

  const field = def.future?.field
  const valuesA = useMemo(() => field && gridA.data ? new Map(gridA.data.data.cells.map(c => [c.townId, c[field]] as const)) : null, [field, gridA.data])
  const valuesB = useMemo(() => field && gridB.data ? new Map(gridB.data.data.cells.map(c => [c.townId, c[field]] as const)) : null, [field, gridB.data])
  const choropleth = useMemo(() => {
    if (!future || !field) return null
    return lerpValues(i >= 1 ? valuesA : null, f > 0 ? valuesB : null, f)
  }, [future, field, i, f, valuesA, valuesB])

  // 「現在」到第一個預報時段之間，觀測熱圖淡出、鄉鎮預報淡入
  useImageOverlay(map, 'heat', heat, 0.7 * (i === 0 ? 1 - f : 0))
  useImageOverlay(map, 'image', image.data ?? null, 0.9)
  // 雲的透明度已在像素裡，整體不透明度可以調高
  useImageOverlay(map, 'satellite', layer === 'satellite' ? clouds.data ?? null : null, 0.9)
  useChoropleth(map, choropleth, future && def.future ? SCALES[def.future.scale].stops : null, i === 0 ? f : 1)
  return (
    <>
      {layer === 'wind' && !future && obs.data && <WindParticles map={map} obs={obs.data.data} />}
      {layer === 'typhoon' && typhoon.data && <TyphoonLayer map={map} list={typhoon.data.data} />}
      {layer === 'admin' && <AdminLayer map={map} />}
    </>
  )
}
