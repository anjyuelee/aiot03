# 特報全文與高溫資訊設計文件

- 日期：2026-09-27
- 目標：特報卡片除了種類、縣市與有效時間，還能展開閱讀 CWA 發布的特報原文；並補上 `W-C0033-001` 不包含的高溫資訊，讓 CWA 官網看得到的警特報，本站也看得到。
- 前一版：`docs/superpowers/specs/2026-09-25-weather-warnings-design.md`（特報圖層）、`docs/superpowers/specs/2026-09-26-warning-outline-design.md`（特報描邊）。本文件修改前者「不採用 `W-C0033-002`」與「不做高溫資訊」兩項。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 特報全文 | 特報卡片每組特報下方有預設收合的「全文」，點開顯示 CWA 原文 |
| 高溫資訊 | 與其他特報一樣歸到縣市：特報圖層填色、其他圖層描邊、徽章、卡片分組都包含高溫資訊；卡片在縣市下方列出受影響鄉鎮 |
| 高溫顏色 | 單一專屬色，不依燈號變色；燈號寫在分組標題（例：`高溫資訊・黃色燈號`），不同燈號分組、高者在前 |
| 大雷雨即時訊息 | 不做：CWA 開放資料 API 沒有此資料集 |

## 2. 資料來源

三個資料集都走既有 `datastore` API（`server/cwa/client.ts` 的 `dataset()`）。

### 2.1 `W-C0033-001`（沿用）

縣市天氣特報，結構見前一版文件。**不含高溫資訊**：2026-09-27 CWA 發布高溫資訊期間，此資料集 22 縣市 `hazards` 全為空。

### 2.2 `W-C0033-005` 高溫資訊（CAP）

2026-09-27 實測（當日 07:30 發布、08:00–17:00 有效，7 縣市 20 個鄉鎮區黃色燈號）：

```
records.info[]
  event                 高溫
  urgency               Future；解除或過期訊息為 Past
  headline              高溫資訊；解除時為「解除…」
  effective             發布時間，+08:00 ISO
  onset, expires        有效起訖，+08:00 ISO
  description           說明文字
  instruction           注意事項
  parameter[]           {valueName, value}：alert_title=高溫資訊、severity_level=高溫黃色燈號、alert_color=黃色…
  area[]                {areaDesc, geocode: {valueName: Taiwan_Geocode_103, value}}
```

- CAP 資料集在沒有新訊息時仍回傳最後一則：同日查 `W-C0033-004`（低溫）拿到 2026-03-16 已過期的低溫特報、`W-C0033-003` 拿到 9/22 的「解除大雨特報」。因此一律以 `urgency`、`expires` 與標題過濾。
- 不同燈號推測以多個 `info` 發布，每個 `info` 各自一種 `severity_level`。
- `geocode`（`Taiwan_Geocode_103`）：鄉鎮為 7 碼、縣市為 2 或 5 碼。
  - 直轄市鄉鎮以 `6` 開頭，例：`6500100`（新北市板橋區）→ 縣市碼 `65000`。
  - 其他鄉鎮取前 5 碼，例：`1000404`（新竹縣關西鎮）→ `10004`、`0902006`（金門縣烏坵鄉）→ `09020`。
  - 2 或 5 碼沿用 `toCountyCode`。
- `areaDesc` 為「縣市名＋鄉鎮名」（例：`臺北市文山區`）；22 縣市名稱皆為 3 字。

fixture：`server/__fixtures__/W-C0033-005.json` 存 2026-09-27 的真實回應。

### 2.3 `W-C0033-002` 特報全文

實測當日無特報，`records.record` 為空陣列。`result.fields` 列出 `datasetDescription`、`datasetLanguage`、`issueTime`、`startTime`、`endTime`、`update`、`contentLanguage`、`contentText`、`language`、`phenomena`、`significance`、`locationName`。history API 不提供此資料集，無法取得過去的真實回應。依欄位推定的結構：

