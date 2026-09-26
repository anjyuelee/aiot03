# 雷達回放設計文件

- 日期：2026-09-26
- 目標：雷達圖層改為可播放最近 3 小時（每 10 分鐘一格、共 19 格）的回波動畫，看出雨帶從哪來、往哪移動；最後一格即目前最新觀測。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 範圍 | 只做雷達。衛星沒有歷史資料來源（見 §2.3），列為不做 |
| 回放長度 | 固定 3 小時、每 10 分鐘一格，共 19 格（含「現在」） |
| 資料來源 | 雷達整合回波格點 `O-A0059-001`，19 格都來自同一來源；不再使用 `O-A0058-005` 雷達 PNG |
| 色階 | CWA 官方 0–65 dBZ、每 1 dBZ 一色，與現行雷達 PNG 相同 |
| 時間軸 | 雷達圖層顯示「過去 → 現在」的時間軸：播放鈕、可拖曳軌道、跟隨標籤、刻度，下方加 dBZ 圖例 |
| 播放 | 每格 500 ms；播到「現在」停 1.5 秒再從頭 |
| 切換 | 格與格之間硬切，不做淡入淡出 |
| 預設位置 | 切到雷達圖層時停在「現在」；資料更新時停在「現在」者跟到新的最新一格 |
| 網址 | `?layer=radar` 可分享；時間軸位置不寫進網址 |
| 徽章 | 左上角維持「觀測於 HH:mm」，為最新一格時間；看的是哪一格由時間軸標籤顯示 |

## 2. 資料來源

### 2.1 時間清單：`historyapi` metadata

```
GET https://opendata.cwa.gov.tw/historyapi/v1/getMetadata/O-A0059-001
    ?Authorization=…&format=JSON&timeFrom=2026-09-26T07:40:00
```

實測（2026-09-26）：

- 歷史 API 只支援 `O-A0001-001`、`O-A0002-001`、`O-A0059-001` 三個資料集（`/historyapi/v1/getDataId`）。
- 每 10 分鐘一筆，保留約 10 天（不帶 `timeFrom` 回傳 1439 筆、約 337 KB）；帶 `timeFrom` 只回傳該時間之後的筆數，19 筆約 4.7 KB、0.08 秒。
- 最新一筆的 `DateTime` 與同時刻 `O-A0058-005` 的觀測時間相同（皆 11:30），約在觀測時間後 6～7 分鐘出現。
- 結構：

```
dataset.resources.resource.data.time[]
  DateTime     例：2026-09-26T11:30:00+08:00，由舊到新
  UpdateTime   例：2026-09-26T11:36:38+08:00
  ProductURL   getData 網址，**帶有授權碼**
```

`timeFrom` 取「現在 − 4 小時」（臺北時間、不帶時區），再取最後 19 筆；若用 3 小時，最新一格延遲時會湊不滿 19 格。實測 10 天內 1439/1440 筆，缺格罕見，缺了就少一格，不補。

### 2.2 單格：`historyapi` getData

```
GET https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/11/30/00?Authorization=…
→ 302 → https://cwaopendata.s3.ap-northeast-1.amazonaws.com/history/Observation/202609261130compref_mosaic.xml
```

實測：XML 約 8.9 MB（gzip 後約 48 KB，但 S3 不壓縮傳輸），下載約 0.5 秒。一旦產生不再變動。

```xml
<dataset>
  <datasetInfo><parameterSet>
    <StartPointLongitude>115.0</StartPointLongitude>
    <StartPointLatitude>18.0</StartPointLatitude>
    <GridResolution>0.0125</GridResolution>
    <DateTime>2026-09-26T11:00:00+08:00</DateTime>
    <GridDimensionX>921</GridDimensionX>
    <GridDimensionY>881</GridDimensionY>
  </parameterSet></datasetInfo>
  <contents><content>-9.990E+02,-9.990E+02,…</content></contents>
</dataset>
```

- `<content>` 是單一一行、逗號分隔的科學記號浮點數，共 921 × 881 = 811,401 個，單位 dBZ。
- 順序：左下角（115.0°E, 18.0°N）起，先由西向東、再由南往北。
- `-99` 為無效值、`-999` 為雷達範圍外或品管移除；另有少量負 dBZ。
- 座標系統為 TWD67，與 WGS84 相差小於一格，不校正（現行雷達 PNG 亦同）。

