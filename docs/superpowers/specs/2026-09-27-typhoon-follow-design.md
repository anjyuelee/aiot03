# 颱風跟隨時間軸設計文件

- 日期：2026-09-27
- 目標：看溫度、風、雨量、濕度圖層時，有活動中的颱風就疊畫路徑，中心與七級風暴風圈隨預報時間軸移動，與預報色階對照看颱風在各時刻的位置。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 出現的圖層 | 溫度、風、雨量、濕度（有 `future` 的圖層）。颱風圖層維持現行全路徑總覽、不加時間軸；雷達、衛星、特報、地震、行政區不畫 |
| 開關 | 無。有活動中的颱風就畫，沒有就什麼都不畫 |
| 畫什麼 | 過去路徑細實線、預測路徑細虛線；時間軸所在時刻的中心點、名稱與七級風暴風圈。不畫潛勢圓與路徑點 |
| 時間對應 | 時間軸「現在」＝最新觀測點；第 k 格＝第 k 個預報時段；格與格之間線性內插時刻 |
| 內插 | 位置與七級風半徑在觀測點、預測點之間依時間線性內插；氣壓、風速不內插、不顯示 |
| 超出預測 | 時刻晚於最後一個預測點時不畫中心與風圈，不外推 |
| 點擊 | 颱風圖層不參與點擊，點地圖照常逐層選取縣市、鄉鎮 |
| 圖層順序 | 由下往上：資料圖層（熱圖、預報色階）→ 颱風（風圈、路徑、中心）→ 界線與特報描邊 → 選取外框 → 地名 → 颱風名稱。不論誰先加入、換不換底圖都成立 |
| 視角 | 不自動縮放、不加畫面外提示 |
| 資料 | 沿用 `useTyphoons`（`/api/typhoon`），不增加 API |

實測資料（2026-09-27，舒力基）：最新觀測點 26 日 20:00；預測點為 +6、12、18、24、36、48、72、96、120 小時，時刻落在 02／08／14／20 點。時間軸為每 3 小時一格（00／03／06…），`useFutureTimes()` 最多 24 格、72 小時。兩者時刻對不齊，因此需依時間內插。

## 2. 前端

### 2.1 `frontend/src/lib/typhoon.ts`（純函式）

- `timeAtPos(pos: number, times: string[], start: number): number`
  - 錨點：位置 0 為 `start`（最新觀測點時刻，epoch ms）；位置 k（1 ≤ k ≤ `times.length`）為 `Date.parse(times[k - 1])`。
  - `pos` 先夾在 `[0, times.length]`，在相鄰兩錨點之間線性內插。
  - 結果取 `max(start, 內插值)`：CWA 剛發布新觀測點時，`times[0]`（目前所在時段，可能比現在早最多 3 小時）可能早於 `start`（例如觀測點 20:00、時段 18:00），不夾住的話颱風會先往回走。
  - `times` 為空陣列時回傳 `start`。
- `typhoonAt(t: Typhoon, time: number): { lon: number; lat: number; radius15ms: number | null } | null`
  - 序列為「`past` 最後一點＋所有 `forecast`」，時刻以 `Date.parse(fix.time)` 比較。
  - `past` 為空回傳 `null`。
  - `time` 不晚於序列第一點時回傳第一點；晚於最後一點時回傳 `null`；剛好落在某點時回傳該點。
  - 落在兩點之間：經緯度線性內插（相鄰點相距 6～24 小時、數百公里，直接內插經緯度的誤差看不出來）；七級風半徑兩端都有值時內插，只有一端有值時取該端（同 `lerpValues`），皆無則 `null`。
- `followGeoJSON(list: Typhoon[], times: string[], pos: number): FeatureCollection`
  - `past` 為空的颱風略過；其餘以 `past` 最後一點時刻為 `start`，取 `typhoonAt(t, timeAtPos(pos, times, start))`，結果為 `null` 的颱風略過。
  - 中心點：`Point`，`properties: { role: 'center', name: t.name }`。
  - 風圈：`radius15ms` 有值時加 `Polygon`（`circlePolygon`），`properties: { role: 'wind' }`。

### 2.2 `frontend/src/map/helpers.ts`

預報色階在時間軸拖進未來時段那一刻才加入地圖，觀測熱圖在資料更新時重建，兩者都以 `dataLayerBefore()` 插在 `town-hit` 之下；颱風若先加入，就會被它們蓋住。改為：

```ts
/** 颱風跟隨圖層群組的最底層 */
export const TYPHOON_FOLLOW_BOTTOM = 'typhoon-follow-wind-fill'
/** 疊在資料圖層之上、行政界線之下 */
export const overlayBefore = (map: MlMap) => map.getLayer(TOWN_HIT) ? TOWN_HIT : firstSymbolLayer(map)
/** 資料圖層：有颱風群組時插在它之下 */
export const dataLayerBefore = (map: MlMap) => map.getLayer(TYPHOON_FOLLOW_BOTTOM) ? TYPHOON_FOLLOW_BOTTOM : overlayBefore(map)
```

颱風群組只在四個天氣圖層掛上；其他使用 `dataLayerBefore` 的圖層（颱風、特報、地震、行政區、雷達、衛星）掛上時，颱風群組已在同一次 commit 的 cleanup 中移除，行為不變。

### 2.3 `frontend/src/components/TyphoonFollow.tsx`

Props：`{ map, list, times, pos }`，`pos` 為 `DataLayers` 量化成 1/20 格的值，颱風與色階同時更新，播放時不必每一幀重算。

兩個 source：

