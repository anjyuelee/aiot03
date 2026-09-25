# 天氣特報圖層設計文件

- 日期：2026-09-25
- 目標：在既有天氣地圖新增第九個互斥圖層「特報」，把發布中的縣市天氣特報（大雨、豪雨、陸上強風、濃霧、低溫、颱風警報等）依縣市著色，並在任何圖層都能從左上角徽章看到目前有幾則特報。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 圖層型態 | 第九個互斥圖層 `warning`，與溫度／風／雨量／濕度／雷達／衛星／颱風／行政區並列 |
| 時間軸 | 停用（同雷達、颱風、行政區），一律顯示目前發布中的特報 |
| 地圖 | 有特報的縣市整塊著色，顏色取該縣市最嚴重的一種；其餘縣市不上色。縣市／鄉鎮界線照常疊在上面 |
| 徽章 | 左上角狀態列下方常駐一顆「⚠ …」徽章，任何圖層都看得到；只有一種特報時寫種類與縣市數（例：`⚠ 大雨特報 · 7 縣市`），多種時寫則數（例：`⚠ 2 則特報`）。點了切到特報圖層。沒有特報或已在特報圖層時不顯示 |
| 資訊卡 | 特報圖層時取代地點卡片，依種類分組（嚴重者在前），每組列出顏色點、種類名稱、縣市清單與有效時間；沒有特報時顯示「目前無天氣特報」 |
| 點擊地圖 | 沿用既有逐層選取（點縣市會框起並縮放），不另做 popup |
| 網址 | `?layer=warning` 可分享，沿用既有 `isLayerId` |

## 2. 資料來源

CWA `W-C0033-001`（縣市天氣特報－各別縣市地區目前之天氣警特報情形），走既有 `datastore` API（`server/cwa/client.ts`）。

實測結構（2026-09-25，當日無任何特報，`hazards` 全為空）：

```
records.location[]            22 個縣市
  locationName                例：宜蘭縣
  geocode                     數字：直轄市為 2 碼（63～68），其他 4～5 碼（9007、10002…）
  hazardConditions.hazards[]  無特報時為 []
    info.language, info.phenomena, info.significance
    validTime.startTime, validTime.endTime
```

`result.fields` 列出 `phenomena`、`significance`、`startTime`、`endTime`（Timestamp）、`language`，與上述巢狀欄位一致。`phenomena` 例：大雨、豪雨、大豪雨、超大豪雨、陸上強風、濃霧、低溫、颱風；`significance` 例：特報、警報。時間字串格式以實際發布時為準，解析時同時接受 `YYYY-MM-DD HH:mm:ss` 與 ISO 兩種，統一轉成 `+08:00` ISO。

縣市代碼要對到 `taiwan-atlas` 的 `COUNTYCODE`（5 碼字串）：`geocode` 轉字串後，長度 ≤ 2 時右補零（`63` → `63000`），否則左補零（`9007` → `09007`、`10002` → `10002`）。

不採用 `W-C0033-002`（特報全文）：本次只做圖與清單，不顯示內文。

### 2.1 fixture

當日沒有特報可抓，`server/__fixtures__/W-C0033-001.json` 依上述結構手寫：22 個縣市，其中宜蘭縣有大雨與陸上強風兩則、花蓮縣有豪雨一則、臺北市（geocode 63）有大雨一則、連江縣（geocode 9007）有濃霧一則，其餘 `hazards: []`。下次 CWA 實際發布特報時，用真實回應比對一次並更新 fixture。

## 3. 共用型別（`shared/types.ts`）

```ts
export interface Warning {
  countyCode: string        // 5 碼，對應 taiwan-atlas COUNTYCODE
  county: string            // 縣市名
  phenomena: string         // 例：大雨
  significance: string      // 例：特報
  start: string | null      // +08:00 ISO
  end: string | null
}
```

## 4. 後端

| 檔案 | 改動 |
|---|---|
| `server/cwa/parse.ts` | `parseWarnings(json): Warning[]`；`toCountyCode(geocode)` 補零；`hazards` 缺或為空時該縣市不產生資料列；無資料時回傳 `[]` |
| `server/db.ts` | `CREATE TABLE IF NOT EXISTS warnings (county_code TEXT, county TEXT, phenomena TEXT, significance TEXT, start_time TEXT, end_time TEXT, PRIMARY KEY (county_code, phenomena, significance))` |
| `server/repo.ts` | `replaceWarnings(db, list)`（交易內先清空再寫入）、`listWarnings(db)`（依 county_code、phenomena 排序） |
| `server/sync.ts` | `syncWarnings(db, f = cwa)`：抓 → parse → `replaceWarnings` → `logFetch(db, 'warnings')`；空清單照樣清空舊資料 |
| `server/freshness.ts` | `TTL.warnings = 10 * MIN` |
| `server/service.ts` | `getWarnings(): Promise<ApiResponse<Warning[]>>` |
| `api/warnings.ts` | `GET`，回傳 `getWarnings()`（永遠有值，無 503 分支） |
| `scripts/build-db.ts` | 加 `warnings` 步驟與筆數輸出 |

