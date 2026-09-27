import type { LngLatBoundsLike, Map as MlMap } from 'maplibre-gl'
import { PHONE, PHONE_BUBBLE_CLEARANCE } from '../lib/probe'

/** 讓台灣本島填滿畫面；底部留給時間軸 */
export const MAIN_ISLAND: LngLatBoundsLike = [[119.9, 21.85], [122.05, 25.35]]
export const FIT_PADDING = { top: 40, bottom: 110, left: 40, right: 40 }

/**
 * 縮放到縣市時的留白：手機左上角的搜尋列、麵包屑與徽章疊在地圖上且整塊攔下點擊，縣市最北端要在它下方，
 * 點在北端時點查泡泡（以點為垂直中心）才不會被蓋住；量不到時沿用 FIT_PADDING
 */
export function countyFitPadding() {
  const panel = matchMedia(PHONE).matches ? document.querySelector('.top-left') : null
  if (!panel) return FIT_PADDING
  return { ...FIT_PADDING, top: Math.max(FIT_PADDING.top, panel.getBoundingClientRect().bottom + PHONE_BUBBLE_CLEARANCE) }
}

/** 資料圖層放在第一個文字圖層之下，地名標籤才不會被蓋住 */
export const firstSymbolLayer = (map: MlMap) => map.getLayersOrder().find(id => map.getLayer(id)?.type === 'symbol')

/** 鄉鎮點擊用的透明填色，也是行政界線群組最底層；資料圖層插在它之下，界線才不會被熱圖蓋住 */
export const TOWN_HIT = 'town-hit'
/** 跟著時間軸移動的颱風群組（天氣圖層與颱風圖層）的最底層 */
export const TYPHOON_FOLLOW_BOTTOM = 'typhoon-follow-wind-fill'
/** 疊在資料圖層之上、行政界線之下 */
export const overlayBefore = (map: MlMap) => map.getLayer(TOWN_HIT) ? TOWN_HIT : firstSymbolLayer(map)
/** 預報色階在時間軸拖進未來時才加入、熱圖隨資料重建，一律插在颱風群組之下，才不會蓋住颱風 */
export const dataLayerBefore = (map: MlMap) => map.getLayer(TYPHOON_FOLLOW_BOTTOM) ? TYPHOON_FOLLOW_BOTTOM : overlayBefore(map)

export function removeLayerAndSource(map: MlMap, id: string) {
  try {
    if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  } catch {
    // 地圖已被 remove（例如 StrictMode 重新掛載）
  }
}

/** fitBounds 時避開資訊卡：桌機卡片在左側（340px＋間距）；手機卡片在底部，依卡片實際頂端留白，量不到時留 45% */
export function cardFitPadding() {
  if (!matchMedia('(max-width: 640px)').matches) return { top: 60, bottom: 110, left: 380, right: 140 }
  // offsetTop 不受卡片滑入動畫的 transform 影響
  const card = document.querySelector<HTMLElement>('.card')
  const bottom = card ? innerHeight - card.offsetTop + 20 : Math.round(innerHeight * 0.45)
  return { top: 60, bottom, left: 20, right: 20 }
}