| source | 內容 | 更新時機 |
|---|---|---|
| `typhoon-follow` | `toGeoJSON(list)`，只用其中 `track-past`、`track-forecast` 兩種線 | 清單或底圖線色改變時重建 |
| `typhoon-follow-now` | `followGeoJSON(list, times, pos)` | 建立時帶入目前值；之後 `list`、`times`、`pos` 改變時 `setData` |

名稱以外的圖層依序以 `overlayBefore(map)` 插入（先加的在下）；名稱是 symbol 圖層，放在最上層（不指定 `before`，同 `AdminLayer` 的地名）。若也插在界線之下，它會成為最下面的 symbol 圖層，`Boundaries` 重建時以 `firstSymbolLayer` 找插入點，界線就會插進颱風中心與名稱之間：

| 圖層 | 型態 | 樣式 |
|---|---|---|
| `typhoon-follow-wind-fill` | fill，`role == wind` | `fill-color: #fa5252`，`fill-opacity: 0.15` |
| `typhoon-follow-wind-line` | line，`role == wind` | `line-color: #fa5252`，`line-width: 1.5` |
| `typhoon-follow-past` | line，`role == track-past` | `line-color: ink`，`line-width: 1`，`line-opacity: 0.6` |
| `typhoon-follow-forecast` | line，`role == track-forecast` | 同上，加 `line-dasharray: [2, 2]` |
| `typhoon-follow-center` | circle，`role == center` | `circle-radius: 6`，`circle-color: #fa5252`，`circle-stroke-color: #ffffff`，`circle-stroke-width: 2` |
| `typhoon-follow-label` | symbol，`role == center`，最上層 | `text-field: name`，`text-font` 同 `AdminLayer`，`text-size: 12`，`text-anchor: left`，`text-offset: [0.8, 0]`，`text-allow-overlap: true`；`text-color: ink`，halo 深色底圖為 `rgba(0,0,0,0.75)`、淺色底圖為 `rgba(255,255,255,0.85)`，`text-halo-width: 1.5` |

`ink` 為 `inkOf(basemap)`。不綁任何滑鼠事件。cleanup 移除所有圖層與兩個 source。換底圖時 `MapView` 卸下再掛回 `DataLayers`，颱風群組跟著重建。

### 2.4 `frontend/src/components/DataLayers.tsx`

- `useTyphoons(layer === 'typhoon' || !!def.future)`。
- `def.future` 存在、`typhoon.data` 有值且清單不為空時掛上 `<TyphoonFollow map={map} list={typhoon.data.data} times={times} pos={q} />`。

## 3. 錯誤處理

- 颱風資料抓取失敗或尚未載入：不掛載，什麼都不畫。API 回傳 stale 舊資料時照畫（與特報描邊、徽章一致）。
- 預報時段尚未載入（`times` 為空）：`timeAtPos` 回傳 `start`，颱風停在最新觀測位置。
- 沒有觀測點的颱風：`typhoonAt` 回傳 `null`，不畫中心；路徑少於兩點時 `toGeoJSON` 本就不產生該線。
- 只有觀測點、沒有預測點的颱風（例如剛生成的熱帶性低氣壓）：只在時刻等於 `start` 時畫中心，往後拖就消失。

## 4. 測試

- `frontend/src/lib/typhoon.test.ts`：
  - `timeAtPos`：位置 0 回傳 `start`；位置 1 回傳 `times[0]`；位置 1.5 為 `times[0]` 與 `times[1]` 中點；負數與超過 `times.length` 時夾在兩端；`times[0]` 早於 `start` 時回傳 `start`；`times` 為空回傳 `start`
  - `typhoonAt`：剛好落在觀測點、預測點；兩點之間經緯度與半徑為內插值；半徑只有一端有值時取該端；晚於最後一個預測點回傳 `null`；無預測點時只有 `start` 有值；`past` 為空回傳 `null`
  - `followGeoJSON`：每個颱風一個中心點（帶名稱）與一個風圈；無半徑時不產生風圈；`typhoonAt` 為 `null` 的颱風整個略過
- `frontend/src/map/helpers.test.ts`（新檔，以假 map 物件）：颱風群組存在時 `dataLayerBefore` 回傳 `TYPHOON_FOLLOW_BOTTOM`；不存在時回傳 `town-hit`，再不存在時回傳第一個 symbol 圖層；`overlayBefore` 不理會颱風群組
- `npm test`、`npm run typecheck` 全過
- 手動（線上目前有舒力基，約 127°E）：
  - 風圖層拖到 +24h：中心落在 +18h 與 +24h 預測點之間的對應位置；播放時平滑移動並與色階同步
  - 由「現在」拖進未來、預報色階出現後，颱風仍在色階之上；深色、淺色、衛星底圖下顏色與順序正確，換底圖後仍在
  - 雷達、衛星、特報、地震、行政區圖層不出現；颱風圖層照舊為全路徑總覽
  - 點地圖照常逐層選取縣市、鄉鎮

## 5. `README.md`

- 「颱風」項目補一句：溫度、風、雨量、濕度圖層上也會畫出颱風路徑，中心與七級風暴風圈跟著預報時間軸移動。
- 截圖區新增一列：風圖層 +24h 時的颱風（`docs/screenshots/typhoon-follow.png`）。

## 6. 不做

- 颱風圖層加時間軸
- 雷達、衛星圖層疊颱風
- 天氣圖層上的潛勢圓、路徑點、點擊 popup
- 內插或顯示氣壓、風速
- 自動縮放到颱風、畫面外提示
- 最後一個預測點之後外推
