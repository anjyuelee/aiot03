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

1. **Build 時**：`scripts/build-db.ts` 以 `CWA_API_KEY` 抓取測站、觀測、鄉鎮預報，寫入 `data/weather.db`，隨部署打包（唯讀開啟）。
2. **執行時**：API 先查 `/tmp/cache.db`；缺少或過期則向 CWA 抓取並寫回 `/tmp/cache.db`。TTL：觀測 10 分鐘、預報 60 分鐘、雷達/衛星 10 分鐘。
3. **退路**：CWA 失敗 → `/tmp` 舊快取 → 打包的 `weather.db`，回應標示 `stale: true`。
4. **更新**：GitHub Actions 每 3 小時呼叫 Vercel Deploy Hook 重建，刷新種子資料。

兩個 DB 使用同一份 schema 與同一個 repository 程式碼。

### 3.2 Schema

```sql
stations(id TEXT PK, name TEXT, county TEXT, town TEXT, lat REAL, lon REAL)
observations(station_id TEXT, obs_time TEXT, temp REAL, humidity REAL,
             wind_speed REAL, wind_dir REAL, rain_1h REAL, rain_24h REAL,
             PRIMARY KEY(station_id, obs_time))
towns(id TEXT PK, name TEXT, county TEXT, lat REAL, lon REAL)
forecasts(town_id TEXT, kind TEXT CHECK(kind IN ('3h','week')), start_time TEXT,
          temp REAL, pop REAL, wx TEXT, wx_code TEXT, wind_speed REAL, wind_dir TEXT,
          PRIMARY KEY(town_id, kind, start_time))
images(kind TEXT PK CHECK(kind IN ('radar','satellite')), url TEXT, obs_time TEXT,
       west REAL, south REAL, east REAL, north REAL)
fetch_log(dataset TEXT PK, fetched_at TEXT)
```

`towns` 中心點經緯度：若 CWA 預報資料內含則採用，否則以內建的鄉鎮中心點靜態 JSON 補齊（build 時寫入）。

### 3.3 CWA 資料集（實作第一步須以實際授權碼驗證 ID 與欄位）

| 用途 | 預計資料集 |
|---|---|
| 自動站觀測 | `O-A0001-001`（自動氣象站）＋ `O-A0003-001`（局屬站） |
| 鄉鎮 72h 預報 | `F-D0047-089` |
| 鄉鎮一週預報 | `F-D0047-091` |
| 雷達回波 | `O-A0058-003` |
| 衛星雲圖 | `O-B0032` 系列（驗證後擇一） |

若驗證後 ID 或格式不同，以實際 API 為準並更新本表。

### 3.4 API

回應格式統一：`{ data, updatedAt, stale }`；錯誤：`{ error }` + HTTP 狀態碼。

| 端點 | 說明 |
|---|---|
| `GET /api/observations` | 全台最新觀測（含測站座標） |
| `GET /api/forecast/:townId` | 單一鄉鎮 3h 與一週預報 |
| `GET /api/forecast-grid?time=ISO` | 指定時段所有鄉鎮預報（時間軸未來時段） |
| `GET /api/radar`、`GET /api/satellite` | 最新圖片 URL、時間、地理範圍 |
| `GET /api/search?q=` | 鄉鎮名稱搜尋（最多 10 筆） |
| `GET /api/towns` | 所有鄉鎮 id/名稱/中心點（前端算最近鄉鎮） |

CWA 授權碼只存在後端環境變數，前端不接觸 CWA。

## 4. 前端

### 4.1 元件

- `MapView`：MapLibre 地圖，承載所有圖層
- `layers/TemperatureLayer`、`RainLayer`、`HumidityLayer`：「現在」用 IDW 內插熱圖；未來時段用鄉鎮分區色塊（鄉鎮邊界採 `taiwan-atlas` npm 套件的 TopoJSON，打包於前端靜態資源，以鄉鎮代碼對應 `towns.id`）
- `layers/WindParticles`：測站風向量 → 規則網格（IDW）→ Canvas 粒子動畫
- `layers/RadarLayer`、`SatelliteLayer`：MapLibre image source
- `LayerPicker`：右側直列圖層選單；手機收合為按鈕
- `Timeline`：播放、時間刻度（現在 ~ 72h）、色階圖例；雷達/衛星停用未來時段
- `SearchBox`：防抖搜尋＋GPS 定位
- `LocationCard`：目前觀測、72h 溫度/降雨機率走勢圖、一週預報；桌機浮動卡片、手機底部抽屜
- `api/client.ts`：TanStack Query 封裝

### 4.2 狀態與 UX

- Zustand 管理 `layer`、`timeIndex`、`selectedTown`，並同步到 URL query（`?layer=wind&t=6&town=6600800`）
- 深色毛玻璃風格、圖層淡入淡出、骨架載入畫面、顯示「更新於 HH:mm」，`stale` 時顯示提示標籤
- 點擊地圖 → 以 `/api/towns` 中心點找最近鄉鎮

## 5. 錯誤處理

- CWA 請求逾時 8 秒；失敗走 3.1 退路
- CWA 缺值（如 `-99`、`-999`）於轉換層統一轉 `null`；前端略過 `null`
- 圖片圖層載入失敗僅該圖層顯示「暫時無法取得」

## 6. 測試

- 後端：CWA 回應轉換（以真實 JSON fixture）、repository（in-memory SQLite）、TTL/退路邏輯
- 前端：IDW 內插、風場網格、最近鄉鎮計算等純函式
- 手動：本機 `vercel dev` 端到端檢查，瀏覽器實際確認各圖層

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
