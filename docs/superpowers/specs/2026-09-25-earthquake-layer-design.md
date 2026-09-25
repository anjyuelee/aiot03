# 地震圖層設計文件

- 日期：2026-09-25
- 目標：在既有天氣地圖新增第十個互斥圖層「地震」，畫出近期有感地震的震央，選取一筆時顯示各測站震度；另在任何圖層都能從左上角徽章得知一小時內剛發生的地震。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 圖層型態 | 第十個互斥圖層 `quake`，與溫度／風／雨量／濕度／雷達／衛星／颱風／特報／行政區並列 |
| 時間軸 | 停用（同雷達、颱風、特報），一律顯示 CWA 目前提供的近期報告 |
| 收錄範圍 | 顯著有感地震與小區域有感地震都收，依發震時間由新到舊合併 |
| 地圖 | 所有震央畫成圓點（大小依規模、顏色依最大震度）；選取的那筆震央改畫紅色星號，並把它的各測站依震度上色 |
| 預設選取 | 最新一筆 |
| 資訊卡 | 地震圖層時取代地點卡片：上方是選取地震的詳細資料與各縣市震度（可展開看測站），下方是近期地震清單，點了切換選取 |
| 點擊地圖 | 點震央切換選取；點其他地方不觸發縣市逐層選取（同颱風圖層） |
| 視角 | 選取改變時（含切入圖層的預設選取）`fitBounds` 到震央＋該筆所有測站 |
| 徽章 | 最新一筆地震發生在 60 分鐘內時，左上角在特報徽章之後顯示「地震 M4.2 臺南市楠西區 · 最大 4級」，點了切到地震圖層並選取最新一筆；已在地震圖層時不顯示 |
| 網址 | `?layer=quake` 可分享；選到哪一筆不寫進網址 |

## 2. 資料來源

CWA `E-A0015-001`（顯著有感地震報告）與 `E-A0016-001`（小區域有感地震報告），走既有 `datastore` API（`server/cwa/client.ts`），不帶參數。

實測結構（2026-09-25，兩者欄位相同；小區域報告沒有 `ShakemapImageURI`）：

```
records.Earthquake[]                  各回傳最新 16 筆，依發震時間由新到舊
  EarthquakeNo                        數字。顯著有感為編號（例：115064）；小區域一律 115000
  ReportContent, ReportColor, ReportImageURI, Web
  EarthquakeInfo
    OriginTime                        例：2026-09-22T05:16:13+08:00
    FocalDepth                        數字，km
    Epicenter.Location                例：臺南市政府東北東方  43.9  公里 (位於臺南市楠西區)
    Epicenter.EpicenterLatitude, EpicenterLongitude   數字
    EarthquakeMagnitude.MagnitudeValue                數字，芮氏規模
  Intensity.ShakingArea[]
    AreaDesc, CountyName, AreaIntensity, InfoStatus?
    EqStation[]?                      StationID, StationName, SeismicIntensity,
                                      StationLatitude, StationLongitude, InfoStatus?, pga, pgv, …
```

實測觀察：

- 兩個資料集各 16 筆：顯著有感涵蓋 7/8～9/22、小區域涵蓋 9/3～9/25。合併後 9/3 以前只會有顯著有感地震，照實顯示，不另外截斷時間範圍。
- `ShakingArea` 有兩種項目：`AreaDesc` 為「臺南市地區」的逐縣市項目（`CountyName` 單一縣市、有 `EqStation`），與「最大震度N級地區」的摘要項目（`CountyName` 以「、」串接多縣市、沒有 `EqStation`）。兩批資料中「摘要項目」與「沒有測站的項目」完全一致（80 筆），摘要與逐縣市項目重複，只取有測站的項目。
- 震度字串實測只出現 `1級`～`4級`；CWA 震度分級另有 `0級`、`5弱`、`5強`、`6弱`、`6強`、`7級`，前端須能排序。
- 約 5% 測站沒有 `InfoStatus`，其餘欄位齊全，不使用這個欄位。
- 小區域報告的 `EarthquakeNo` 全為 115000，不能當唯一鍵，改以 `OriginTime` 當 id。
- 修剪欄位後 32 筆、981 個測站的 API 回應約 85 KB，gzip 後約 8 KB。

不採用：`E-A0015-002`（英文版）、海嘯資訊、報告圖與 shakemap 圖片（只放 CWA 報告網頁連結）。

### 2.1 fixture

