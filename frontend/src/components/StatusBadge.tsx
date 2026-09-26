import {
  useEarthquakes, useForecastGrid, useFutureTimes, useObservations, useRadar, useRadarFrames, useSatellite, useSatelliteClouds, useTyphoons, useWarnings,
} from '../api'
import { useStore } from '../store'
import { fmtClock } from '../lib/format'

export default function StatusBadge() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const cloudMode = useStore(s => s.cloudMode)
  const isRadar = layer === 'radar'
  const isSatellite = layer === 'satellite'
  const isTyphoon = layer === 'typhoon'
  const isWarning = layer === 'warning'
  const isQuake = layer === 'quake'
  const obs = useObservations()
  const radar = useRadar(isRadar)
  const radarFrames = useRadarFrames(isRadar ? radar.data?.data ?? null : null)
  const satellite = useSatellite(isSatellite)
  const clouds = useSatelliteClouds(isSatellite ? satellite.data?.data ?? null : null, cloudMode)
  const typhoon = useTyphoons(isTyphoon)
  const warnings = useWarnings()
  const quakes = useEarthquakes()
  const times = useFutureTimes()
  const grid = useForecastGrid(t > 0 ? times[t - 1] ?? null : null)

  const q = isQuake ? quakes : isWarning ? warnings : isTyphoon ? typhoon : isSatellite ? satellite : isRadar ? radar : t > 0 ? grid : obs
  if (q.isError || radarFrames.at(-1)?.isError || clouds.isError) return <div className="badge glass warn">暫時無法取得資料</div>
  if (!q.data) return <div className="badge glass">載入中…</div>

  const when = isSatellite ? satellite.data?.data.obsTime : isRadar ? radar.data?.data.frames.at(-1)?.time : q.data.updatedAt
  return (
    <div className={`badge glass ${q.data.stale ? 'warn' : ''}`}>
      {when ? `${isRadar || isSatellite ? '觀測' : '更新'}於 ${fmtClock(when)}` : '尚無資料'}
      {q.data.stale && ' · 資料可能非最新'}
    </div>
  )
}
