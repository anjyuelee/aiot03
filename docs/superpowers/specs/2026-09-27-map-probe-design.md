# 地圖點查設計文件

- 日期：2026-09-27
- 目標：在溫度、風、雨量、濕度、雷達圖層上點地圖任一處，就在該點冒出小泡泡，顯示該點的數值（不是鄉鎮中心或最近測站的值）；原本的縣市→鄉鎮逐層選取照舊。
- 前一版：`docs/superpowers/specs/2026-09-23-cwa-weather-map-design.md`（熱圖、鄉鎮預報著色）、`docs/superpowers/specs/2026-09-26-radar-replay-design.md`（雷達回放）。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 觸發 | 在溫度、風、雨量、濕度、雷達圖層，點 `TAIWAN_BOUNDS` 內任一處（含海上）都顯示泡泡；點擊照舊選縣市／鄉鎮 |
| 內容 | 只顯示目前圖層的數值與單位，第二行小字說明來源 |
| 時間 | 跟著預報時間軸與雷達回放時間軸更新 |
| 關閉 | 泡泡上的 ✕、切換圖層；下一次點擊換位置 |
| 遮擋 | 點的位置會被鄉鎮卡片蓋住時，自動平移地圖讓泡泡露出 |
| 不支援的圖層 | 衛星、颱風、特報、地震、行政區不點查（颱風、地震自己處理點擊） |

## 2. 互動與狀態

### 2.1 `frontend/src/store.ts`

- 新增 `probe: Probe | null`（`Probe` 定義在 `lib/probe.ts`：`{ lon: number; lat: number; town: string | null }`），初始 `null`，不寫進網址。
- `town` 是點擊當下以 `TOWN_HIT` 查到的鄉鎮代碼，海上或界線尚未載入時為 `null`；之後拖時間軸時靠它找該鄉鎮的預報。
- 新增 `setProbe(probe: Probe | null)`。
- `setLayer` 兩個分支都加上 `probe: null`。

### 2.2 `frontend/src/components/MapView.tsx` 點擊

在既有 click handler 中，`ownsMap()` 與 `TAIWAN_BOUNDS` 檢查之後：

1. 照原本流程選縣市或鄉鎮（邏輯不變），抽成 handler 內的 `select(e)`，回傳點到的 `TOWNCODE`（海上或界線尚未載入時為 `null`），`TOWN_HIT` 只查一次。
2. 若 `canProbe(layer)`：`setProbe({ lon, lat, town: select 的回傳值 })`。
3. 若 `canProbe(layer)` 且處理完後 `town != null`（鄉鎮卡片開著），以 `probePan(e.point.x, e.point.y, 地圖高度, 手機)` 計算位移，非零時 `map.panBy([dx, dy])`。手機判斷用 `matchMedia(PHONE)`，`PHONE = '(max-width: 640px)'` 從 `lib/probe.ts` 匯出，與 `styles.css` 的斷點相同。

點海上原本不選任何東西，現在會出現泡泡（熱圖與雷達在海上也有顏色）；卡片若仍開著也照第 3 步平移。

### 2.3 跟隨時間軸

- 預報圖層依整數時段 `t`（不是播放中的小數 `pos`）取值：停住時看到的一定是實際預報值或觀測推估值。播放時 `t` 隨 `setPos` 更新，泡泡跟著換值。
- 雷達依畫面上顯示的那一格（見 3.3）。

## 3. 數值計算（新檔 `frontend/src/lib/probe.ts`）

全部為純函式，不碰 DOM。

```ts
export interface Probe { lon: number; lat: number; town: string | null }
/** 有 now 色階的四個天氣圖層與雷達 */
export const canProbe = (layer: LayerId) => !!LAYERS[layer].now || layer === 'radar'
```

### 3.1 現在（`t = 0`）

```ts
export function obsValueAt(obs: Observation[], field: NowField, lon: number, lat: number): number | null
```

