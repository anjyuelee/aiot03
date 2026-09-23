import type { WeekSlot } from '../../../shared/types'
import { weekdayOf } from './format'

export interface DaySummary { date: string; label: string; min: number | null; max: number | null; pop: number | null; wxCode: string | null }

const pick = (xs: (number | null)[], f: (...n: number[]) => number) => {
  const vals = xs.filter((x): x is number => x != null)
  return vals.length ? f(...vals) : null
}

export function groupWeekByDay(week: WeekSlot[]): DaySummary[] {
  const byDate = new Map<string, WeekSlot[]>()
  for (const s of week) {
    const d = s.start.slice(0, 10)
    byDate.set(d, [...(byDate.get(d) ?? []), s])
  }
  return [...byDate].map(([date, slots], i) => ({
    date,
    label: i === 0 ? '今天' : `週${weekdayOf(date)}`,
    min: pick(slots.map(s => s.minTemp), Math.min),
    max: pick(slots.map(s => s.maxTemp), Math.max),
    pop: pick(slots.map(s => s.pop), Math.max),
    wxCode: (slots.find(s => s.start.slice(11, 13) === '06') ?? slots[0]).wxCode,
  }))
}
