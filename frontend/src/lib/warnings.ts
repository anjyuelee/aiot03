import type { Warning } from '../../../shared/types'
import { fmtMD } from './format'

export interface Severity { rank: number; color: string }

// 由重到輕；用包含比對，CWA 新增種類時退回灰色而不是壞掉
const LEVELS: [keyword: string, severity: Severity][] = [
  ['颱風', { rank: 7, color: '#c2255c' }],
  ['大豪雨', { rank: 6, color: '#e03131' }],
  ['豪雨', { rank: 5, color: '#f76707' }],
  ['大雨', { rank: 4, color: '#fcc419' }],
  ['低溫', { rank: 3, color: '#7048e8' }],
  ['強風', { rank: 2, color: '#228be6' }],
  ['濃霧', { rank: 1, color: '#adb5bd' }],
]
const OTHER: Severity = { rank: 0, color: '#868e96' }

export function severityOf(phenomena: string): Severity {
  return LEVELS.find(([k]) => phenomena.includes(k))?.[1] ?? OTHER
}

/** 每個縣市取最嚴重特報的顏色 */
export function worstByCounty(list: Warning[]): Map<string, string> {
  const best = new Map<string, Severity>()
  for (const w of list) {
    const s = severityOf(w.phenomena)
    if ((best.get(w.countyCode)?.rank ?? -1) < s.rank) best.set(w.countyCode, s)
  }
  return new Map([...best].map(([code, s]) => [code, s.color]))
}

export interface WarningGroup { title: string; color: string; rank: number; items: Warning[] }

/** 依種類分組（種類＋等級，例：大雨特報），嚴重者在前；組內依縣市代碼排序 */
export function groupByKind(list: Warning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>()
  for (const w of list) {
    const title = w.phenomena + w.significance
    const g = groups.get(title) ?? { title, ...severityOf(w.phenomena), items: [] }
    g.items.push(w)
    groups.set(title, g)
  }
  return [...groups.values()]
    .map(g => ({ ...g, items: [...g.items].sort((a, b) => a.countyCode.localeCompare(b.countyCode)) }))
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title))
}

/** 左上角徽章文字；無特報回傳 null */
export function badgeText(groups: WarningGroup[]): string | null {
  if (groups.length === 0) return null
  if (groups.length === 1) return `⚠ ${groups[0].title} · ${groups[0].items.length} 縣市`
  return `⚠ ${groups.length} 則特報`
}

/** 有效時間：同日「9/25 05:30 – 17:30」，跨日結束也帶日期；缺任一端只寫有的那端 */
export function fmtValid(start: string | null, end: string | null): string {
  const day = (iso: string) => fmtMD(iso.slice(0, 10))
  const clock = (iso: string) => iso.slice(11, 16)
  if (start && end) {
    const sameDay = start.slice(0, 10) === end.slice(0, 10)
    return `${day(start)} ${clock(start)} – ${sameDay ? '' : `${day(end)} `}${clock(end)}`
  }
  if (start) return `${day(start)} ${clock(start)} 起`
  if (end) return `至 ${day(end)} ${clock(end)}`
  return ''
}
