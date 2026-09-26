# 特報描邊設計文件

- 日期：2026-09-26
- 目標：看溫度、風、雨量、濕度、雷達、衛星、颱風圖層時，有特報的縣市以嚴重度色描邊標示，不必切到特報圖層就知道哪些縣市在特報中。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 出現的圖層 | 溫度、風、雨量、濕度、雷達、衛星、颱風。特報圖層已有整塊填色，地震與行政區不畫 |
| 開關 | 無。有特報就畫，沒有特報什麼都不畫 |
| 資料 | 沿用 `useWarnings()`（徽章已在每個圖層抓取），不增加請求 |
| 時間軸 | 只代表「現在」：`pos` 為 0 時完整顯示，0 → 1 之間透明度 `1 − pos`（與觀測熱圖同步淡出），`pos ≥ 1` 不顯示。雷達、衛星、颱風沒有未來時段，`pos` 恆為 0，一律顯示 |
| 樣式 | 縣市邊界一圈嚴重度色粗線，外側一圈半透明黑色襯線；圓角接頭；放大時加粗 |
| 顏色 | 沿用特報圖層的嚴重度色（`severityOf`），每個縣市取最嚴重的一種 |
| 相鄰縣市 | 共用邊界上顯示較嚴重的顏色（`line-sort-key` 依嚴重度，較嚴重者畫在上面） |
| 圖層順序 | 由下往上：資料圖層 → 鄉鎮界 → 縣市界 → 特報描邊 → 縣市／鄉鎮選取外框 → 地名 |
| 點擊 | 描邊不參與點擊判定（`MapView` 只查 `town-hit`），逐層選取照常 |
| 底圖 | 所有底圖同一組顏色，靠黑色襯線撐出對比；換底圖時隨 `Boundaries` 重建 |

## 2. 前端

### 2.1 `frontend/src/lib/warnings.ts`

- `worstByCounty(list)` 改回傳 `Map<countyCode, Severity>`（顏色與 rank 都要用）；原本唯一的呼叫者 `WarningLayer` 的 `fillColor` 一併移進此檔。
- `countyColor(list): string | ExpressionSpecification`：即原 `fillColor`。`match` 對 `COUNTYCODE` 給最嚴重特報的顏色，其餘透明；沒有特報時直接回傳透明色（`match` 至少要一組對應）。特報填色與描邊共用。
- `countyFilter(list): FilterSpecification`：`['in', ['get', 'COUNTYCODE'], ['literal', codes]]`，只留有特報的縣市；沒有特報時 `codes` 為空陣列，不選到任何縣市。
- `countyRank(list): number | ExpressionSpecification`：`match` 對 `COUNTYCODE` 給最嚴重特報的 rank，其餘 0；沒有特報時回傳 `0`。作為 `line-sort-key`。
- `outlineOpacity(layer, pos): number`：`warning`、`quake`、`admin` 回傳 0；其他圖層回傳 `max(0, 1 − pos)`，`pos` 先比照 `DataLayers` 量化成 1/20 格，播放時不必每一幀重設 paint。

### 2.2 `frontend/src/components/Boundaries.tsx`

- 主 effect 在 `county-line` 之後、`county-selected` 之前加兩層 `line`，共用既有的 `county-shape` source。建立時直接帶入目前的特報清單與透明度（同選取外框以目前狀態建立 filter 的做法），主 effect 因底圖線色改變而重建時描邊才不會消失：

| 圖層 | paint／layout |
|---|---|
| `warning-casing` | `line-color: rgba(0,0,0,0.55)`，`line-width` 依 zoom 7 → 11 由 5 到 6.5，`line-join: round` |
| `warning-line` | `line-color: countyColor(list)`，`line-width` 依 zoom 7 → 11 由 2 到 3.5，`line-join: round`，`line-sort-key: countyRank(list)` |

  兩層的 `line-opacity` 皆為 `outlineOpacity` 的值。線寬已在深色、淺色底圖與溫度熱圖、雷達上實測可辨識。cleanup 先移除這兩層，再移除 `county-shape` source（source 仍被圖層使用時無法移除）。
- 新增兩個 effect，都在 `ready` 後才動作：
  - 特報清單（`useWarnings().data?.data ?? []`）變動時：兩層 `setFilter(countyFilter)`，`warning-line` 設 `line-color` 與 `line-sort-key`。
  - `useStore(s => outlineOpacity(s.layer, s.pos))` 變動時：兩層設 `line-opacity`。selector 回傳量化後的數字，數值不變就不重新渲染。
- 換底圖時 `MapView` 卸下再掛回 `Boundaries`，描邊跟著重建，不另外處理。

### 2.3 `frontend/src/components/WarningLayer.tsx`

改用 `countyColor`，行為不變。

### 2.4 `README.md`

「特報」項目補一句：在溫度、風、雨量、濕度、雷達、衛星、颱風圖層上，有特報的縣市以同色描邊標示，時間軸拖到未來預報時淡出。

## 3. 錯誤處理

沿用 `useWarnings()`：抓取失敗時沒有資料，清單視為空、不畫描邊；API 回傳 stale 舊資料時照畫（與徽章一致）。

## 4. 測試

- `frontend/src/lib/warnings.test.ts`：
  - `worstByCounty` 改驗 `Severity`（顏色與 rank 取最嚴重者）
  - `countyColor`：無特報回傳透明色；有特報時為 `match` 且每縣市取最嚴重顏色
  - `countyFilter`：無特報時 `codes` 為空；有特報時列出各縣市代碼且不重複
  - `countyRank`：無特報回傳 0；同縣市多則時取最高 rank
  - `outlineOpacity`：`warning`／`quake`／`admin` 為 0；`pos` 0、0.5、1、3 分別為 1、0.5、0、0；0.52 量化為 0.5
- `npm test`、`npm run typecheck` 全過
- 手動：線上目前無特報，本機暫時讓 `/api/warnings` 回傳 `server/__fixtures__/W-C0033-001.json` 的解析結果（不提交），確認
  - 七個天氣圖層都看得到描邊，宜蘭（大雨＋強風 → 大雨色）與花蓮（豪雨）共用邊界顯示豪雨色
  - 溫度圖層拖離「現在」時描邊淡出，拖回時出現；切到特報、地震、行政區時消失
  - 深色、淺色、衛星底圖上都看得清楚；換底圖後描邊仍在
  - 點縣市照常逐層選取，選取外框在描邊之上

## 5. 不做

- 開關、描邊顏色的圖例、徽章加顏色點（顏色說明照舊在特報資訊卡）
- 依特報有效時間決定未來時段是否顯示
- 斜線填滿
- 鄉鎮層級的特報（資料只到縣市）
