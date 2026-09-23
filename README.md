# 台灣天氣地圖（CWA Open Data）

類 Windy 的全螢幕互動天氣地圖：即時測站熱圖、風場粒子動畫、鄉鎮 72 小時／一週預報、雷達回波與衛星雲圖。

- 前端：React + Vite + MapLibre GL（`frontend/`）
- 後端：Vercel Functions（`api/`、`server/`）
- 資料庫：SQLite（better-sqlite3）。Build 時產生 `data/weather.db` 種子資料並隨 function 打包；執行期複製到 `/tmp` 作為快取，過期時向 CWA 重抓。GitHub Actions 每 3 小時觸發重新部署以更新種子資料。
- 資料來源：中央氣象署開放資料平臺

## 本機開發

1. `.env` 放入 `CWA_API_KEY=你的授權碼`
2. `npm install`
3. `npm run build:db`（選用，先建種子 DB）
4. `npm run dev` → http://localhost:5173

## 測試

`npm test`、`npm run typecheck`

## API

| 端點 | 說明 |
|---|---|
| `GET /api/observations` | 全台最新測站觀測 |
| `GET /api/towns` | 鄉鎮清單與中心點 |
| `GET /api/forecast?town=ID` | 鄉鎮 3 小時與一週預報 |
| `GET /api/forecast-grid[?time=ISO]` | 預報時段清單與指定時段全台鄉鎮數值 |
| `GET /api/radar` | 最新雷達回波圖片資訊 |
| `GET /api/satellite` | 最新衛星雲圖圖塊清單 |
| `GET /api/satellite-tile?id=2/1/2` | 衛星雲圖圖塊（PNG，存於 SQLite） |
