# CWA 天氣地圖（類 Windy）設計文件

- 日期：2026-09-23
- 用途：NCHU AIoT 課程作業
- 目標：以中央氣象署（CWA）開放資料建立類 Windy 的全螢幕互動天氣地圖，前後端分離、使用 SQLite、上傳 GitHub（`anjyuelee/aiot03`，public）並部署到 Vercel。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 即時觀測地圖 | 全台自動氣象站溫度、風、雨量、濕度，IDW 內插熱圖 |
| 風場動畫 | 以測站風向量內插網格驅動 Canvas 粒子動畫 |
| 鄉鎮預報 | 點擊地點顯示 72 小時逐 3 小時與一週預報 |
| 雷達 / 衛星 | CWA 雷達回波圖、衛星雲圖地理疊加 |
| 搜尋 / 定位 | 鄉鎮名稱搜尋、GPS 定位 |
| 資料庫 | 必須使用 SQLite |
| 部署 | Vercel（CLI 操作），GitHub public repo |

## 2. 技術選型

- 前端：React + Vite + TypeScript、MapLibre GL（CARTO dark 底圖，免 key）、Recharts、TanStack Query、Zustand
- 後端：Vercel Functions（Node.js + TypeScript）、`better-sqlite3`
- 測試：Vitest
- 版面：Windy 經典型（右側直列圖層、底部時間軸＋色階、浮動地點卡片）

## 3. 架構

```
aiot03/
├─ frontend/             React SPA，只呼叫 /api/*
├─ api/                  Vercel Functions 端點（薄層，呼叫 server/）
├─ server/               CWA client、資料轉換、SQLite repository、快取邏輯
├─ scripts/build-db.ts   build 時抓 CWA → data/weather.db
├─ data/weather.db       打包進部署的唯讀種子資料
├─ .github/workflows/    定時觸發 Vercel Deploy Hook
└─ vercel.json
```

### 3.1 SQLite 使用方式（Vercel 限制下的方案 A）

Vercel 檔案系統唯讀、僅 `/tmp` 可寫且不跨 instance 保存，因此：

1. **Build 時**：`scripts/build-db.ts` 以 `CWA_API_KEY` 抓取全部資料寫入 `data/weather.db`，透過 `vercel.json` 的 `includeFiles` 隨 function 打包。
2. **冷啟動**：若 `/tmp/aiot03-weather.db` 不存在，將打包的 `data/weather.db` 複製過去，之後都讀寫這一份（單一 DB，種子資料即為退路）。
3. **執行時**：以 `fetch_log` 判斷是否過期（觀測 10 分鐘、預報 60 分鐘、雷達/衛星 10 分鐘）；過期則向 CWA 抓取並寫回 SQLite。
4. **退路**：CWA 失敗時沿用 SQLite 內既有資料，回應標示 `stale: true`。
5. **更新**：GitHub Actions 每 3 小時呼叫 Vercel Deploy Hook 重建，刷新種子資料。
6. 回應 header `x-seed-db: present|missing` 用來驗證種子 DB 確實有被打包。

### 3.2 Schema

```sql
stations(id TEXT PK, name TEXT, county TEXT, town TEXT, lat REAL, lon REAL)
observations(station_id TEXT PK, obs_time TEXT, temp REAL, humidity REAL,
             wind_speed REAL, wind_dir REAL, rain_1h REAL, rain_24h REAL)   -- 只保留每站最新一筆
towns(id TEXT PK, name TEXT, county TEXT, lat REAL, lon REAL)
forecast_3h(town_id TEXT, start_time TEXT, temp REAL, pop REAL, humidity REAL,
            wind_speed REAL, wind_dir TEXT, wx TEXT, wx_code TEXT, PRIMARY KEY(town_id, start_time))
forecast_week(town_id TEXT, start_time TEXT, end_time TEXT, min_temp REAL, max_temp REAL,
              pop REAL, wx TEXT, wx_code TEXT, PRIMARY KEY(town_id, start_time))
images(kind TEXT PK, url TEXT, obs_time TEXT, west REAL, south REAL, east REAL, north REAL)
satellite_tiles(id TEXT PK, png BLOB, west REAL, south REAL, east REAL, north REAL)   -- id 例如 '2/1/2'
fetch_log(dataset TEXT PK, fetched_at TEXT)
```

鄉鎮中心點經緯度直接取自 CWA 預報資料（`Latitude`/`Longitude`），`Geocode`（8 碼）即 `towns.id`，與 `taiwan-atlas` 的 `TOWNCODE` 相同。

### 3.3 CWA 資料集（已於 2026-09-23 以實際授權碼驗證）

| 用途 | 資料集 | 備註 |
|---|---|---|
| 自動站觀測 | `O-A0001-001`、`O-A0003-001` | 溫度、濕度、風速、風向；缺值為 `-99` |
| 雨量站 | `O-A0002-001` | `Past1hr`、`Past24hr` 雨量，約 1340 站 |
| 鄉鎮 3 天預報 | `F-D0047-093` + `locationId=F-D0047-001,005,…,085` | 每次最多回傳 5 個縣市，需分批；3 小時一格 |
| 鄉鎮一週預報 | `F-D0047-093` + `locationId=F-D0047-003,007,…,087` | 12 小時一格 |
| 雷達回波 | `O-A0058-005`（fileapi） | 透明底 PNG，範圍 115–126.5E、17.75–29.25N |
| 衛星雲圖 | `O-B0033-003`（fileapi → KMZ） | 東亞紅外線黑白 KMZ，內含各層級 GroundOverlay 圖塊與精確 `LatLonBox`；取 level 2（16 塊、每塊 312px、0.04°/px，約 1.6MB）存入 SQLite `satellite_tiles` |

