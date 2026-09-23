import { useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected, useSatellite, useSatelliteClouds } from '../api'
import { useStore } from '../store'
import { fmtClock } from '../lib/format'

export default function StatusBadge() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const isRadar = layer === 'radar'
  const isSatellite = layer === 'satellite'
  const obs = useObservations()
  const radar = useOverlay(isRadar ? 'radar' : null)
  const image = useReprojected(isRadar ? radar.data?.data ?? null : null)
  const satellite = useSatellite(isSatellite)
  const clouds = useSatelliteClouds(isSatellite ? satellite.data?.data ?? null : null)
  const times = useFutureTimes()
  const grid = useForecastGrid(t > 0 ? times[t - 1] ?? null : null)

  const q = isSatellite ? satellite : isRadar ? radar : t > 0 ? grid : obs
  if (q.isError || image.isError || clouds.isError) return <div className="badge glass warn">暫時無法取得資料</div>
  if (!q.data) return <div className="badge glass">載入中…</div>

  const when = isSatellite ? satellite.data?.data.obsTime : isRadar ? radar.data?.data.obsTime : q.data.updatedAt
  return (
    <div className={`badge glass ${q.data.stale ? 'warn' : ''}`}>
      {when ? `${isRadar || isSatellite ? '觀測' : '更新'}於 ${fmtClock(when)}` : '尚無資料'}
      {q.data.stale && ' · 資料可能非最新'}
    </div>
  )
}