```
records.record[]
  datasetInfo
    datasetDescription    例：大雨特報
    issueTime             發布時間
    validTime.startTime, validTime.endTime
  contents.content
    contentText           特報全文
  hazardConditions.hazards.hazard[]
    info.phenomena, info.significance
    info.affectedAreas.location[].locationName
```

- 解析時巢狀節點同時接受陣列與單一物件（`hazard`、`location` 可能只有一筆）。
- 全文只取中文：紀錄的 `datasetLanguage` 有值且不是 `zh-TW` 時略過；`content` 有多筆時取 `contentLanguage` 為 `zh-TW` 者，沒標語言的視為中文；`contentText` 不是字串時當作沒有全文。寧可不顯示全文，也不顯示錯的內容。
- 時間字串沿用 `toTaipeiIso`，同時接受 `YYYY-MM-DD HH:mm:ss` 與 ISO。
- fixture：`server/__fixtures__/W-C0033-002.json` 依上述結構手寫，兩則紀錄：
  - A：大雨特報，`hazard` 陣列只有「大雨／特報」一筆。
  - B：颱風警報，`issueTime` 晚於 A，`hazard` 陣列有「颱風／警報」與「大雨／特報」兩筆。因此 `大雨特報` 的全文應取 B。
  - `hazard` 為單一物件的情況在測試中以最小 JSON 另外構造，不放進 fixture。
  - 下次 CWA 實際發布特報時，用真實回應比對一次並更新 fixture。

## 3. 共用型別（`shared/types.ts`）

```ts
export interface Warning {
  countyCode: string
  county: string
  phenomena: string
  significance: string
  /** 燈號，例：黃色燈號；只有高溫資訊有值 */
  level: string | null
  /** 受影響鄉鎮；整個縣市都在範圍內時為 null（W-C0033-001 的特報皆為 null） */
  towns: string[] | null
  start: string | null
  end: string | null
}

export interface WarningText {
  /** 種類＋等級，例：大雨特報、高溫資訊；等於卡片分組標題去掉燈號 */
  kind: string
  /** 發布時間，+08:00 ISO */
  issued: string | null
  text: string
}
```

## 4. 後端

### 4.1 解析（`server/cwa/parse.ts`）

- `parseWarnings`：既有列補 `level: null`、`towns: null`。
- `parseHeat(json, now: string): Warning[]`：
  - 跳過 `urgency === 'Past'`、`expires` 早於或等於 `now`、`headline` 含「解除」的 `info`。
  - `records.info`、`info.parameter`、`info.area` 同時接受陣列與單一物件：CWA 的 JSON 會把只有一筆的列表收成單一物件（`eventCode`、`geocode` 即是），高溫資訊只涵蓋一個鄉鎮時若因此丟錯，整批同步都會失敗。
  - 每個 `area` 換算縣市碼（見 2.2），縣市名取 `areaDesc` 前 3 字；7 碼時鄉鎮名為 `areaDesc` 其餘部分，2 或 5 碼時該縣市不列鄉鎮。
  - 依「縣市碼＋燈號」合併為一列：`phenomena = event`、`significance = '資訊'`、`level` 為 `severity_level` 去掉開頭的 `event`（`高溫黃色燈號` → `黃色燈號`，缺值為 `null`）、`towns` 依出現順序（整個縣市時為 `null`）、`start = onset`、`end = expires`。
- `parseHeatText(json, now: string): WarningText[]`：同樣過濾後，每個 `info` 產生 `{ kind: '高溫資訊', issued: effective, text: description + '\n\n' + instruction }`（缺 `instruction` 時只有 `description`）；多個 `info` 的 `kind` 相同時只留第一個。
- `parseWarningTexts(json): WarningText[]`：每則紀錄的中文 `contentText`（見 2.3；去頭尾空白，空字串則略過）對應該紀錄每個 hazard 的 `phenomena + significance`；同一 `kind` 出現在多則紀錄時取 `issueTime` 最新者。