與現行 `O-A0058-005` PNG 對照（同為 11:30）：

- PNG 為 3600×3600，但放大檢視是約 4 px 一格的方塊，即同一份 0.0125° 格點放大繪製；改用格點**解析度不變**。
- 兩者小回波位置逐點吻合；PNG 把 125.5°E 以東的遠海邊緣回波遮掉，格點保留。改用格點後該區會多出回波，接受。

### 2.3 衛星沒有歷史來源

歷史 API 不支援 `O-B0033-*`；S3 的 `history/` 只有雷達與雨量站；bucket 沒開版本控制。做衛星回放須自行每 10 分鐘存到持久儲存（例如 Vercel Blob），不在本次範圍。

### 2.4 色階

CWA 雷達色標（`https://www.cwa.gov.tw/V8/assets/img/radar/colorbar_n.png`）66 格對應 0–65 dBZ；與 11:30 PNG 逐格反推的 0–55 dBZ 顏色完全相同。`floor(dBZ)` 對應第幾格，≥ 65 用最後一格，< 0 及 `-99`、`-999` 透明。

```ts
// dBZ 0–65，每 1 dBZ 一色
export const RADAR_COLORS: [number, number, number][] = [
  [0, 255, 255], [0, 236, 255], [0, 218, 255], [0, 200, 255], [0, 182, 255], [0, 163, 255], [0, 145, 255], [0, 127, 255],
  [0, 109, 255], [0, 91, 255], [0, 72, 255], [0, 54, 255], [0, 36, 255], [0, 18, 255], [0, 0, 255],
  [0, 255, 0], [0, 244, 0], [0, 233, 0], [0, 222, 0], [0, 211, 0], [0, 200, 0], [0, 190, 0], [0, 180, 0], [0, 170, 0],
  [0, 160, 0], [0, 150, 0], [51, 171, 0], [102, 192, 0], [153, 213, 0], [204, 234, 0],
  [255, 255, 0], [255, 244, 0], [255, 233, 0], [255, 222, 0], [255, 211, 0], [255, 200, 0], [255, 184, 0], [255, 168, 0],
  [255, 152, 0], [255, 136, 0], [255, 120, 0], [255, 96, 0], [255, 72, 0], [255, 48, 0], [255, 24, 0],
  [255, 0, 0], [244, 0, 0], [233, 0, 0], [222, 0, 0], [211, 0, 0], [200, 0, 0], [190, 0, 0], [180, 0, 0], [170, 0, 0],
  [160, 0, 0], [150, 0, 0], [171, 0, 51], [192, 0, 102], [213, 0, 153], [234, 0, 204],
  [255, 0, 255], [234, 0, 255], [213, 0, 255], [192, 0, 255], [171, 0, 255], [150, 0, 255],
]
```

### 2.5 fixture

`server/__fixtures__/O-A0059-001-metadata.json`：2026-09-26 帶 `timeFrom` 的實際回應，保留 21 筆（多於 19，測「取最後 19 筆」）。**每筆 `ProductURL` 的 `?Authorization=…` 查詢字串移除後才提交。**

格點 XML 不存檔：測試內以 3×2 的小型字串建構（同樣的標籤結構）。

## 3. 共用

### 3.1 型別（`shared/types.ts`）

```ts
export interface RadarFrame {
  /** CWA DateTime，+08:00 ISO 字串 */
  time: string
  /** /api/radar-frame?t=YYYYMMDDHHmm */
  url: string
}

export interface RadarFrames {
  /** 由舊到新，最多 19 格 */
  frames: RadarFrame[]
  bounds: Bounds
}
```

`ImageKind` 移除 `'radar'`，只剩 `'satellite'`；`ImageOverlay` 只供衛星使用。

### 3.2 色階與範圍（`shared/radar.ts`）

