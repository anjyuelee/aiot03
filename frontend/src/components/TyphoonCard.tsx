import { useTyphoons } from '../api'
import { fixLines } from '../lib/typhoon'

export default function TyphoonCard() {
  const q = useTyphoons(true)
  const list = q.data?.data ?? []
  return (
    <aside className="card glass" aria-label="颱風資訊">
      <header><h2>🌀 熱帶氣旋</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入颱風資料，請稍後再試。</p>}
      {q.data && list.length === 0 && <p className="muted">目前無活動中的熱帶氣旋</p>}
      {list.map(t => {
        const now = t.past.at(-1)
        return (
          <section key={t.id} className="typhoon">
            <h3>{t.name}{t.nameEn && <span className="muted"> {t.nameEn}</span>}</h3>
            {now && fixLines(now).map((line, i) => <div key={i} className={i === 0 ? 'muted' : ''}>{line}</div>)}
          </section>
        )
      })}
    </aside>
  )
}
