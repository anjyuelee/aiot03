import { useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected } from '../api'
import { useStore } from '../store'
import { fmtClock } from '../lib/format'

export default function StatusBadge() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const imageKind = layer === 'radar' || layer === 'satellite' ? layer : null
  const obs = useObservations()
  const overlay = useOverlay(imageKind)
  const image = useReprojected(imageKind ? overlay.data?.data ?? null : null)
  const times = useFutureTimes()
  const grid = useForecastGrid(t > 0 ? times[t - 1] ?? null : null)

  const q = imageKind ? overlay : t > 0 ? grid : obs
  if (q.isError || image.isError) return <div className="badge glass warn">暫時無法取得資料</div>
  if (!q.data) return <div className="badge glass">載入中…</div>

  const when = imageKind && overlay.data ? overlay.data.data.obsTime : q.data.updatedAt
  return (
    <div className={`badge glass ${q.data.stale ? 'warn' : ''}`}>
      {when ? `${imageKind ? '觀測' : '更新'}於 ${fmtClock(when)}` : '尚無資料'}
      {q.data.stale && ' · 資料可能非最新'}
    </div>
  )
}