- `RADAR_COLORS`（§2.4）。
- `radarColor(dbz: number): [number, number, number] | null`：< 0（含 `-99`、`-999`）回 `null`；否則 `RADAR_COLORS[Math.min(65, Math.floor(dbz))]`。
- `RADAR_GRID = { west: 115, south: 18, step: 0.0125, nx: 921, ny: 881 }`。
- `RADAR_BOUNDS: Bounds`：格點中心往外推半格，`[114.99375, 17.99375, 126.50625, 29.00625]`。

## 4. 後端

### 4.1 CWA client（`server/cwa/client.ts`）

`Fetcher` 新增：

- `historyMetadata(id, params): Promise<any>`：GET `historyapi/v1/getMetadata/{id}`，JSON，逾時 8 秒。
- `historyData(id, path): Promise<Uint8Array>`：GET `historyapi/v1/getData/{id}/{path}`（跟隨 302），逾時 20 秒。HTTP 404 拋出 `NotFoundError`，其他非 2xx 拋一般錯誤。

兩者錯誤訊息中的網址都把 `Authorization=…` 遮成 `***`（同現有 `getJson`）。

### 4.2 解析

- `parseRadarTimes(json): string[]`（`server/cwa/parse.ts`）：取 `time[].DateTime`，排序後回傳最後 19 筆。
- `parseRadarGrid(xml: string, nx = 921, ny = 881): Float32Array`（`server/radar.ts`）：以正規表示式取 `GridDimensionX/Y` 與 `<content>`；維度不是 `nx`×`ny`、或數值個數不是 `nx * ny` 時拋錯。預期維度做成參數，測試才能用小尺寸字串。
- `radarRgba(values: Float32Array, nx = 921, ny = 881): Uint8Array`（`server/radar.ts`）：`nx`×`ny` RGBA，**北在上**（第 0 列為最北），`radarColor` 為 `null` 時 alpha 0，否則 alpha 255。

### 4.3 PNG 編碼（`server/png.ts`）

`encodePng(width, height, rgba): Uint8Array`：8-bit RGBA；每列前加 filter byte 0，整體以 `fflate` 的 `zlibSync` 壓縮成單一 IDAT；IHDR／IDAT／IEND 各附 CRC-32（手寫查表）。不新增套件。

### 4.4 儲存與同步

- `server/db.ts`：新表 `radar_frames (time TEXT PRIMARY KEY)`。
- `server/repo.ts`：`replaceRadarFrames(db, times)`（交易內整批替換）、`listRadarFrames(db): string[]`（由舊到新）。
- `server/sync.ts`：`syncRadar(db, f)` 呼叫 `historyMetadata('O-A0059-001', { timeFrom })`，`parseRadarTimes` 為空時拋錯（保留舊清單），否則整批替換並 `logFetch(db, 'radar', …)`。
- 移除 `syncImage` 的 radar 分支與 `IMAGE_IDS.radar`、`parseImage` 的 radar 分支、`O-A0058-005.json` fixture 與相關測試。`images` 表不再寫入 radar 列（舊種子 DB 的殘留列不影響）。
- `scripts/build-db.ts`：`radar` 步驟改呼叫 `syncRadar`，統計加 `radar_frames`。
- `server/freshness.ts`：沿用 `radar: 10 * MIN`。

### 4.5 API

**`GET /api/radar`**（`api/radar.ts`，改寫）

```
service.getRadar(): ensureFresh(db, 'radar', syncRadar) → listRadarFrames
→ ApiResponse<RadarFrames>：frames 依時間組 url（DateTime 去掉 -、:、T 取前 12 碼當 t），bounds = RADAR_BOUNDS
```

清單為空時回 503。快取沿用 `json()`（`s-maxage=60, stale-while-revalidate=60`）。

**`GET /api/radar-frame?t=YYYYMMDDHHmm`**（`api/radar-frame.ts`，新增）

| 情況 | 回應 |
|---|---|
| `t` 不是 12 位數字，或分鐘不是 10 的倍數 | 400 JSON，`no-store` |
| 正常 | `historyData('O-A0059-001', 'YYYY/MM/DD/HH/mm/00')` → `parseRadarGrid` → `radarRgba` → `encodePng`；200 `image/png`，`cache-control: public, max-age=31536000, s-maxage=31536000, immutable` |
| CWA 404（`NotFoundError`） | 404 JSON，`cache-control: public, s-maxage=60` |
| CWA 逾時或其他錯誤 | 502 JSON，`no-store` |
| 格點維度不符 | 500（`handle()`），`no-store` |

