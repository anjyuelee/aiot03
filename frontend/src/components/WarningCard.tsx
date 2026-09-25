import { useWarnings } from '../api'
import { fmtValid, groupByKind } from '../lib/warnings'

export default function WarningCard() {
  const q = useWarnings()
  const groups = groupByKind(q.data?.data ?? [])
  return (
    <aside className="card glass" aria-label="天氣特報">
      <header><h2>⚠️ 天氣特報</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入特報資料，請稍後再試。</p>}
      {q.data && groups.length === 0 && <p className="muted">目前無天氣特報</p>}
      {groups.map(g => (
        <section key={g.title} className="warning-group">
          <h3><span className="dot" style={{ background: g.color }} />{g.title}</h3>
          <ul>
            {g.items.map(w => (
              <li key={w.countyCode}>
                <span>{w.county}</span>
                <span className="muted">{fmtValid(w.start, w.end)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  )
}
