import { useWarningTexts, useWarnings } from '../api'
import { fmtValid, groupByKind, textSummary, textsByGroup } from '../lib/warnings'

export default function WarningCard() {
  const q = useWarnings()
  const groups = groupByKind(q.data?.data ?? [])
  const texts = textsByGroup(groups, useWarningTexts().data?.data ?? [])
  return (
    <aside className="card glass" aria-label="天氣特報">
      <header><h2>⚠️ 天氣特報</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入特報資料，請稍後再試。</p>}
      {q.data && groups.length === 0 && <p className="muted">目前無天氣特報</p>}
      {groups.map(g => {
        const text = texts.get(g.title)
        return (
          <section key={g.title} className="warning-group">
            <h3><span className="dot" style={{ background: g.color }} />{g.title}</h3>
            <ul>
              {g.items.map(w => (
                <li key={w.countyCode}>
                  <span>{w.county}</span>
                  <span className="muted">{fmtValid(w.start, w.end)}</span>
                  {w.towns && <span className="towns muted">{w.towns.join('、')}</span>}
                </li>
              ))}
            </ul>
            {text && (
              <details className="warning-text">
                <summary>{textSummary(text)}</summary>
                <p>{text.text}</p>
              </details>
            )}
          </section>
        )
      })}
    </aside>
  )
}
