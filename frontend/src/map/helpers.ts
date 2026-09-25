import type { LngLatBoundsLike, Map as MlMap } from 'maplibre-gl'

/** 讓台灣本島填滿畫面；底部留給時間軸 */
export const MAIN_ISLAND: LngLatBoundsLike = [[119.9, 21.85], [122.05, 25.35]]
export const FIT_PADDING = { top: 40, bottom: 110, left: 40, right: 40 }

/** 資料圖層放在第一個文字圖層之下，地名標籤才不會被蓋住 */
export const firstSymbolLayer = (map: MlMap) => map.getLayersOrder().find(id => map.getLayer(id)?.type === 'symbol')

/** 鄉鎮點擊用的透明填色，也是行政界線群組最底層；資料圖層插在它之下，界線才不會被熱圖蓋住 */
export const TOWN_HIT = 'town-hit'
export const dataLayerBefore = (map: MlMap) => map.getLayer(TOWN_HIT) ? TOWN_HIT : firstSymbolLayer(map)

export function removeLayerAndSource(map: MlMap, id: string) {
  try {
    if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  } catch {
    // 地圖已被 remove（例如 StrictMode 重新掛載）
  }
}

/** fitBounds 時避開資訊卡：桌機卡片在左側（340px＋間距），手機是底部抽屜 */
export const cardFitPadding = () => matchMedia('(max-width: 640px)').matches
  ? { top: 60, bottom: Math.round(innerHeight * 0.45), left: 20, right: 20 }
  : { top: 60, bottom: 110, left: 380, right: 140 }