### 4.2 儲存（`server/db.ts`、`server/repo.ts`）

```sql
CREATE TABLE IF NOT EXISTS warnings (
  county_code TEXT, county TEXT, phenomena TEXT, significance TEXT, level TEXT NOT NULL DEFAULT '',
  towns TEXT, start_time TEXT, end_time TEXT,
  PRIMARY KEY (county_code, phenomena, significance, level));
CREATE TABLE IF NOT EXISTS warning_texts (kind TEXT PRIMARY KEY, issued TEXT, text TEXT);
```

- `level` 以空字串存「無燈號」，主鍵才能包含它；讀出時轉回 `null`。`towns` 存 JSON 字串或 `NULL`。
- 舊版遷移：本機 `/tmp` 的 DB 仍是舊版 `warnings` 表，`CREATE TABLE IF NOT EXISTS` 不會補欄位。`openDb` 在執行 schema 前檢查 `PRAGMA table_info(warnings)`：表存在但沒有 `level` 欄時，`DROP TABLE warnings` 並刪除 `fetch_log` 中 `warnings` 那一列，下次請求即重抓。此表只是快取，丟棄無損。
- `replaceWarnings`、`listWarnings` 加入兩欄；`listWarnings` 排序改為 `county_code, phenomena, level`。
- `replaceWarningTexts(db, list)`（交易內先清空再寫入）、`listWarningTexts(db)`（依 `kind` 排序）。

### 4.3 同步與 API

- `syncWarnings(db, f = cwa)`：`Promise.all` 同時抓 `W-C0033-001`、`W-C0033-005`、`W-C0033-002`；`001` 沒有縣市時照舊視為異常。寫入 `replaceWarnings(db, [...parseWarnings(w001), ...parseHeat(w005, now)])` 與 `replaceWarningTexts(db, [...parseWarningTexts(w002), ...parseHeatText(w005, now)])`，最後 `logFetch(db, 'warnings')`。任一個抓取失敗就不寫入，整批保留舊資料。
- `server/service.ts`：`getWarningTexts(): Promise<ApiResponse<WarningText[]>>`，與 `getWarnings` 共用 `ensureFresh(db, 'warnings', …)`，兩支 API 只觸發一次同步。
- `api/warning-texts.ts`：`GET`，回傳 `getWarningTexts()`。
- `scripts/build-db.ts`：筆數輸出加 `warning_texts`。

## 5. 前端

### 5.1 `frontend/src/lib/warnings.ts`

- `LEVELS` 加入 `['高溫', { rank: 4, color: '#9c4221' }]`，其餘順移。由重到輕：颱風 8、大豪雨 7、豪雨 6、大雨 5、高溫 4、低溫 3、強風 2、濃霧 1、其他 0。顏色為鐵鏽棕，實作後在淺色與深色底圖截圖確認，分辨不清再調。
- 特報填色、描邊與徽章都讀 `useWarnings()`，不需改動即包含高溫資訊。
- `WarningGroup` 加 `kind`（`phenomena + significance`）；`title` 有燈號時為 `${kind}・${level}`，否則等於 `kind`。分組 key 用 `title`。
- `groupByKind` 排序：rank 由高到低 → 燈號（紅色 > 橙色 > 黃色 > 無）→ `title`。
- `badgeText` 不變；只有一組高溫資訊時為 `⚠ 高溫資訊・黃色燈號 · 7 縣市`，截圖確認手機排得下。

### 5.2 `frontend/src/api.ts`

`useWarningTexts()`：`queryKey: ['warning-texts']`、`refetchInterval` 10 分鐘。只在 `WarningCard` 呼叫，因此只有特報圖層會抓。

### 5.3 `frontend/src/components/WarningCard.tsx`