不存 SQLite，不檢查 `t` 是否在目前清單內（清單更新時前端可能還在要舊格）。Vercel CDN 以 `s-maxage` 決定邊緣快取，只寫 `max-age` 不會生效。

## 5. 前端

### 5.1 資料（`frontend/src/api.ts`）

- `useRadar(enabled)`：GET `/api/radar`，`refetchInterval` 10 分鐘。
- `useRadarFrames(frames: RadarFrame[] | undefined)`：`useQueries`，每格 key `['radarFrame', time]`，沿用 `lib/overlays.ts` 的 `loadImage` 載入 PNG → `reprojectImage(img, bounds)` → `CanvasOverlay`；`staleTime: Infinity`、`gcTime: CANVAS_GC`。陣列**由新到舊**排列，讓最新一格最先送出。
- 移除 `useOverlay`、`useReprojected` 與 `lib/overlays.ts` 的 `radarOverlay`。

每格重投影後約 921×881，約 3.2 MB；19 格加顯示用 canvas 約 66 MB，GPU 上只有一張 texture。

### 5.2 純函式（`frontend/src/lib/radar.ts`）

- `agoLabel(time, latest): string`：0 → `''`；< 60 分 → `40 分鐘前`；整小時 → `2 小時前`；其他 → `1 小時 20 分前`。
- `hourTicks(times): number[]`：分鐘為 00 的格子 index。
- `advanceRadar(pos, dt, n)`：位置以「距離現在的格數」表示（0 = 現在，−(n−1) = 最舊）。每格 500 ms；超過 0 之後再停 1.5 秒（即允許到 +3 格的虛擬位置），之後回到 −(n−1)。
- `radarIndex(pos, n)`：`clamp(n − 1 + Math.round(pos), 0, n − 1)`，把位置轉成 frames 的 index（虛擬停留區間對應最後一格）。

### 5.3 狀態（`frontend/src/store.ts`）

新增 `radarPos: number`（預設 0）與 `setRadarPos`。`setLayer` 切到任何圖層都把 `radarPos` 設回 0。不寫進網址（`urlState` 不變）。`playing` 與預報時間軸共用（`setLayer` 已會設為 `false`）。

以「距離現在的格數」儲存，資料每 10 分鐘多一格時，停在「現在」者自然跟到新的最新一格；停在其他位置者看到的時間往後移 10 分鐘，接受。

### 5.4 地圖（`frontend/src/components/RadarLayer.tsx`）

- 雷達圖層時 mount；一個 canvas source `radar`（`animate: false`，座標為 `RADAR_BOUNDS`）加一個 raster layer（`raster-opacity` 0.9、`raster-fade-duration` 0），插在 `dataLayerBefore(map)` 之前。
- 顯示用 canvas 尺寸同重投影後的格子。目前格（`radarIndex(radarPos, n)`）載入完成時：`clearRect` → `drawImage` → `source.play(); source.pause();`（MapLibre 的 `pause()` 會先 `prepare()` 上傳 texture，`play()` 觸發重畫）。目前格尚未載入或載入失敗時不重畫，保留上一張。
- unmount 時移除 layer 與 source。
- `DataLayers.tsx`：移除雷達的 `useOverlay`／`useReprojected`／`useImageOverlay(map, 'image', …)`，改為 `{layer === 'radar' && <RadarLayer map={map} />}`。

### 5.5 時間軸

**抽出 `TimeTrack`（`frontend/src/components/TimeTrack.tsx`）**：`Timeline.tsx` 中通用的播放鈕、可拖曳軌道（pointer capture）、跟隨標籤、刻度與鍵盤操作抽成元件，props 描述格數、目前位置、標籤文字、刻度樣式與各事件。預報時間軸改用它，行為與外觀不變。

**`RadarTimeline`（`frontend/src/components/RadarTimeline.tsx`）**：雷達圖層時取代原本回傳 `null` 的分支。

