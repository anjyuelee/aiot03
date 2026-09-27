import type { Bounds, GridCell, Observation } from '../../../shared/types'
import { RADAR_COLORS } from '../../../shared/radar'
import { LAYERS, type LayerDef, type LayerId } from './layers'
import { idwGrid } from './idw'
import { FADE_OUT, stationPoints } from './heat'
import { latToMercY } from './mercator'

/** 地圖點查的位置；town 是點擊當下點到的鄉鎮（海上為 null），之後拖時間軸靠它找該鄉鎮預報 */
export interface Probe { lon: number; lat: number; town: string | null }
export type NowField = NonNullable<LayerDef['now']>['field']
export type FutureField = NonNullable<LayerDef['future']>['field']

/** 有即時熱圖的四個天氣圖層與雷達可以點查 */
export const canProbe = (layer: LayerId) => !!LAYERS[layer].now || layer === 'radar'

/** 與熱圖同樣的測站與 IDW；最近測站超過 FADE_OUT（熱圖完全淡出處）回 null */
export function obsValueAt(obs: Observation[], field: NowField, lon: number, lat: number): number | null {
  const v = idwGrid(stationPoints(obs, field), [lon], [lat], FADE_OUT)[0]
  return Number.isNaN(v) ? null : v
}

export function townValue(cells: GridCell[], town: string | null, field: FutureField): number | null {
  if (!town) return null
  return cells.find(c => c.townId === town)?.[field] ?? null
}

/** 重投影後（列以 Mercator 等距排列，同 reprojectImage）的 canvas 上對應經緯度的像素；範圍外回 null */
export function radarPixel([west, south, east, north]: Bounds, width: number, height: number, lon: number, lat: number): [number, number] | null {
  const yN = latToMercY(north)
  const x = Math.floor(((lon - west) / (east - west)) * width)
  const y = Math.floor(((yN - latToMercY(lat)) / (yN - latToMercY(south))) * height)
  return x >= 0 && x < width && y >= 0 && y < height ? [x, y] : null
}

/** 像素顏色 → dBZ（CWA 色標每 1 dBZ 一色，互不重複）；透明為無回波，回 null。取最接近的顏色，容許解碼時的細微色差 */
export function dbzOfPixel(rgba: ArrayLike<number>): number | null {
  if (rgba[3] === 0) return null
  let best = 0
  let bestD = Infinity
  RADAR_COLORS.forEach(([r, g, b], dbz) => {
    const d = (rgba[0] - r) ** 2 + (rgba[1] - g) ** 2 + (rgba[2] - b) ** 2
    if (d < bestD) { bestD = d; best = dbz }
  })
  return best
}

export function formatProbe(field: NowField | FutureField | 'dbz', v: number): string {
  switch (field) {
    case 'temp': return `${Math.round(v)}°C`
    case 'humidity': return `${Math.round(v)}%`
    case 'windSpeed': return `${v.toFixed(1)} m/s`
    case 'rain1h': return `${v.toFixed(1)} mm/h`
    case 'pop': return `降雨機率 ${Math.round(v)}%`
    case 'dbz': return `${v} dBZ`
  }
}

/** 與 styles.css 的手機版斷點相同 */
export const PHONE = '(max-width: 640px)'

/**
 * 泡泡相對於點的位置（MapLibre popup anchor）：桌機在點的正上方；手機卡片開著時地圖只剩一小條，
 * 改放在點的旁邊、靠畫面中間那一側（點在左半部時 anchor 為 left，泡泡在點的右邊）
 */
export const probeAnchor = (x: number, width: number, phone: boolean) =>
  !phone ? 'bottom' : x < width / 2 ? 'left' : 'right'

// 鄉鎮卡片的範圍，對應 styles.css 的 .card：桌機 left: var(--gap)（16px）、width: 340px、top: 150px；手機貼底、max-height: 62%
const DESKTOP_CARD_RIGHT = 16 + 340
const DESKTOP_CARD_TOP = 150
const PHONE_CARD_TOP = 1 - 0.62
/** 桌機泡泡在點的上方、以點為水平中心，寬約 140px */
const BUBBLE_HALF = 70
/** 手機泡泡是單行、在點的旁邊、以點為垂直中心，高約 36px */
const PHONE_BUBBLE_HALF = 18
const MARGIN = 16
const PHONE_MARGIN = 8

/**
 * 點擊位置被鄉鎮卡片蓋住時要 panBy 的位移，panBy 後該點的螢幕位置為 (x − dx, y − dy)；沒蓋住回 [0, 0]。
 * 卡片載入中會長高，用 CSS 上限估計範圍，不量 DOM
 */
export function probePan(x: number, y: number, height: number, phone: boolean): [number, number] {
  if (phone) {
    // 矮手機加上特報、地震徽章時，徽章與卡片之間只剩約 56px，只移到泡泡下緣剛好在卡片之上
    const limit = height * PHONE_CARD_TOP - PHONE_BUBBLE_HALF - PHONE_MARGIN
    return [0, y > limit ? y - limit : 0]
  }
  // 點在卡片頂端之上時泡泡也在卡片之上
  const target = DESKTOP_CARD_RIGHT + BUBBLE_HALF + MARGIN
  return [x < target && y > DESKTOP_CARD_TOP ? x - target : 0, 0]
}