- 測站篩選與 `renderHeat` 共用：`lib/heat.ts` 把 `renderHeat` 裡的篩選抽成匯出的 `stationPoints(obs, field): ValuePoint[]`（只取該欄位非 `null` 的測站），兩者都用它。
- 直接呼叫 `idwGrid(stationPoints(obs, field), [lon], [lat], FADE_OUT)` 取第 0 格，不另寫 IDW；NaN（最近測站超過 0.45°，熱圖完全淡出處）回 `null`。
- `lib/heat.ts` 匯出 `FADE_OUT`。
- 型別在 `probe.ts` 由 `LayerDef` 推得：`NowField = NonNullable<LayerDef['now']>['field']`、`FutureField = NonNullable<LayerDef['future']>['field']`。
- 風只取風速（熱圖依風速上色），不顯示風向。

### 3.2 未來時段（`t ≥ 1`）

```ts
export function townValue(cells: GridCell[], town: string | null, field: FutureField): number | null
```

- 元件以 `useForecastGrid(times[t - 1])` 取格點，與 `DataLayers` 同一個 query key，不多發請求。
- `keepPreviousData` 在新時段載入前會給上一時段的格點：只有 `grid.time === times[t - 1]` 時才用 `townValue` 取值，否則顯示載入中。
- `town` 為 `null`、找不到該鄉鎮或欄位為 `null` 時回 `null`。
- 欄位用 `LAYERS[layer].future.field`（雨量圖層是 `pop`）。

### 3.3 雷達

```ts
/** 重投影後 canvas 上對應經緯度的像素；範圍外回 null */
export function radarPixel(bounds: Bounds, width: number, height: number, lon: number, lat: number): [number, number] | null
/** 像素顏色 → dBZ；透明（無回波）回 null */
export function dbzOfPixel(rgba: ArrayLike<number>): number | null
```

- `radarPixel`：`x = floor((lon − west) / (east − west) × width)`；`y = floor((mercY(north) − mercY(lat)) / (mercY(north) − mercY(south)) × height)`，與 `reprojectImage` 的 Mercator 列排法一致；`x`、`y` 超出 `[0, width)`、`[0, height)` 回 `null`。
- `dbzOfPixel`：alpha 為 0 回 `null`；否則在 `RADAR_COLORS` 找 RGB 平方距離最小的顏色，其 index 即 dBZ。66 色互不重複，正常情況完全相符；取最接近是防瀏覽器解碼 PNG 時的細微色差。
- server 上色時對 dBZ 取 `floor`，因此只得到整數 dBZ。
- 顯示中的格子：抽出新 hook `frontend/src/map/useRadarFrame.ts` 的 `useRadarFrame(): CanvasOverlay | null`，內容為 `RadarLayer` 現有的 `useRadar(true)`、`useRadarFrames`、`radarIndex`、`nearestLoaded`；`RadarLayer` 改用它（取 `.canvas`），泡泡也用它，兩者一定是同一格。
- 元件以 `canvas.getContext('2d').getImageData(x, y, 1, 1).data` 讀像素再交給 `dbzOfPixel`。

### 3.4 顯示格式

```ts
export function formatProbe(field: FutureField | NowField | 'dbz', v: number): string
```

| 欄位 | 格式 | 例 |
|---|---|---|
| `temp` | 四捨五入整數 | `27°C` |
| `humidity` | 四捨五入整數 | `84%` |
| `windSpeed` | 一位小數 | `3.2 m/s` |
| `rain1h` | 一位小數 | `1.5 mm/h` |
| `pop` | 整數 | `降雨機率 40%` |
| `dbz` | 整數 | `35 dBZ` |

## 4. 泡泡元件（新檔 `frontend/src/components/ProbeBubble.tsx`）

