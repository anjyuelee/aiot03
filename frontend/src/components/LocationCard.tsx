import { useObservations, useTownForecast } from '../api'
import { useStore } from '../store'
import { nearest } from '../lib/geo'
import { groupWeekByDay } from '../lib/week'
import { wxIcon } from '../lib/wx'
import ForecastChart from './ForecastChart'

export default function LocationCard() {
  const town = useStore(s => s.town)
  const selectTown = useStore(s => s.selectTown)
  const forecast = useTownForecast(town)
  const obs = useObservations()
  if (!town) return null

  const f = forecast.data?.data
  const now = f && obs.data ? nearest(obs.data.data.filter(o => o.temp != null), f.town.lon, f.town.lat) : null
  const upcoming = f ? f.hourly3.filter(s => Date.parse(s.start) + 3 * 3600_000 > Date.now()).slice(0, 16) : []
  const days = f ? groupWeekByDay(f.week) : []

  return (
    <aside className="card glass" aria-label="地點預報">
      <button className="close" onClick={() => selectTown(null)} aria-label="關閉">✕</button>
      {forecast.isLoading && <div className="skeleton" />}
      {forecast.isError && <p>無法載入預報，請稍後再試。</p>}
      {f && (
        <>
          <header>
            <h2>{f.town.name}</h2>
            <span className="muted">{f.town.county}</span>
          </header>
          <div className="now">
            <span className="big">{now?.temp != null ? `${Math.round(now.temp)}°` : '--'}</span>
            <div>
              <div>{wxIcon(upcoming[0]?.wxCode)} {upcoming[0]?.wx ?? ''}</div>
              <div className="muted">濕度 {now?.humidity ?? '--'}% · 風 {now?.windSpeed ?? '--'} m/s</div>
              {now && <div className="muted">最近測站：{now.name}</div>}
            </div>
          </div>
          <ForecastChart slots={upcoming} />
          <ul className="week">
            {days.map(d => (
              <li key={d.date}>
                <span>{d.label}</span>
                <span>{wxIcon(d.wxCode)}</span>
                <span className="muted">{d.pop != null ? `☂ ${d.pop}%` : ''}</span>
                <span>{d.min ?? '--'}° / {d.max ?? '--'}°</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
