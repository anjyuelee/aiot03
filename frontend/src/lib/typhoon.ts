import type { Feature, FeatureCollection, Position } from 'geojson'
import type { Bounds, Typhoon, TyphoonFix } from '../../../shared/types'
import { TAIWAN_BOUNDS } from './heat'
import { fmtSlot } from './format'

const EARTH_KM = 6371
const RAD = Math.PI / 180

/** 以大圓距離畫圓，縮放時半徑仍對應實際公里數 */
export function circlePolygon(lon: number, lat: number, radiusKm: number, steps = 64): Position[] {
  const d = radiusKm / EARTH_KM
  const lat1 = lat * RAD
  const lon1 = lon * RAD
  const ring: Position[] = []
  for (let i = 0; i <= steps; i++) {
    const brg = (i % steps) / steps * 2 * Math.PI
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg))
    const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
    ring.push([lon2 / RAD, lat2 / RAD])
  }
  return ring
}

export function typhoonBounds(list: Typhoon[]): Bounds {
  let [w, s, e, n] = TAIWAN_BOUNDS
  for (const t of list) {
    for (const f of [...t.past, ...t.forecast]) {
      w = Math.min(w, f.lon); e = Math.max(e, f.lon)
      s = Math.min(s, f.lat); n = Math.max(n, f.lat)
    }
  }
  return [w, s, e, n]
}

type Role = 'track-past' | 'track-forecast' | 'point' | 'wind' | 'cone' | 'center'
const feature = (role: Role, geometry: Feature['geometry'], props: Record<string, unknown> = {}): Feature =>
  ({ type: 'Feature', geometry, properties: { role, ...props } })

/** 點要素只帶索引：MapLibre 會把巢狀屬性轉成字串，點擊時再回頭查原資料 */
export function toGeoJSON(list: Typhoon[]): FeatureCollection {
  const features: Feature[] = []
  list.forEach((t, ti) => {
    const now = t.past.at(-1)
    const pos = (f: TyphoonFix): Position => [f.lon, f.lat]
    if (t.past.length > 1) features.push(feature('track-past', { type: 'LineString', coordinates: t.past.map(pos) }))
    const ahead = [...(now ? [now] : []), ...t.forecast]
    if (ahead.length > 1) features.push(feature('track-forecast', { type: 'LineString', coordinates: ahead.map(pos) }))
    for (const f of t.forecast) {
      if (f.radius70) features.push(feature('cone', { type: 'Polygon', coordinates: [circlePolygon(f.lon, f.lat, f.radius70)] }))
    }
    if (now?.radius15ms) features.push(feature('wind', { type: 'Polygon', coordinates: [circlePolygon(now.lon, now.lat, now.radius15ms)] }))
    t.past.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) },
      { ti, kind: 'past', i, current: i === t.past.length - 1 })))
    t.forecast.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) },
      { ti, kind: 'forecast', i, current: false })))
  })
  return { type: 'FeatureCollection', features }
}

/** 時間軸位置換成時刻（epoch ms）：0 為最新觀測點 start，第 k 格為 times[k - 1]，格與格之間線性內插 */
export function timeAtPos(pos: number, times: string[], start: number): number {
  const p = Math.min(Math.max(pos, 0), times.length)
  const at = (k: number) => (k === 0 ? start : Date.parse(times[k - 1]))
  const i = Math.floor(p)
  const f = p - i
  const t = f > 0 ? at(i) + (at(i + 1) - at(i)) * f : at(i)
  // 剛發布新觀測點時，目前所在的時段可能比觀測點早，不讓颱風往回走
  return Math.max(start, t)
}

export interface TyphoonState { lon: number; lat: number; radius15ms: number | null }

const stateOf = ({ lon, lat, radius15ms }: TyphoonFix): TyphoonState => ({ lon, lat, radius15ms })

/** 颱風在某時刻的位置與七級風半徑：在最新觀測點與預測點之間線性內插；晚於最後一個預測點時為 null，不外推 */
export function typhoonAt(t: Typhoon, time: number): TyphoonState | null {
  const now = t.past.at(-1)
  if (!now) return null
  const start = Date.parse(now.time)
  if (time <= start) return stateOf(now)
  // 觀測點可能比預報新；不晚於它的預測點已過時，留著會跳過觀測位置
  const seq = [now, ...t.forecast.filter(f => Date.parse(f.time) > start)]
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1]
    const b = seq[k]
    const tb = Date.parse(b.time)
    if (time === tb) return stateOf(b)
    if (time > tb) continue
    const ta = Date.parse(a.time)
    const f = (time - ta) / (tb - ta)
    // 半徑只有一端有值時取有值的那端，同 lerpValues
    const r = a.radius15ms == null ? b.radius15ms
      : b.radius15ms == null ? a.radius15ms
      : a.radius15ms + (b.radius15ms - a.radius15ms) * f
    return { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f, radius15ms: r }
  }
  return null
}

/** 天氣圖層上跟著時間軸移動的颱風中心（帶名稱）與七級風圈 */
export function followGeoJSON(list: Typhoon[], times: string[], pos: number): FeatureCollection {
  const features: Feature[] = []
  for (const t of list) {
    const now = t.past.at(-1)
    if (!now) continue
    const s = typhoonAt(t, timeAtPos(pos, times, Date.parse(now.time)))
    if (!s) continue
    features.push(feature('center', { type: 'Point', coordinates: [s.lon, s.lat] }, { name: t.name }))
    if (s.radius15ms) features.push(feature('wind', { type: 'Polygon', coordinates: [circlePolygon(s.lon, s.lat, s.radius15ms)] }))
  }
  return { type: 'FeatureCollection', features }
}

/** popup 與資訊卡共用的數值列；缺值的欄位不顯示 */
export function fixLines(f: TyphoonFix): string[] {
  const lines = [f.forecastHour != null ? `${fmtSlot(f.time)}（+${f.forecastHour}h 預測）` : fmtSlot(f.time)]
  if (f.pressure != null) lines.push(`中心氣壓 ${f.pressure} hPa`)
  if (f.maxWind != null) lines.push(`最大風速 ${f.maxWind} m/s${f.maxGust != null ? `，陣風 ${f.maxGust} m/s` : ''}`)
  if (f.moveDir) lines.push(`向 ${f.moveDir}${f.moveSpeed != null ? ` ${f.moveSpeed} km/h` : ''}`)
  if (f.radius15ms != null) lines.push(`七級風半徑 ${f.radius15ms} km`)
  if (f.radius70 != null) lines.push(`70% 機率半徑 ${f.radius70} km`)
  return lines
}