- 在 `App.tsx` 與 `SelectionMarker` 並列：`{map && <ProbeBubble map={map} />}`。
- MapLibre `Popup`：`offset: 8`、`closeButton: false`、`closeOnClick: false`、`className: 'probe-popup'`；DOM 內容為元件持有的一個 `div`，以 `createPortal` 放入 React 內容。`probe` 變動時重建 popup（`useEffect` 依 `[map, probe]`，cleanup 移除 popup 與監聽）；時間軸、雷達換格只重繪 portal 內容。
- 位置：
  - 桌機：`anchor: 'bottom'`，泡泡在點的正上方。
  - 手機（`PHONE`）：泡泡改單行、放在點的旁邊；點在地圖左半部用 `anchor: 'left'`（泡泡在點的右邊），右半部用 `anchor: 'right'`。
  - 純函式 `probeAnchor(x, width, phone): 'bottom' | 'left' | 'right'` 放在 `lib/probe.ts`。建立 popup 時以 `map.project` 的 x 決定，之後每次 `moveend` 重算，換邊時才重建 popup：第一次點縣市會 `fitBounds` 縮放過去，點常被移到畫面另一半（實測 5 個點有 3 個縮放後泡泡超出畫面）；使用者拖動地圖時也一樣。
  - 理由（2026-09-27 實測）：375×667 加上高溫資訊與地震兩個徽章時，左上角面板下緣（196px）到卡片頂端（253px）只剩約 56px；點上方的兩行泡泡需要約 91px，會被徽章蓋住，✕ 也點不到（左上角面板整塊擋住點擊）。單行泡泡高約 38px，以點為垂直中心放在旁邊就放得下。
- 桌機內容兩行：

  ```
  27°C          ✕
  附近測站推估
  ```

  | 情況 | 第一行 | 第二行 |
  |---|---|---|
  | 現在 | 數值 | `附近測站推估` |
  | 未來時段 | 數值 | `<鄉鎮名>預報`（`useTowns` 以 `town` 查名稱） |
  | 未來時段、點在海上 | `無資料` | `鄉鎮預報` |
  | 雷達 | 數值 | `雷達回波` |
  | 雷達透明像素 | `無回波` | `雷達回波` |
  | 算不出值 | `無資料` | 同上各情況 |
  | 資料載入中 | `…` | 同上各情況 |

  手機把兩行排成一行：`27°C 附近測站推估 ✕`。
- ✕ 呼叫 `setProbe(null)`。MapLibre 把 popup 掛在地圖容器（`map.getContainer()`），地圖的點擊監聽綁在 canvas 容器，兩者是兄弟節點，點泡泡不會觸發地圖點擊，不需要 `stopPropagation`；headless 實測點 ✕ 後縣市／鄉鎮選取不變。
- `frontend/src/styles.css`：`.probe-popup .maplibregl-popup-content` 沿用 `typhoon-popup` 的毛玻璃樣式；尖角保留並依 anchor（bottom／left／right）設成同底色，指出點的位置。數值字級較大（18px、粗體），第二行 11px、`--muted`。手機版 `.probe` 改為橫排。

## 5. 卡片遮擋與平移

```ts
/** 點擊位置被鄉鎮卡片蓋住時要 panBy 的位移；沒蓋住回 [0, 0] */
export function probePan(x: number, y: number, height: number, phone: boolean): [number, number]
```

- `panBy([dx, dy])` 後該點的螢幕位置變成 `(x − dx, y − dy)`。
- 卡片範圍用 CSS 上限估計，不量 DOM（卡片載入中會長高，量到的會偏小）：
  - 手機：卡片頂端 `= height × 0.38`（`max-height: 62%`）。泡泡以點為垂直中心、半高取 18px，下緣要在卡片頂端之上 8px：`上限 = 卡片頂端 − 18 − 8`，`y > 上限` 時 `dy = y − 上限`，`dx = 0`。只移到剛好露出，矮手機上泡泡才不會被推到徽章底下。
  - 桌機：卡片為 `x < 16 + 340 = 356`、`y > 150`。泡泡以點為水平中心、半寬取 70px，整個露出需 `x ≥ 目標 = 356 + 70 + 16 = 442`。`x < 目標` 且 `y > 150` 時 `dx = x − 目標`、`dy = 0`；`y ≤ 150` 時泡泡在卡片頂端之上，不動。