以平面資料列存放：欄位固定、查詢只有整批讀取，不需要 JSON 欄位。

## 5. 前端

- `frontend/src/lib/layers.ts`：`LayerId` 加 `'warning'`，`LAYERS.warning = { label: '特報', icon: '⚠️' }`（無 `now`/`future`，時間軸自動停用、`setLayer` 會把 `t` 歸零）。
- `frontend/src/api.ts`：`useWarnings()`，不帶 `enabled`（徽章在每個圖層都要用），`refetchInterval` 10 分鐘。
- `frontend/src/lib/warnings.ts`（純函式）：
  - `severityOf(phenomena)`：以關鍵字比對回傳 `{ rank, color }`。由重到輕：含「颱風」→ `#c2255c`；含「大豪雨」（含超大豪雨）→ `#e03131`；含「豪雨」→ `#f76707`；含「大雨」→ `#fcc419`；含「低溫」→ `#7048e8`；含「強風」→ `#228be6`；含「濃霧」→ `#adb5bd`；其他 → `#868e96`。用包含比對，CWA 新增種類時退回灰色而不是壞掉。
  - `worstByCounty(list): Map<countyCode, color>`：每個縣市取 rank 最高者的顏色。
  - `groupByKind(list): { title, color, rank, items: Warning[] }[]`：`title` 為 `phenomena + significance`（例：大雨特報），依 rank 由高到低、同 rank 依 title 排序；組內依 countyCode 排序。
  - `badgeText(groups): string | null`：無特報回傳 `null`；一組時 `⚠ ${title} · ${n} 縣市`；多組時 `⚠ ${groups.length} 則特報`。
  - `fmtValid(start, end)`：`M/D HH:mm – HH:mm`，跨日時結束也帶日期；任一端缺值只寫有的那端。
- `frontend/src/components/WarningLayer.tsx`：
  - 以 `useBoundaries().data.countyShapes` 建 source，加一層 `fill`（`fill-color` 用 `match` 表達式對 `COUNTYCODE` 給色，無特報縣市透明；`fill-opacity` 0.45），插在 `dataLayerBefore(map)` 之前，界線仍在其上。
  - 資料變動時只更新 `fill-color`，不重建圖層；離開圖層時移除 source／layer。
- `frontend/src/components/WarningCard.tsx`：僅特報圖層顯示，取代 `LocationCard`（`App.tsx` 依圖層切換）。載入中顯示 skeleton、失敗顯示提示、空清單顯示「目前無天氣特報」。每組一個 `section`：顏色點＋標題，下方每個縣市一列（縣市名、有效時間）。
- `frontend/src/components/WarningBadge.tsx`：放在 `.top-left` 內 `StatusBadge` 之後；`badgeText` 為 `null` 或目前已是特報圖層時不渲染；為 `button`，點擊 `setLayer('warning')`。
- `frontend/src/components/StatusBadge.tsx`：特報圖層時以 `useWarnings()` 的結果顯示「更新於」與 stale 狀態（同颱風的處理）。
- `frontend/src/styles.css`：`.badge.alert`（可點、警示色底）、`.warning-group`、顏色點 `.dot`。

## 6. 錯誤處理

沿用 `ensureFresh`：CWA 失敗時回傳 SQLite 舊資料並標示 stale（`StatusBadge` 顯示）。從未成功抓取時回傳空陣列（`stale: true`），資訊卡顯示無特報、徽章不顯示、`StatusBadge` 顯示資料可能非最新。

## 7. 測試

- `server/cwa/parse.test.ts`：fixture 解析 — 資料列數（5 列）、`63` → `63000`、`9007` → `09007`、`10002` 不變、兩種時間格式都轉成 `+08:00` ISO、`hazards` 為空的縣市不產生列；全部為空的回應回傳 `[]`
- `server/sync.test.ts`：整批替換；空清單時清空
- `server/repo.test.ts`：`replaceWarnings` 後 `listWarnings` 排序與欄位對應
- `frontend/src/lib/warnings.test.ts`：`severityOf` 關鍵字與未知種類、`worstByCounty` 取最嚴重、`groupByKind` 排序、`badgeText` 三種情況、`fmtValid` 同日／跨日／缺值
- 手動：本機 `?layer=warning` 看到資訊卡「目前無天氣特報」、徽章不顯示；用 fixture 暫時餵給 API 確認著色、徽章文字與卡片分組；README 截圖等實際有特報時再補

## 8. 不做

- `W-C0033-002` 特報全文
- 特報疊在其他圖層之上
- 高溫資訊、大雷雨即時訊息等其他警特報資料集
- 推播或通知