- 縣市列不變（縣市名、有效時間）；`towns` 不為 `null` 時，下方多一行灰字列出鄉鎮，以「、」分隔。
- 每組縣市清單下方：若有對應 `kind` 的全文，放 `<details className="warning-text">`，`summary` 為「全文 · 9/27 07:30 發布」（無 `issued` 時只寫「全文」），內文 `white-space: pre-line` 保留換行。
- 同一 `kind` 的全文只放在第一個（最嚴重的）組。
- 全文載入中、失敗或找不到對應 `kind` 時不顯示 `details`，特報清單照常。

### 5.4 `frontend/src/styles.css`

`.warning-text` 沿用 `.quake-counties` 的 `summary` 寫法（隱藏預設標記、`▸`／`▾`）；`.warning-group .towns` 灰字小字。

## 6. 錯誤處理

- 沿用 `ensureFresh`：三個資料集任一失敗即整批保留舊資料並標示 stale（`StatusBadge` 顯示）。從未成功時兩支 API 都回傳空陣列，卡片顯示「目前無天氣特報」。
- `005` 的 `info` 為空、或只有過期／解除訊息：不產生高溫列與高溫全文，屬正常情況。
- `002` 的 `record` 為空：全文表清空，卡片不顯示 `details`。
- 已知限制：CWA 連續失敗時，舊的高溫資訊可能在 `expires` 之後仍以 stale 狀態顯示，與 `001` 的行為一致，不另外處理。

## 7. 測試

- `server/cwa/parse.test.ts`
  - `parseHeat`（真實 fixture）：`now` 在過期前 → 7 縣市各一列、`level` 為 `黃色燈號`、臺北市 `towns` 為 4 個區、`6500100` 類直轄市碼 → `65000`、`1000715` 類 → `10007`；`now` 在 `expires` 之後 → `[]`；`urgency: 'Past'` 或標題含「解除」→ `[]`；同一縣市兩種燈號 → 兩列；縣市層級 `geocode`（2／5 碼）→ `towns: null`；`info`、`parameter`、`area` 為單一物件時照常解析。
  - `parseHeatText`：`description` 空一行接 `instruction`；過期時 `[]`。
  - `parseWarningTexts`（手寫 fixture）：`kind` 對應、多則紀錄取 `issueTime` 最新者、`hazard` 為單一物件、空 `record` → `[]`；多語 `content` 取 zh-TW、只有英文或 `contentText` 不是字串 → 無全文、`datasetLanguage` 非 zh-TW 的紀錄略過。
  - `parseWarnings`：既有列 `level`、`towns` 為 `null`。
- `server/repo.test.ts`：`level`、`towns` 寫入後讀回一致（含 `null`）；`replaceWarningTexts` 後 `listWarningTexts`。
- `server/db.test.ts`：建立舊版 `warnings` 表與 `fetch_log` 紀錄後 `openDb` → 表有 `level` 欄、`warnings` 的 `fetch_log` 已刪除、其他 `fetch_log` 保留。
- `server/sync.test.ts`：`syncWarnings` 抓三個資料集並寫入兩張表；任一抓取失敗時兩張表都維持原狀。
- `frontend/src/lib/warnings.test.ts`：新的 rank 與高溫顏色；`groupByKind` 的燈號標題、紅 > 橙 > 黃 排序、`kind`；`badgeText` 高溫單組文字。
- 手動：headless Chrome 截手機與桌機寬度，確認特報圖層的高溫填色（淺色與深色底圖）、其他圖層描邊、徽章文字、卡片鄉鎮列與全文展開。實作完成時高溫資訊若已過期，暫時以 fixture 餵給 API 檢查畫面，完成後還原。

## 8. 不做

- 大雷雨即時訊息（無官方 API）
- 高溫資訊畫到鄉鎮層級
- 以 `W-C0033-003`／`004` 的 CAP 文字取代 `002`
- 英文版全文
- 推播或通知