由 2026-09-25 的實際回應裁出：

- `server/__fixtures__/E-A0015-001.json`：2 筆。115064（臺南市楠西區，保留 3 個逐縣市項目，其中嘉義縣含缺 `InfoStatus` 的民雄站，加上 3 個摘要項目）、115063（位於臺灣東南部海域，保留 2 個逐縣市項目）。每個縣市最多 3 個測站，並去掉 `pga`、`pgv`、`WaveImageURI`。
- `server/__fixtures__/E-A0016-001.json`：2 筆（新竹市香山區、嘉義市東區），裁法同上。

無效時間、沒有括號的地名、空的 `records.Earthquake` 等情況，在測試內複製 fixture 後修改欄位建構，不另存檔案。

## 3. 共用型別（`shared/types.ts`）

```ts
export interface QuakeStation {
  /** StationID，例：SNS */
  id: string
  name: string
  lat: number
  lon: number
  /** 原字串，例：4級、5弱 */
  intensity: string
}

export interface QuakeCounty {
  county: string
  /** 該縣市最大震度，原字串 */
  intensity: string
  /** CWA 原順序 */
  stations: QuakeStation[]
}

export interface Earthquake {
  /** OriginTime（+08:00 ISO）；小區域報告的 EarthquakeNo 都是 115000，無法當 id */
  id: string
  /** 顯著有感地震編號（例：115064）；小區域為 null */
  no: number | null
  /** 發震時間，+08:00 ISO */
  time: string
  lat: number
  lon: number
  /** 震源深度 km */
  depth: number
  /** 芮氏規模 */
  magnitude: number
  /** 括號內「位於…」的地名，例：臺南市楠西區、臺灣東部海域；沒有括號時為整串（連續空白壓成一個） */
  location: string
  /** 逐縣市項目，CWA 原順序；不含「最大震度N級地區」摘要 */
  counties: QuakeCounty[]
  /** CWA 報告網頁 */
  web: string
}
```

後端只精簡欄位，不排序、不比較震度；震度排序與色階都在前端純函式（同特報圖層嚴重度在前端判斷的分工）。

## 4. 後端

| 檔案 | 改動 |
|---|---|
| `server/cwa/parse.ts` | `parseEarthquakes(json, numbered: boolean): Earthquake[]`。顯著有感傳 `true` 保留 `no`，小區域傳 `false` 設為 `null`。時間用既有 `toTaipeiIso`；時間、震央經緯度、規模、深度任一無效時跳過該筆。只取有 `EqStation` 的 `ShakingArea`；測站經緯度無效時跳過該測站。地名以 `/\(位於(.+?)\)/` 取出。`records.Earthquake` 缺或為空時回傳 `[]` |
| `server/db.ts` | `CREATE TABLE IF NOT EXISTS earthquakes (id TEXT PRIMARY KEY, json TEXT)` |
| `server/repo.ts` | `replaceEarthquakes(db, list)`（交易內先清空再寫入，`INSERT OR REPLACE`，同 id 後者覆蓋）、`listEarthquakes(db)`（`ORDER BY id DESC`；id 皆為 +08:00 ISO，字串序即時間序） |
| `server/sync.ts` | `syncEarthquakes(db, f = cwa)`：`Promise.all` 抓兩個資料集；任一個的 `records.Earthquake` 缺少或為空陣列即拋錯（CWA 固定回傳最新 16 筆，空清單視為異常回應；整批不寫入，兩者永遠同一版）；合併後 `replaceEarthquakes` → `logFetch(db, 'earthquakes')` |
| `server/freshness.ts` | `TTL.earthquakes = 5 * MIN`（徽章只看 60 分鐘內，資料要夠新） |
| `server/service.ts` | `getEarthquakes(): Promise<ApiResponse<Earthquake[]>>` |
| `api/earthquakes.ts` | `GET`，回傳 `getEarthquakes()`（永遠有值，無 503 分支） |
| `scripts/build-db.ts` | 加 `earthquakes` 步驟與筆數輸出 |

路徑為巢狀結構且一律整批讀寫，比照 `typhoons` 存 JSON。

## 5. 前端

### 5.1 註冊與資料