- 19 格刻度，左為最舊、右為「現在」；`hourTicks` 的格子畫長刻度並標 `HH:00`（沿用 `tick day` 與 `day-label` 樣式）。
- 標籤：最後一格主字「現在」、副字「HH:mm 觀測」；其他格主字 `HH:mm`、副字 `agoLabel`。
- 拖曳、方向鍵、Home／End 同預報時間軸；放開時對齊最近一格。
- 尚未載入的格子刻度變淡，失敗的格子刻度標為失敗色；19 格全部載入（失敗者除外）前播放鈕停用。
- 播放用 `requestAnimationFrame` 呼叫 `advanceRadar`；播放時跳過失敗的格子。
- 下方 `Legend scale="radar"`。

**圖例**：`colorScale.ts` 的 `ScaleId` 加 `'radar'`，`stops` 由 `RADAR_COLORS` 產生（每個 dBZ 一個 stop，0–65），單位 `dBZ`。

### 5.6 徽章（`StatusBadge.tsx`）

雷達圖層改讀 `useRadar`：顯示「觀測於」最新一格時間；`/api/radar` 失敗或最新一格載入失敗時顯示「暫時無法取得資料」；`stale` 時加「資料可能非最新」。

## 6. 錯誤處理

| 情況 | 行為 |
|---|---|
| metadata 抓取失敗或回傳空清單 | `ensureFresh`：保留 SQLite 舊清單、標 `stale`、失敗後退避 60 秒 |
| SQLite 無清單且抓取失敗 | `/api/radar` 回 503，徽章顯示「暫時無法取得資料」 |
| 單格 400／404／502／500 | 見 §4.5；前端該格刻度標為失敗，播放跳過 |
| 最新一格失敗 | 徽章顯示「暫時無法取得資料」，地圖保留上一張 |
| 授權碼 | 錯誤訊息與 log 一律遮蔽；fixture 提交前移除 |

## 7. 測試

- `server/cwa/parse.test.ts`：`parseRadarTimes` 由 21 筆 fixture 取最後 19 筆、由舊到新。
- `server/radar.test.ts`（vitest 只收 `server/` 與 `frontend/src/`，`shared/radar.ts` 的測試也放這裡）：
  - `parseRadarGrid(xml, 3, 2)`：數值與順序；維度不符、數值個數不符時拋錯。
  - `radarRgba(values, 3, 2)`：南北翻轉（輸入第 0 列為最南，輸出第 0 列為最北）；透明與不透明像素。
  - `radarColor` 邊界：−999、−99、−0.1 → `null`；0 → 青；14.9 → 藍；15 → 綠；65、80 → 紫。
- `server/png.test.ts`：PNG 簽章、IHDR 寬高與色彩型態、IDAT 以 `unzlibSync` 解壓後等於各列加 filter byte 0 的原始 RGBA、CRC 正確。
- `server/sync.test.ts`：`syncRadar` 以 fake Fetcher 寫入 19 格與 `fetch_log`；空清單拋錯且保留舊資料。
- `server/repo.test.ts`：`replaceRadarFrames` 整批替換、`listRadarFrames` 排序。
- 單格 API：`t` 格式驗證（400）、`NotFoundError` → 404 與快取標頭、其他錯誤 → 502。
- `frontend/src/lib/lib.test.ts`（或 `radar.test.ts`）：`agoLabel`、`hourTicks`、`advanceRadar`（含停留與回到開頭）、`radarIndex`。
- 手動：`npm run dev`，實測播放、拖曳、鍵盤、載入中與失敗狀態、手機寬度；`npm test && npm run typecheck && npm run build`。
- README：功能說明（雷達 3 小時回放）、架構圖（`O-A0058-005` 改為 historyapi `O-A0059-001`）、API 表加 `/api/radar-frame`、TTL 表；重截 `docs/screenshots/radar.png`（含時間軸）。

## 8. 不做

- 衛星回放（無歷史來源，需持久儲存）
- 格與格之間淡入淡出或內插
- 時間軸位置寫進網址
- 可調回放長度（固定 3 小時）
- 滑鼠移過顯示 dBZ 數值
- TWD67 → WGS84 校正、遮掉 125.5°E 以東的邊緣回波
- 雷達臨近預報（往未來外推）
