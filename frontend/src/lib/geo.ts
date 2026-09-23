import type { Town } from '../../../shared/types'

export function nearest<T extends { lon: number; lat: number }>(items: T[], lon: number, lat: number): T | null {
  const k = Math.cos((lat * Math.PI) / 180)
  let best: T | null = null
  let bestD = Infinity
  for (const it of items) {
    const dx = (it.lon - lon) * k
    const dy = it.lat - lat
    const d = dx * dx + dy * dy
    if (d < bestD) { bestD = d; best = it }
  }
  return best
}

const norm = (s: string) => s.trim().replaceAll('台', '臺')

export function searchTowns(towns: Town[], q: string, limit = 10): Town[] {
  const query = norm(q)
  if (!query) return []
  return towns.filter(t => norm(t.county + t.name).includes(query)).slice(0, limit)
}