- `frontend/src/lib/layers.ts`：`LayerId` 加 `'quake'`，`LAYERS.quake = { label: '地震', icon: '🫨' }`（無 `now`/`future`，時間軸自動停用、`setLayer` 會把 `t` 歸零）。`LAYER_IDS` 中排在 `warning` 之後、`admin` 之前。
- `frontend/src/api.ts`：`useEarthquakes()`，不帶 `enabled`（徽章在每個圖層都要用），`refetchInterval: FIVE_MIN`。
- `frontend/src/store.ts`：加 `quake: string | null`（`null` 表示最新一筆，不寫網址）與 `selectQuake(id | null)`。選取的地震一律以 `list.find(q => q.id === quake) ?? list[0]` 取得，已從清單消失的 id 自動退回最新一筆。

### 5.2 純函式（`frontend/src/lib/quakes.ts`）

- `intensityRank(s)`：依 `0級、1級、2級、3級、4級、5弱、5強、6弱、6強、7級` 回傳 0～9，無法辨識為 -1。
- `intensityColor(s)`：`1級 #b2f2bb`、`2級 #51cf66`、`3級 #fcc419`、`4級 #ff922b`、`5弱 #f76707`、`5強 #e03131`、`6弱 #c2255c`、`6強 #9c36b5`、`7級 #5f3dc4`，`0級` 與無法辨識 `#868e96`。色系參照 CWA 震度圖（綠→黃→橙→紅→紫），色碼用特報圖層同一套 Open Color。
- `INTENSITY_LEGEND`：`1級`～`7級` 九個等級與顏色，給卡片圖例用。
- `maxIntensity(q): string | null`：各縣市 `intensity` 中 rank 最高者；沒有縣市時為 `null`。
- `fmtQuakeTime(iso)`：`M/D HH:mm`，直接取字元（CWA 時間固定 +08:00，同 `format.ts` 的做法）。
- `quakeBadge(list, now): string | null`：`list[0]` 的發震時間距 `now` 在 60 分鐘內（含）時回傳 `地震 M${magnitude} ${location} · 最大 ${max}`，沒有震度時省略「 · 最大 …」；否則或空清單回傳 `null`。
- `quakeBounds(q): Bounds`：震央與所有測站的外框。
- `toGeoJSON(list, selectedId)`：震央點（`role: 'epicenter'`，屬性含 `id`、`magnitude`、`color`＝最大震度色、`selected`）與選取地震的測站點（`role: 'station'`，屬性含 `color`）。

### 5.3 地圖（`frontend/src/components/QuakeLayer.tsx`）

掛在 `DataLayers`（`layer === 'quake' && data` 時），寫法同 `TyphoonLayer`。一個 GeoJSON source，三個圖層都插在 `dataLayerBefore(map)` 之前，由下到上：

| 圖層 | 內容 | 樣式 |
|---|---|---|
| `quake-stations` | 選取地震的測站 | `circle-radius` 5、依 `color` 上色、邊框為底圖 ink 色 0.5px |
| `quake-epicenters` | 未選取的震央 | `circle-radius` 依規模線性內插：M2 → 4px、M6 → 16px（範圍外夾住）；依 `color` 上色；`circle-opacity` 0.5；邊框 ink 色 1px |
| `quake-selected` | 選取的震央 | `symbol`，紅色（`#fa5252`）白邊五角星，以 canvas 畫成約 24px 後 `map.addImage`，`icon-allow-overlap` |

- 點 `quake-epicenters` 的點 → `selectQuake(id)`；滑過時游標變手指。
- 選取的地震 id 改變時（含切入圖層、清單更新使最新一筆換人）`fitBounds(quakeBounds(q), { padding: cardFitPadding(), maxZoom: 9 })`；同一筆重新取得資料不再縮放。
- 資料或選取改變時只 `setData`，不重建圖層；底圖 ink 色改變時重建（同 `TyphoonLayer`）。離開圖層時移除圖層、source 與圖片。
- `frontend/src/map/helpers.ts`：把 `TyphoonLayer.tsx` 內的 `fitPadding` 移出為 `cardFitPadding()` 共用（左側避開桌機卡片、手機避開底部抽屜），`TyphoonLayer` 改為引用它。
- `frontend/src/components/MapView.tsx`：地圖 click 在 `typhoon` 或 `quake` 圖層時都直接 return；初次載入的鄉鎮 `flyTo` 與 GPS 定位 `flyTo` 在這兩個圖層都略過，以免蓋掉 `fitBounds`。

### 5.4 資訊卡（`frontend/src/components/QuakeCard.tsx`）

地震圖層時取代 `LocationCard`（`App.tsx` 依圖層切換）。標題「🫨 有感地震」，下分三塊：

