import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl'
import type { Warning, WarningText } from '../../../shared/types'
import { fmtMD, relDay, taipeiDate } from './format'
import type { LayerId } from './layers'

export interface Severity { rank: number; color: string }

// 由重到輕；用包含比對，CWA 新增種類時退回灰色而不是壞掉
const LEVELS: [keyword: string, severity: Severity][] = [
  ['颱風', { rank: 8, color: '#c2255c' }],
  ['大豪雨', { rank: 7, color: '#e03131' }],
  ['豪雨', { rank: 6, color: '#f76707' }],
  ['大雨', { rank: 5, color: '#fcc419' }],
  // 高溫各燈號共用一色，避開雨的黃、橙、紅
  ['高溫', { rank: 4, color: '#9c4221' }],
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

/** kind 為種類＋等級（例：大雨特報、高溫資訊），對應全文；title 另加燈號（例：高溫資訊・黃色燈號） */
export interface WarningGroup { title: string; kind: string; color: string; rank: number; items: Warning[] }

// 燈號由高到低；沒有燈號的排最後
const LIGHTS = ['紅色', '橙色', '黃色']
const lightOrder = (level: string | null) => {
  const i = LIGHTS.findIndex(l => level?.startsWith(l))
  return i < 0 ? LIGHTS.length : i
}

/** 依種類與燈號分組，嚴重者在前、同種類燈號高者在前；組內依縣市代碼排序 */
export function groupByKind(list: Warning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>()
  for (const w of list) {
    const kind = w.phenomena + w.significance
    const title = w.level ? `${kind}・${w.level}` : kind
    const g = groups.get(title) ?? { title, kind, ...severityOf(w.phenomena), items: [] }
    g.items.push(w)
    groups.set(title, g)
  }
  return [...groups.values()]
    .map(g => ({ ...g, items: [...g.items].sort((a, b) => a.countyCode.localeCompare(b.countyCode)) }))
    .sort((a, b) => b.rank - a.rank || lightOrder(a.items[0].level) - lightOrder(b.items[0].level) || a.title.localeCompare(b.title))
}

/** 每則全文只配給同種類的第一組（最嚴重者），同一段文字不重複出現；回傳 title → 全文 */
export function textsByGroup(groups: WarningGroup[], texts: WarningText[]): Map<string, WarningText> {
  const byKind = new Map(texts.map(t => [t.kind, t]))
  const out = new Map<string, WarningText>()
  for (const g of groups) {
    const t = byKind.get(g.kind)
    if (!t) continue
    out.set(g.title, t)
    byKind.delete(g.kind)
  }
  return out
}

/** 全文摺疊列的文字：「全文 · 9/27 07:30 發布」，沒有發布時間只寫「全文」 */
export function textSummary(t: WarningText): string {
  return t.issued ? `全文 · ${fmtMD(t.issued.slice(0, 10))} ${t.issued.slice(11, 16)} 發布` : '全文'
}

/**
 * 左上角徽章文字；無特報回傳 null。只有一組且還沒生效時（例如前一晚發布、隔天 08:00 起的高溫資訊）標出開始時間，
 * 才不會被當成已過期的特報；CWA 時間固定 +08:00，字串可直接比較、取字元
 */
export function badgeText(groups: WarningGroup[], now = new Date()): string | null {
  if (groups.length === 0) return null
  if (groups.length > 1) return `⚠ ${groups.length} 則特報`
  const { title, items } = groups[0]
  const text = `⚠ ${title} · ${items.length} 縣市`
  const start = items.flatMap(w => (w.start ? [w.start] : [])).sort()[0]
  if (!start || Date.parse(start) <= now.getTime()) return text
  return `${text} · ${relDay(start.slice(0, 10), taipeiDate(now))} ${start.slice(11, 16)} 起`
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
