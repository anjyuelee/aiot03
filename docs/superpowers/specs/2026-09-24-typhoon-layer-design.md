# 颱風圖層設計文件

- 日期：2026-09-24
- 目標：在既有天氣地圖新增第七個互斥圖層「颱風」，顯示西北太平洋與南海所有活動中熱帶氣旋的過去路徑、預測路徑與暴風圈。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 圖層型態 | 第七個互斥圖層 `typhoon`，與溫度／風／雨量／濕度／雷達／衛星並列 |
| 時間軸 | 停用（同雷達、衛星），一次畫出完整路徑 |
| 視角 | 切到颱風圖層且資料到齊時，`fitBounds` 至「台灣＋所有颱風路徑點」；每次切入只做一次。颱風圖層期間 `minZoom` 由 4 放寬為 3（手機寬度才放得下），離開時還原；首次載入時晚到的鄉鎮／定位不會 `flyTo` 蓋掉縮放 |
| 資訊卡 | 列出每個颱風最新狀態；無颱風時顯示「目前無活動中的熱帶氣旋」 |
| 點擊 popup | 點任一路徑點顯示該時刻數值；預測點標示「+Nh 預測」 |

## 2. 資料來源

CWA `W-C0034-005`（熱帶氣旋路徑），走既有 `datastore` API（`server/cwa/client.ts`）。

實測結構（2026-09-24，舒力基 SURIGAE）：

```
records.TropicalCyclones.TropicalCyclone[]
  Year, TyphoonName, CwaTyphoonName, CwaTdNo, CwaTyNo
  AnalysisData.Fix[]   過去路徑（約每 6 小時）
    DateTime, CoordinateLongitude, CoordinateLatitude,
    MaxWindSpeed, MaxGustSpeed, Pressure, MovingSpeed, MovingDirection,
    Circle15ms?: { Radius, QuadrantRadii?: { Radius: [{ value, dir }] } }
  ForecastData.Fix[]   預測路徑（+6h … +120h）
    InitialTime, ForecastHour, 同上欄位, Radius70PercentProbability
```

所有數值皆為字串；熱帶性低氣壓尚未命名時 `CwaTyNo`／`CwaTyphoonName` 可能為空。

不採用 `W-C0034-001`（颱風警報）：為純文字警報稿，不適合繪圖。

## 3. 共用型別（`shared/types.ts`）

```ts
export interface TyphoonFix {
  time: string              // 過去點為 DateTime；預測點為 InitialTime + ForecastHour
  forecastHour: number | null  // 過去點為 null
  lat: number
  lon: number
  pressure: number | null   // hPa
  maxWind: number | null    // m/s
  maxGust: number | null    // m/s
  moveDir: string | null    // 例：WNW
  moveSpeed: number | null  // km/h
  radius15ms: number | null // 七級風暴風半徑 km；有象限半徑時取四象限最大值
  radius70: number | null   // 70% 機率半徑 km，僅預測點
}

export interface Typhoon {
  id: string                // `${Year}-${CwaTdNo}`
  name: string              // CwaTyphoonName，空則「熱帶性低氣壓 TD{CwaTdNo}」
  nameEn: string | null
  past: TyphoonFix[]
  forecast: TyphoonFix[]
}
```

## 4. 後端

| 檔案 | 改動 |
|---|---|
| `server/cwa/parse.ts` | `parseTyphoons(json): Typhoon[]`；無資料時回傳 `[]` |
| `server/db.ts` | `CREATE TABLE IF NOT EXISTS typhoons (id TEXT PRIMARY KEY, json TEXT)` |
| `server/repo.ts` | `replaceTyphoons(db, list)`（交易內先清空再寫入）、`listTyphoons(db)` |
| `server/sync.ts` | `syncTyphoons(db, f = cwa)`：抓 → parse → `replaceTyphoons` → `logFetch` |
| `server/freshness.ts` | `TTL.typhoon = 30 * MIN` |
| `server/service.ts` | `getTyphoons(): Promise<ApiResponse<Typhoon[]>>` |
| `api/typhoon.ts` | `GET`，回傳 `getTyphoons()`（永遠有值，無 503 分支） |
| `server/__fixtures__/W-C0034-005.json` | 2026-09-24 實抓資料 |

以單表存 JSON：路徑為巢狀結構且一律整批讀寫，正規化無好處。

## 5. 前端

- `frontend/src/lib/layers.ts`：`LayerId` 加 `'typhoon'`，`LAYERS.typhoon = { label: '颱風', icon: '🌀' }`（無 `now`/`future`）。
- `frontend/src/api.ts`：`useTyphoons(enabled)`。
- `frontend/src/lib/typhoon.ts`（純函式）：
  - `circlePolygon(lon, lat, radiusKm, steps = 64)`：以大圓距離產生多邊形座標（不用像素半徑，縮放才正確）
  - `typhoonBounds(list)`：台灣範圍與所有路徑點的聯集
  - `toGeoJSON(list)`：路徑線、路徑點、暴風圈、潛勢圓的 FeatureCollection
  - `fixLines(fix)`：popup 與資訊卡共用的數值文字列
- `frontend/src/components/TyphoonLayer.tsx`：
  - 過去路徑實線＋點；預測路徑虛線＋點＋70% 潛勢圓（淡色外框）
  - 目前位置（`past` 最後一點）以放大的紅點標示，並畫七級風暴風圈
  - 點擊路徑點開 MapLibre `Popup`（每次點擊建新的 Popup，沿用同一個會被自己的 closeOnClick 立刻關掉）；颱風圖層下點地圖不選鄉鎮（`MapView` 依圖層略過）
  - 切入圖層、資料到齊後 `fitBounds(typhoonBounds(list))` 一次
  - 離開圖層時移除所有 source／layer／popup
- `frontend/src/components/TyphoonCard.tsx`：僅颱風圖層顯示；每個颱風一列：名稱（中／英）、觀測時間、中心氣壓、最大風速／陣風、移向移速、七級風半徑。颱風圖層時取代 `LocationCard`（同一個 `.card` 位置，`LocationCard` 不顯示）。

## 6. 錯誤處理

沿用 `ensureFresh`：CWA 失敗時回傳 SQLite 舊資料並標示 stale（`StatusBadge` 顯示）。從未成功抓取時回傳空陣列（`stale: true`），資訊卡顯示無颱風、`StatusBadge` 顯示資料可能非最新。

## 7. 測試

- `server/cwa/parse.test.ts`：fixture 解析 — 颱風數、名稱、過去／預測點數、字串轉數字、象限半徑取最大、預測點 `time` 計算
- `server/sync.test.ts`：整批替換；0 個颱風時清空
- `frontend/src/lib/typhoon.test.ts`：`circlePolygon` 半徑正確（抽點量距離）、`typhoonBounds` 包含台灣與所有點、`toGeoJSON` 要素組成、`fixLines` 文字
- 手動：本機開啟頁面切到颱風圖層，截圖確認舒力基路徑、暴風圈、popup、資訊卡

## 8. 不做

- 時間軸與颱風位置連動
- 颱風警報文字（`W-C0034-001`）
- 歷史颱風（API 僅提供活動中者）
