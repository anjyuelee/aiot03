import { useRef } from 'react'
import { useEarthquakes } from '../api'
import { useStore } from '../store'
import { INTENSITY_LEGEND, fmtMagnitude, fmtQuakeTime, intensityColor, maxIntensity, pickQuake } from '../lib/quakes'

export default function QuakeCard() {
  const q = useEarthquakes()
  const quake = useStore(s => s.quake)
  const selectQuake = useStore(s => s.selectQuake)
  const ref = useRef<HTMLElement>(null)
  const list = q.data?.data ?? []
  const sel = pickQuake(list, quake)
  const choose = (id: string) => {
    selectQuake(id)
    ref.current?.scrollTo({ top: 0 })
  }
  return (
    <aside ref={ref} className="card glass" aria-label="地震資訊">
      <header><h2>🫨 有感地震</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入地震資料，請稍後再試。</p>}
      {q.data && !sel && <p className="muted">近期無有感地震資料</p>}
      {sel && (
        <>
          <section className="quake-detail">
            <h3>M{fmtMagnitude(sel.magnitude)} {sel.location}</h3>
            <div className="muted">
              {fmtQuakeTime(sel.time)} · 深度 {sel.depth} km · {sel.no != null ? `第 ${sel.no} 號` : '小區域有感地震'}
            </div>
            {sel.web && <a href={sel.web} target="_blank" rel="noreferrer">CWA 報告 ↗</a>}
          </section>
          <section className="quake-counties">
            {sel.counties.map(c => (
              <details key={`${sel.id}:${c.county}`}>
                <summary>
                  <span className="dot" style={{ background: intensityColor(c.intensity) }} />
                  <span>{c.county}</span>
                  <span className="muted">{c.intensity}</span>
                </summary>
                <ul>
                  {c.stations.map(s => (
                    <li key={s.id}><span>{s.name}</span><span className="muted">{s.intensity}</span></li>
                  ))}
                </ul>
              </details>
            ))}
            <div className="quake-legend">
              {INTENSITY_LEGEND.map(l => <span key={l.label} style={{ background: l.color }}>{l.label}</span>)}
            </div>
          </section>
          <section className="quake-list">
            <h3>近期地震</h3>
            <ul>
              {list.map(x => (
                <li key={x.id}>
                  <button className={x.id === sel.id ? 'on' : ''} aria-pressed={x.id === sel.id} onClick={() => choose(x.id)}>
                    <span className="dot" style={{ background: intensityColor(maxIntensity(x) ?? '') }} />
                    <b>M{fmtMagnitude(x.magnitude)}</b>
                    <span className="place">{x.location}</span>
                    <span className="muted">{fmtQuakeTime(x.time)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </aside>
  )
}
