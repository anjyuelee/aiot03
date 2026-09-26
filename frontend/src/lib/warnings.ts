import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl'
import type { Warning } from '../../../shared/types'
import { fmtMD } from './format'
import type { LayerId } from './layers'

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

/** 每個縣市取最嚴重的特報 */
export function worstByCounty(list: Warning[]): Map<string, Severity> {
  const best = new Map<string, Severity>()
  for (const w of list) {
    const s = severityOf(w.phenomena)
    if ((best.get(w.countyCode)?.rank ?? -1) < s.rank) best.set(w.countyCode, s)
  }
  return best
}

const NONE = 'rgba(0,0,0,0)'

/** 依縣市代碼對應最嚴重特報的 match 運算式；match 至少要一組對應，沒有特報時直接回傳預設值 */
function byCounty<T extends string | number>(list: Warning[], pick: (s: Severity) => T, fallback: T): T | ExpressionSpecification {
  const pairs = [...worstByCounty(list)].flatMap(([code, s]) => [code, pick(s)])
  if (pairs.length === 0) return fallback
  const expr: unknown[] = ['match', ['get', 'COUNTYCODE'], ...pairs, fallback]
  return expr as ExpressionSpecification
}

/** 有特報的縣市給最嚴重種類的顏色，其餘透明；特報填色與描邊共用 */
export const countyColor = (list: Warning[]) => byCounty(list, s => s.color, NONE)

/** 描邊的 line-sort-key：較嚴重者畫在上面，相鄰縣市共用邊界顯示較嚴重的顏色 */
export const countyRank = (list: Warning[]) => byCounty(list, s => s.rank, 0)

/** 只留有特報的縣市；沒有特報時一個都不選 */
export const countyFilter = (list: Warning[]): FilterSpecification =>
  ['in', ['get', 'COUNTYCODE'], ['literal', [...worstByCounty(list).keys()]]]

// 特報圖層已整塊填色；地震、行政區與天氣特報無關
const NO_OUTLINE: LayerId[] = ['warning', 'quake', 'admin']

/** 描邊只代表「現在」：由現在到第一個預報時段隨觀測熱圖淡出；量化成 1/20 格，播放時不必每幀重設 */
export function outlineOpacity(layer: LayerId, pos: number): number {
  if (NO_OUTLINE.includes(layer)) return 0
  return Math.max(0, 1 - Math.round(pos * 20) / 20)
}

/** 線寬 [zoom 7, zoom 11]，之間線性內插、之外取端點值 */
export type WidthStops = readonly [number, number]

// 縣市選取外框疊在描邊中央，兩側各要留至少 1px 特報色；線寬都是線性內插，兩個端點成立中間就成立
export const WARNING_LINE_WIDTH: WidthStops = [3, 4.5]
export const WARNING_CASING_WIDTH: WidthStops = [6, 7.5]
export const COUNTY_SELECTED_WIDTH: WidthStops = [1, 2]

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
