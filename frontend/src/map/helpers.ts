import type { Map as MlMap } from 'maplibre-gl'

/** 資料圖層放在第一個文字圖層之下，地名標籤才不會被蓋住 */
export const firstSymbolLayer = (map: MlMap) => map.getStyle().layers.find(l => l.type === 'symbol')?.id

export function removeLayerAndSource(map: MlMap, id: string) {
  try {
    if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  } catch {
    // 地圖已被 remove（例如 StrictMode 重新掛載）
  }
}
