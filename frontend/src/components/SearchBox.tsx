import { useMemo, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { useTowns } from '../api'
import { useStore } from '../store'
import { nearest, searchTowns } from '../lib/geo'
import type { Town } from '../../../shared/types'

export default function SearchBox({ map }: { map: MlMap | null }) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data } = useTowns()
  const towns = data?.data ?? []
  const results = useMemo(() => searchTowns(towns, q), [towns, q])
  const selectTown = useStore(s => s.selectTown)

  const pick = (t: Town) => {
    selectTown(t.id)
    setQ('')
    map?.flyTo({ center: [t.lon, t.lat], zoom: 10 })
  }

  const locate = () => {
    setError(null)
    if (!navigator.geolocation) return setError('此瀏覽器不支援定位')
    navigator.geolocation.getCurrentPosition(
      p => {
        const t = nearest(towns, p.coords.longitude, p.coords.latitude)
        if (t) pick(t)
      },
      () => setError('無法取得目前位置'),
      { timeout: 10_000 },
    )
  }

  return (
    <div className="glass">
      <div className="search-row">
        <span aria-hidden>🔍</span>
        <input value={q} placeholder="搜尋鄉鎮市區…" aria-label="搜尋鄉鎮市區"
          onChange={e => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) pick(results[0]) }} />
        <button onClick={locate} title="目前位置" aria-label="目前位置">📍</button>
      </div>
      {focused && results.length > 0 && (
        <ul className="results">
          {results.map(t => (
            <li key={t.id}><button onMouseDown={() => pick(t)}>{t.county} {t.name}</button></li>
          ))}
        </ul>
      )}
      {error && <div className="search-error">{error}</div>}
    </div>
  )
}