- 常數集中在 `probe.ts` 並註明對應 `styles.css` 的 `.card` 規則（`--gap` 16px、寬 340px、`top: 150px`；手機 `max-height: 62%`）。

## 6. 錯誤處理

- 觀測、格點或雷達清單請求失敗：顯示 `無資料`；載入中顯示 `…`。
- 雷達某格載入失敗：`nearestLoaded` 已退回之前最接近的已載入格，泡泡與畫面同格。
- 點擊時界線尚未載入：`town` 為 `null`，未來時段顯示 `無資料`；現在與雷達不受影響。

## 7. 測試

- `frontend/src/lib/probe.test.ts`（新檔）：
  - `canProbe`：只有 `temp`、`wind`、`rain`、`humidity`、`radar` 為 true
  - `obsValueAt`：與 `idwGrid` 同點的格值一致；落在測站上回該測站值；欄位為 `null` 的測站不參與；超過 `FADE_OUT` 回 `null`
  - `townValue`：取到該鄉鎮欄位；`town` 為 `null`、找不到鄉鎮、欄位 `null` 都回 `null`
  - `radarPixel`：西北角為 `[0, 0]`、東南角為 `[width − 1, height − 1]`；範圍外回 `null`；列號與 `sourceRowForMercRow` 對得上（取某輸出列中心緯度換回同一列）
  - `dbzOfPixel`：66 色逐一 `radarColor(d)` → `dbzOfPixel` 還原 `d`；RGB 各偏 1–2 仍還原；alpha 0 回 `null`
  - `formatProbe`：表 3.4 每一列
  - `probeAnchor`：桌機一律 `bottom`；手機左半部 `left`、右半部 `right`
  - `probePan`：手機點在上方不動、點在下方位移到卡片頂端 − 26；桌機點在卡片右側不動、在卡片上方（`y < 150`）不動、落在卡片內往右移到 442
- `frontend/src/store.test.ts`：切換圖層清除 `probe`（兩個分支各一）
- `npm test`、`npm run typecheck`、`vite build` 全過
- 手動（headless Chrome，本機 5174）：
  - 溫度圖層點本島：泡泡出現；拖時間軸到未來顯示「<鄉鎮>預報」且數值改變；拖回現在恢復「附近測站推估」
  - 點海上遠處（離島以外）：`無資料`；近海：有值
  - 雨量圖層未來時段顯示降雨機率
  - 雷達圖層：有回波處顯示 dBZ、無回波處 `無回波`；拖雷達時間軸數值跟著變
  - 點 ✕：泡泡關閉，縣市／鄉鎮選取不變
  - 切到衛星、特報：泡泡消失，點擊不出泡泡
  - 手機（390×844、375×667）：選到鄉鎮時點在畫面下半部，地圖上移、泡泡在卡片之上且在左上角面板之下，✕ 是該位置最上層的元素
  - 手機：點在右半部時泡泡在點的左邊（`anchor: 'right'`），不超出畫面；從全台畫面點各縣市邊緣（縮放後點換到另一半），泡泡仍在畫面內
  - 桌機（1440×900）：選到鄉鎮時點在卡片下方，地圖右移、泡泡可見
  - 未來時段的數值等於 `/api/forecast-grid?time=` 該鄉鎮的欄位值；雷達 dBZ 等於原始 PNG 該格點顏色在色標中的 index
  - 換底圖後泡泡仍在；行政區圖層的逐層選取不變、沒有泡泡

## 8. `README.md`

- 「功能」新增一項 **地圖點查**：溫度、風、雨量、濕度、雷達圖層上點任一處，泡泡顯示該點數值（現在為測站 IDW 推估、未來為該鄉鎮預報、雷達為該點 dBZ），跟著時間軸更新。
- 不重拍截圖。

## 9. 不做

- 桌機 hover 即時顯示游標處數值
- 泡泡顯示目前圖層以外的欄位、風向
- 播放中時段之間的內插值（依整數時段取值）
- 泡泡寫進網址
- 衛星雲頂溫度點查
- 雷達 TWD67→WGS84 位置校正（另案）
