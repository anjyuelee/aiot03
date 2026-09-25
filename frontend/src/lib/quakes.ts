import type { Feature, FeatureCollection } from 'geojson'
import type { Bounds, Earthquake } from '../../../shared/types'
import { fmtMD } from './format'

// CWA 震度分級由小到大；色系參照 CWA 震度圖（綠→黃→橙→紅→紫），0 級與無法辨識用灰色
const LEVELS = ['0級', '1級', '2級', '3級', '4級', '5弱', '5強', '6弱', '6強', '7級']
const COLORS = ['#868e96', '#b2f2bb', '#51cf66', '#fcc419', '#ff922b', '#f76707', '#e03131', '#c2255c', '#9c36b5', '#5f3dc4']
const UNKNOWN = '#868e96'

/** 0～9；無法辨識為 -1 */
export const intensityRank = (s: string) => LEVELS.indexOf(s.trim())

export const intensityColor = (s: string) => COLORS[intensityRank(s)] ?? UNKNOWN

/** 卡片圖例：1級～7級 */
export const INTENSITY_LEGEND = LEVELS.slice(1).map(label => ({ label, color: intensityColor(label) }))

/** 各縣市中最大的震度；沒有震度資料時為 null */
export function maxIntensity(q: Earthquake): string | null {
  let best: string | null = null
  for (const c of q.counties) if (best == null || intensityRank(c.intensity) > intensityRank(best)) best = c.intensity
  return best
}

/** M/D HH:mm；CWA 時間固定 +08:00，直接取字元避免受瀏覽器時區影響 */
export const fmtQuakeTime = (iso: string) => `${fmtMD(iso.slice(0, 10))} ${iso.slice(11, 16)}`

/** 選取的地震；id 不在清單（null 或已被新資料擠掉）時退回最新一筆 */
export const pickQuake = (list: Earthquake[], id: string | null): Earthquake | null =>
  list.find(q => q.id === id) ?? list[0] ?? null

const BADGE_WINDOW = 60 * 60_000

/** 最新一筆（清單由新到舊）在 60 分鐘內才回傳徽章文字 */
export function quakeBadge(list: Earthquake[], now: number): string | null {
  const q = list[0]
  if (!q || now - Date.parse(q.time) > BADGE_WINDOW) return null
  const max = maxIntensity(q)
  return `地震 M${q.magnitude} ${q.location}${max ? ` · 最大 ${max}` : ''}`
}

/** 震央與所有測站的外框 */
export function quakeBounds(q: Earthquake): Bounds {
  let [w, s, e, n] = [q.lon, q.lat, q.lon, q.lat]
  for (const c of q.counties) {
    for (const st of c.stations) {
      w = Math.min(w, st.lon); e = Math.max(e, st.lon)
      s = Math.min(s, st.lat); n = Math.max(n, st.lat)
    }
  }
  return [w, s, e, n]
}

const point = (lon: number, lat: number, properties: Record<string, unknown>): Feature =>
  ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties })

/** 所有震央＋選取地震的測站；屬性只放純量，MapLibre 會把巢狀屬性轉成字串 */
export function toGeoJSON(list: Earthquake[], selectedId: string | null): FeatureCollection {
  const features: Feature[] = []
  const selected = list.find(q => q.id === selectedId)
  for (const c of selected?.counties ?? []) {
    for (const s of c.stations) features.push(point(s.lon, s.lat, { role: 'station', color: intensityColor(s.intensity) }))
  }
  for (const q of list) {
    features.push(point(q.lon, q.lat, {
      role: 'epicenter', id: q.id, magnitude: q.magnitude, color: intensityColor(maxIntensity(q) ?? ''), selected: q.id === selectedId,
    }))
  }
  return { type: 'FeatureCollection', features }
}