`F-D0047-089/091` 是縣市層級（22 筆），不採用。`O-B0032-002` 為含標題與海岸線的非等距投影圖片，實測無法正確疊圖，改用 KMZ。fileapi 以 302 轉址到 S3，S3 圖片有 `Access-Control-Allow-Origin: *`。

### 3.4 API

回應格式統一：`{ data, updatedAt, stale }`；錯誤：`{ error }` + HTTP 狀態碼。每個端點是 `api/` 下的單一檔案、使用 Web 標準 `GET(request): Response`。

| 端點 | 說明 |
|---|---|
| `GET /api/observations` | 全台最新觀測（含測站座標） |
| `GET /api/towns` | 所有鄉鎮 id/名稱/縣市/中心點（搜尋與最近鄉鎮都在前端算） |
| `GET /api/forecast?town=ID` | 單一鄉鎮 3 小時與一週預報 |
| `GET /api/forecast-grid[?time=ISO]` | `times`（所有 3 小時時段）＋指定時段所有鄉鎮數值 |
| `GET /api/radar` | 最新雷達圖片 URL、時間、地理範圍 |
| `GET /api/satellite` | 衛星觀測時間與圖塊清單（每塊的 URL 與範圍） |
| `GET /api/satellite-tile?id=2/1/2` | 從 SQLite 讀出的 PNG 圖塊 |

CWA 授權碼只存在後端環境變數，前端不接觸 CWA。成功回應帶 `cache-control: s-maxage=300` 讓 Vercel CDN 快取。

## 4. 前端

### 4.1 元件

- `MapView`：MapLibre 地圖，點擊 → 最近鄉鎮
- `DataLayers`：依圖層與時間決定要畫什麼：
  - 「現在」＋溫度/風/雨量/濕度：測站 IDW 內插熱圖（直接以 Mercator 列間距計算，canvas source）
  - 未來時段：鄉鎮分區色塊（`taiwan-atlas` 的 `towns-10t.json`，以 `TOWNCODE` 對應）；雨量圖層改顯示降雨機率
  - 風：熱圖（風速）＋ `WindParticles` Canvas 粒子動畫（測站風向量 IDW 成網格）
  - 雷達：經緯度等距 PNG，於前端逐列重投影到 Mercator 後以 canvas source 疊加
  - 衛星：16 個 KMZ 圖塊各自重投影；灰階亮度轉成白色雲層的透明度，只顯示雲、不遮住底圖
- `LayerPicker`：右側直列圖層選單；手機收合為按鈕
- `Timeline`：播放、滑桿（現在 ~ 72h，共 24 格）、色階圖例；雷達/衛星停用未來時段
- `SearchBox`：前端過濾鄉鎮（台/臺 視為相同）＋GPS 定位
- `LocationCard`：最近測站即時觀測、未來 48h 溫度/降雨機率圖、一週預報；桌機浮動卡片、手機底部抽屜
- `StatusBadge`：「更新於 HH:mm」、`stale` 提示、圖片載入失敗提示
- `api.ts`：TanStack Query hooks

### 4.2 狀態與 UX

- Zustand 管理 `layer`、`t`（0 = 現在）、`town`、`playing`，並同步到 URL query（`?layer=wind&t=6&town=10002010`）
- 深色毛玻璃風格、圖層淡入、載入骨架、「更新於 HH:mm」

## 5. 錯誤處理

- CWA 請求逾時 8 秒；失敗走 3.1 退路
- CWA 缺值（如 `-99`、`-999`）於轉換層統一轉 `null`；前端略過 `null`
- 圖片圖層載入失敗僅於 `StatusBadge` 顯示「暫時無法取得」，其他圖層不受影響
- 同步結果為 0 筆時視為失敗，不覆蓋既有資料

## 6. 測試

- 後端：CWA 回應轉換（以真實 JSON fixture）、repository（in-memory SQLite）、TTL/退路邏輯
- 前端：IDW 內插、Mercator 換算、重投影列對應、風場、最近鄉鎮、搜尋、URL 狀態、週預報分組等純函式
- 手動：本機 `npm run dev`（Vite 內建 middleware 直接執行 `api/*.ts`）端到端檢查，瀏覽器實際確認各圖層

## 7. 部署

1. `gh repo create anjyuelee/aiot03 --public` 並推送
2. 安裝 Vercel CLI，使用者登入後 `vercel link`、設定 `CWA_API_KEY`（production/preview/development）
3. `vercel --prod` 部署
4. 建立 Deploy Hook，存為 GitHub secret `VERCEL_DEPLOY_HOOK`；Actions 每 3 小時觸發
5. `.env` 列入 `.gitignore`

## 8. 範圍外

- 使用者帳號、收藏地點、推播通知
- 歷史資料查詢
- 雷達/衛星的時間回放（僅顯示最新一張）