1. **選取的地震**：`M4.2 臺南市楠西區` 為小標題；下方依序為 `fmtQuakeTime`、`深度 7.5 km`、「第 115064 號」或「小區域有感地震」、「CWA 報告 ↗」（`web`，新分頁開啟）。
2. **各地震度**：每個縣市一個 `<details>`，`summary` 為色點＋縣市名＋震度；展開後每個測站一列（名稱、震度）。下方一條 `INTENSITY_LEGEND` 色階圖例。
3. **近期地震**：每筆一列按鈕（最大震度色點、`M4.2`、地名、`fmtQuakeTime`），選取中者反白；點了 `selectQuake(id)` 並把卡片捲回頂端。

載入中顯示 skeleton、失敗顯示「無法載入地震資料，請稍後再試。」、空清單顯示「近期無有感地震資料」。

### 5.5 徽章與狀態

- `frontend/src/components/QuakeBadge.tsx`：放在 `.top-left` 內 `WarningBadge` 之後；`quakeBadge(list, Date.now())` 為 `null` 或目前已是地震圖層時不渲染；為 `button`，點擊 `setLayer('quake')` 並 `selectQuake(null)`。60 分鐘的判斷在每次 refetch（5 分鐘）重新渲染時重算，徽章最多晚 5 分鐘消失，不另加計時器。
- `frontend/src/components/StatusBadge.tsx`：地震圖層時以 `useEarthquakes()` 的結果顯示「更新於」與 stale 狀態（同颱風、特報）。
- `frontend/src/styles.css`：
  - `.badge.alert.quake { background: #e8590c; }` 與其 hover 色，和特報的紅色徽章區分。
  - 兩顆徽章同時出現時桌面版卡片再下移一列：`.top-left:has(.badge.alert ~ .badge.alert) ~ .card { top: 218px; max-height: calc(100% - 328px); }`（現有單顆為 184px／294px，每顆 34px）。
  - `.quake-*` 卡片樣式（詳細資料、縣市 details、清單列反白、圖例）。

## 6. 錯誤處理

沿用 `ensureFresh`：CWA 失敗時回傳 SQLite 舊資料並標示 stale（`StatusBadge` 顯示「資料可能非最新」）。從未成功抓取時回傳空陣列（`stale: true`），資訊卡顯示「近期無有感地震資料」、徽章不顯示。兩個資料集任一失敗或回傳空清單時整批不寫入。單筆報告欄位無效只跳過該筆；測站經緯度無效只跳過該測站。

## 7. 測試

- `server/cwa/parse.test.ts`：fixture 解析 — 筆數；顯著有感保留 `no`、小區域為 `null`；地名從括號取出、無括號時取整串；摘要項目不進 `counties`；缺 `InfoStatus` 的測站保留；時間無效的報告跳過；`records.Earthquake` 為空回傳 `[]`
- `server/repo.test.ts`：`replaceEarthquakes` 後 `listEarthquakes` 依時間新到舊、欄位完整還原；再次替換會清掉舊資料；同一發震時間只留一筆
- `server/sync.test.ts`：兩個資料集合併寫入並記錄 `fetch_log`；任一缺 `records.Earthquake` 或為空陣列時拋錯且舊資料保留
- `frontend/src/lib/quakes.test.ts`：`intensityRank` 順序（`4級 < 5弱 < 5強 < 6弱`）與未知字串；`intensityColor` 未知字串退回灰色；`maxIntensity` 取最大、無縣市為 `null`；`quakeBadge` 59 分鐘顯示、61 分鐘不顯示、空清單、無震度時的文字；`quakeBounds`；`fmtQuakeTime`；`toGeoJSON` 只輸出選取地震的測站
- 手動：本機 `?layer=quake` 確認星號與測站著色、清單與震央點擊切換、`fitBounds`、`<details>` 展開、地震圖層點地圖不觸發縣市選取、淺色底圖的 ink 色；暫時放寬徽章時間窗與強制顯示特報徽章（不 commit）確認兩顆徽章並列時卡片位置；README 補功能說明、架構圖資料集、TTL 表、API 表與截圖 `docs/screenshots/quake.png`

## 8. 不做

- 點測站的 popup
- 網址同步選取的地震
- 海嘯資訊、英文版報告（`E-A0015-002`）
- 報告圖、shakemap 圖片嵌入卡片（只放連結）
- 推播或通知
