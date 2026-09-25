# 地震圖層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第十個互斥圖層「地震」，合併 CWA 顯著有感（`E-A0015-001`）與小區域有感（`E-A0016-001`）地震報告，地圖畫出近期震央、選取一筆時依震度為各測站上色，資訊卡列出各縣市震度與近期清單，並在任何圖層以徽章提示一小時內的地震。

**Architecture:** 後端沿用 `ensureFresh → sync → repo → SQLite` 管線，新增 `earthquakes` 表（每筆地震一列、巢狀資料存 JSON）與 `/api/earthquakes`。前端純函式（`lib/quakes.ts`）負責震度排序、色階、徽章文字、外框與 GeoJSON；`QuakeLayer` 畫震央、星號與測站，`QuakeCard` 佔用既有 `.card` 位置，`QuakeBadge` 常駐左上角、排在特報徽章之後。

**Tech Stack:** TypeScript、better-sqlite3、Vitest、React 19、MapLibre GL 6、TanStack Query、Zustand。

**Spec:** `docs/superpowers/specs/2026-09-25-earthquake-layer-design.md`

## Global Constraints

- 本計畫的程式碼已在 repo 副本中實際跑過：`npm test`（118 個測試）、`npm run typecheck`、`vite build` 全過，並以 2026-09-25 的 CWA 即時資料確認後端解析 32 筆、981 個測站。照抄即可，不要「順手改善」。
- 不新增任何相依套件。
- 程式碼註解用繁體中文，風格同既有檔案（短、說明「為什麼」）。
- CWA 時間一律是 `+08:00` ISO 字串；前端格式化直接取字元（同 `lib/format.ts`），不經 `Date` 轉時區。
- 資料集：`E-A0015-001` 顯著有感（保留編號）、`E-A0016-001` 小區域有感（編號一律 `115000`，存 `null`）。
- `TTL.earthquakes = 5 * MIN`；前端 `refetchInterval: FIVE_MIN`；徽章時間窗 60 分鐘（含）。
- 震度色碼：`1級 #b2f2bb`、`2級 #51cf66`、`3級 #fcc419`、`4級 #ff922b`、`5弱 #f76707`、`5強 #e03131`、`6弱 #c2255c`、`6強 #9c36b5`、`7級 #5f3dc4`，`0級` 與無法辨識 `#868e96`。
- 圖層 id `quake`、標籤「地震」、icon `🫨`；`LAYER_IDS` 中排在 `warning` 之後、`admin` 之前。
- Commit 訊息：英文 subject＋中英雙語 body，不加 trailer（repo 既有慣例）。每個 Task 最後一步附完整訊息，用 `git commit -F -` 搭配 heredoc 提交。
- 測試指令：`npm test`（Vitest 一次跑完 server 與 frontend）、`npm run typecheck`。單檔可用 `npx vitest run <path>`。
- 本機看畫面：`npm run dev` → `http://localhost:5173`（需要 `.env` 的 `CWA_API_KEY`）。**MapLibre 只在前景分頁渲染**：背景分頁（例如自動化工具開在另一個視窗的分頁）不觸發 `requestAnimationFrame`，地圖會是全黑且 `map.loaded()` 一直是 `false`，這不是程式錯誤。

## Review Focus

1. 停在地震圖層時切換底圖（深色 → 淺色 → 衛星）：`setStyle` 會清掉所有圖層與 `addImage` 的圖片，星號、測站與震央要重新出現，淺色底圖上邊框改為深色 ink — Task 5 手動步驟 6。
2. 兩個資料集回傳同一個發震時間：只留一筆，清單不重複 — Task 2 repo 測試 `keeps one row when both datasets report the same origin time`。
3. 選取中的地震在 refetch 後被新資料擠出清單：退回最新一筆，地圖跟著縮放 — Task 3 `pickQuake` 測試；Task 5 的縮放以 `selectedId` 為依賴。
4. 在地震圖層點地圖空白處，或帶 `?layer=quake&town=…` 進入、GPS 定位晚到：不觸發縣市逐層選取、不被 `flyTo` 蓋掉 `fitBounds` — Task 5 手動步驟 4、5。
5. 特報與地震徽章同時出現：桌機卡片下移兩列不被徽章蓋住 — Task 6 手動步驟 5。

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `shared/types.ts` | 修改 | `QuakeStation`、`QuakeCounty`、`Earthquake` 型別 |
| `server/__fixtures__/E-A0015-001.json` | 新增 | 顯著有感 fixture（2 筆，由實際回應裁出） |
| `server/__fixtures__/E-A0016-001.json` | 新增 | 小區域有感 fixture（2 筆，由實際回應裁出） |
| `server/cwa/parse.ts` | 修改 | `parseEarthquakes` |
| `server/cwa/parse.test.ts` | 修改 | 解析測試 |
| `server/db.ts` | 修改 | `earthquakes` 表 |
| `server/repo.ts` | 修改 | `replaceEarthquakes`、`listEarthquakes` |
| `server/repo.test.ts` | 修改 | repo 測試 |
| `server/sync.ts` | 修改 | `syncEarthquakes` |
| `server/sync.test.ts` | 修改 | 同步測試 |
| `server/freshness.ts` | 修改 | `TTL.earthquakes` |
| `server/service.ts` | 修改 | `getEarthquakes` |
| `api/earthquakes.ts` | 新增 | `GET /api/earthquakes` |
| `scripts/build-db.ts` | 修改 | 種子 DB 一併抓地震 |
| `frontend/src/lib/quakes.ts` | 新增 | 純函式：震度排序／色階、`maxIntensity`、`fmtQuakeTime`、`pickQuake`、`quakeBadge`、`quakeBounds`、`toGeoJSON` |
| `frontend/src/lib/quakes.test.ts` | 新增 | 純函式測試 |
| `frontend/src/lib/layers.ts` | 修改 | `quake` 圖層 |
| `frontend/src/lib/lib.test.ts` | 修改 | `?layer=quake` 網址解析 |
| `frontend/src/api.ts` | 修改 | `useEarthquakes` |
| `frontend/src/store.ts` | 修改 | `quake`、`selectQuake` |
| `frontend/src/components/StatusBadge.tsx` | 修改 | 地震圖層的更新時間 |
| `frontend/src/map/helpers.ts` | 修改 | `cardFitPadding`（自 `TyphoonLayer` 移出） |
| `frontend/src/components/TyphoonLayer.tsx` | 修改 | 改用 `cardFitPadding` |
| `frontend/src/components/QuakeLayer.tsx` | 新增 | 震央、星號、測站 |
| `frontend/src/components/MapView.tsx` | 修改 | 地震圖層不觸發縣市選取、不被 `flyTo` 蓋掉 |
| `frontend/src/components/DataLayers.tsx` | 修改 | 掛上 `QuakeLayer` |
| `frontend/src/components/QuakeCard.tsx` | 新增 | 資訊卡 |
| `frontend/src/components/QuakeBadge.tsx` | 新增 | 左上角徽章 |
| `frontend/src/App.tsx` | 修改 | 地震圖層顯示 `QuakeCard`；掛上 `QuakeBadge` |
| `frontend/src/styles.css` | 修改 | 徽章、資訊卡樣式、兩顆徽章時卡片位置 |
| `README.md` | 修改 | 功能、截圖、架構圖、TTL 表、API 表 |
| `docs/screenshots/quake.png` | 新增 | README 截圖 |

---

### Task 1：型別、fixture 與解析

**Files:**
- Modify: `shared/types.ts`（檔尾）
- Create: `server/__fixtures__/E-A0015-001.json`、`server/__fixtures__/E-A0016-001.json`
- Modify: `server/cwa/parse.ts`
- Test: `server/cwa/parse.test.ts`

**Interfaces:**
- Consumes: 既有 `num(v)`（CWA 缺值 → `null`）、`toTaipeiIso(s)`（→ `+08:00` ISO 或 `null`）
- Produces: `QuakeStation`、`QuakeCounty`、`Earthquake` 型別；`parseEarthquakes(json: any, numbered: boolean): Earthquake[]`

- [ ] **Step 1：新增型別**

在 `shared/types.ts` 檔尾加：

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

- [ ] **Step 2：新增 fixture**

由 2026-09-25 的 CWA 實際回應裁出（見 spec §2.1）：只留指定縣市與測站、去掉 `pga`、`pgv`、`WaveImageURI`，「最大震度N級地區」摘要項目原樣保留。嘉義縣的「民雄」站在原始資料就沒有 `InfoStatus`。

`server/__fixtures__/E-A0015-001.json`：

```json
{
  "success": "true",
  "result": {
    "resource_id": "E-A0015-001"
  },
  "records": {
    "datasetDescription": "地震報告",
    "Earthquake": [
      {
        "IssueTime": "2026-09-22T05:19:16+08:00",
        "ValidTime": {
          "EndTime": "2026-09-22T13:19:16+08:00"
        },
        "EarthquakeNo": 115064,
        "ReportType": "地震報告",
        "ReportColor": "綠色",
        "ReportContent": "09/22-05:16臺南市楠西區發生規模4.2有感地震，最大震度臺南市曾文4級。",
        "ReportImageURI": "https://scweb.cwa.gov.tw/webdata/OLDEQ/202609/2026092205161342064_H.png",
        "ReportRemark": "本報告係中央氣象署地震觀測網即時地震資料地震速報之結果。",
        "Web": "https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026064",
        "ShakemapImageURI": "https://scweb.cwa.gov.tw/webdata/drawTrace/plotContour/2026/2026064i.png",
        "EarthquakeInfo": {
          "OriginTime": "2026-09-22T05:16:13+08:00",
          "Source": "中央氣象署",
          "FocalDepth": 7.5,
          "Epicenter": {
            "Location": "臺南市政府東北東方  43.9  公里 (位於臺南市楠西區)",
            "EpicenterLatitude": 23.21,
            "EpicenterLongitude": 120.54
          },
          "EarthquakeMagnitude": {
            "MagnitudeType": "芮氏規模",
            "MagnitudeValue": 4.2
          }
        },
        "Intensity": {
          "ShakingArea": [
            {
              "AreaDesc": "臺南市地區",
              "CountyName": "臺南市",
              "InfoStatus": "observe",
              "AreaIntensity": "4級",
              "EqStation": [
                {
                  "StationName": "曾文",
                  "StationID": "SNS",
                  "InfoStatus": "observe",
                  "BackAzimuth": 102.22,
                  "EpicenterDistance": 4.79,
                  "SeismicIntensity": "4級",
                  "StationLatitude": 23.22,
                  "StationLongitude": 120.497
                },
                {
                  "StationName": "楠西",
                  "StationID": "CHN1",
                  "InfoStatus": "observe",
                  "BackAzimuth": 27.27,
                  "EpicenterDistance": 3.22,
                  "SeismicIntensity": "3級",
                  "StationLatitude": 23.185,
                  "StationLongitude": 120.529
                },
                {
                  "StationName": "白河",
                  "StationID": "C015",
                  "InfoStatus": "observe",
                  "BackAzimuth": 140.12,
                  "EpicenterDistance": 20.52,
                  "SeismicIntensity": "3級",
                  "StationLatitude": 23.353,
                  "StationLongitude": 120.414
                }
              ]
            },
            {
              "AreaDesc": "嘉義縣地區",
              "CountyName": "嘉義縣",
              "InfoStatus": "observe",
              "AreaIntensity": "3級",
              "EqStation": [
                {
                  "StationName": "大埔",
                  "StationID": "WTP",
                  "InfoStatus": "observe",
                  "BackAzimuth": 245.63,
                  "EpicenterDistance": 8.91,
                  "SeismicIntensity": "3級",
                  "StationLatitude": 23.244,
                  "StationLongitude": 120.622
                },
                {
                  "StationName": "番路",
                  "StationID": "WCKO",
                  "InfoStatus": "observe",
                  "BackAzimuth": 194.02,
                  "EpicenterDistance": 26.05,
                  "SeismicIntensity": "2級",
                  "StationLatitude": 23.439,
                  "StationLongitude": 120.605
                },
                {
                  "StationName": "民雄",
                  "StationID": "CHN2",
                  "BackAzimuth": 168.87,
                  "EpicenterDistance": 36.32,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 23.532,
                  "StationLongitude": 120.474
                }
              ]
            },
            {
              "AreaDesc": "高雄市地區",
              "CountyName": "高雄市",
              "InfoStatus": "observe",
              "AreaIntensity": "1級",
              "EqStation": [
                {
                  "StationName": "甲仙",
                  "StationID": "SGS",
                  "InfoStatus": "observe",
                  "BackAzimuth": 341.29,
                  "EpicenterDistance": 15.26,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 23.08,
                  "StationLongitude": 120.591
                },
                {
                  "StationName": "桃源",
                  "StationID": "STYH",
                  "InfoStatus": "observe",
                  "BackAzimuth": 278.1,
                  "EpicenterDistance": 24.62,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 23.179,
                  "StationLongitude": 120.781
                },
                {
                  "StationName": "六龜",
                  "StationID": "SLG",
                  "InfoStatus": "observe",
                  "BackAzimuth": 336.31,
                  "EpicenterDistance": 26.33,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 22.993,
                  "StationLongitude": 120.646
                }
              ]
            }
          ]
        }
      },
      {
        "IssueTime": "2026-09-14T06:49:45+08:00",
        "ValidTime": {
          "EndTime": "2026-09-14T14:49:45+08:00"
        },
        "EarthquakeNo": 115063,
        "ReportType": "地震報告",
        "ReportColor": "綠色",
        "ReportContent": "09/14-06:44臺灣東南部海域發生規模4.9有感地震，最大震度臺東縣綠島4級。",
        "ReportImageURI": "https://scweb.cwa.gov.tw/webdata/OLDEQ/202609/2026091406444149063_H.png",
        "ReportRemark": "本報告係中央氣象署地震觀測網即時地震資料地震速報之結果。",
        "Web": "https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026063",
        "ShakemapImageURI": "https://scweb.cwa.gov.tw/webdata/drawTrace/plotContour/2026/2026063i.png",
        "EarthquakeInfo": {
          "OriginTime": "2026-09-14T06:44:41+08:00",
          "Source": "中央氣象署",
          "FocalDepth": 10.1,
          "Epicenter": {
            "Location": "臺東縣政府東南東方  43.0  公里 (位於臺灣東南部海域)",
            "EpicenterLatitude": 22.63,
            "EpicenterLongitude": 121.55
          },
          "EarthquakeMagnitude": {
            "MagnitudeType": "芮氏規模",
            "MagnitudeValue": 4.9
          }
        },
        "Intensity": {
          "ShakingArea": [
            {
              "AreaDesc": "臺東縣地區",
              "CountyName": "臺東縣",
              "InfoStatus": "observe",
              "AreaIntensity": "4級",
              "EqStation": [
                {
                  "StationName": "綠島",
                  "StationID": "LDU",
                  "InfoStatus": "observe",
                  "BackAzimuth": 119.23,
                  "EpicenterDistance": 9.31,
                  "SeismicIntensity": "4級",
                  "StationLatitude": 22.673,
                  "StationLongitude": 121.469
                },
                {
                  "StationName": "東河",
                  "StationID": "EDH",
                  "InfoStatus": "observe",
                  "BackAzimuth": 146.38,
                  "EpicenterDistance": 45.31,
                  "SeismicIntensity": "4級",
                  "StationLatitude": 22.973,
                  "StationLongitude": 121.304
                },
                {
                  "StationName": "成功",
                  "StationID": "CHK",
                  "InfoStatus": "observe",
                  "BackAzimuth": 160.8,
                  "EpicenterDistance": 54.67,
                  "SeismicIntensity": "3級",
                  "StationLatitude": 23.098,
                  "StationLongitude": 121.373
                }
              ]
            },
            {
              "AreaDesc": "花蓮縣地區",
              "CountyName": "花蓮縣",
              "InfoStatus": "observe",
              "AreaIntensity": "3級",
              "EqStation": [
                {
                  "StationName": "富里",
                  "StationID": "FULB",
                  "InfoStatus": "observe",
                  "BackAzimuth": 157.45,
                  "EpicenterDistance": 68.04,
                  "SeismicIntensity": "3級",
                  "StationLatitude": 23.199,
                  "StationLongitude": 121.294
                },
                {
                  "StationName": "萬榮",
                  "StationID": "EHYH",
                  "InfoStatus": "observe",
                  "BackAzimuth": 167.71,
                  "EpicenterDistance": 97.82,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 23.494,
                  "StationLongitude": 121.345
                },
                {
                  "StationName": "水璉",
                  "StationID": "SHUL",
                  "InfoStatus": "observe",
                  "BackAzimuth": 180.66,
                  "EpicenterDistance": 128.16,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 23.788,
                  "StationLongitude": 121.563
                }
              ]
            }
          ]
        }
      }
    ]
  }
}
```

`server/__fixtures__/E-A0016-001.json`：

```json
{
  "success": "true",
  "result": {
    "resource_id": "E-A0016-001"
  },
  "records": {
    "datasetDescription": "地震報告",
    "Earthquake": [
      {
        "IssueTime": "2026-09-25T01:15:34+08:00",
        "ValidTime": {
          "EndTime": "2026-09-25T09:15:34+08:00"
        },
        "EarthquakeNo": 115000,
        "ReportType": "地震報告",
        "ReportColor": "綠色",
        "ReportContent": "09/25-01:01新竹市香山區發生規模2.6有感地震，最大震度苗栗縣竹南、新竹縣竹東1級。",
        "ReportImageURI": "https://scweb.cwa.gov.tw/webdata/OLDEQ/202609/2026092501012326_H.png",
        "ReportRemark": "本報告係中央氣象署地震觀測網即時地震資料地震速報之結果。",
        "Web": "https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026092501012326",
        "EarthquakeInfo": {
          "OriginTime": "2026-09-25T01:01:23+08:00",
          "Source": "中央氣象署",
          "FocalDepth": 5.7,
          "Epicenter": {
            "Location": "新竹市政府南南西方  7.6  公里 (位於新竹市香山區)",
            "EpicenterLatitude": 24.75,
            "EpicenterLongitude": 120.94
          },
          "EarthquakeMagnitude": {
            "MagnitudeType": "芮氏規模",
            "MagnitudeValue": 2.6
          }
        },
        "Intensity": {
          "ShakingArea": [
            {
              "AreaDesc": "苗栗縣地區",
              "CountyName": "苗栗縣",
              "InfoStatus": "observe",
              "AreaIntensity": "1級",
              "EqStation": [
                {
                  "StationName": "竹南",
                  "StationID": "NJN",
                  "InfoStatus": "observe",
                  "BackAzimuth": 44.72,
                  "EpicenterDistance": 9.59,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 24.684,
                  "StationLongitude": 120.87
                }
              ]
            },
            {
              "AreaDesc": "新竹縣地區",
              "CountyName": "新竹縣",
              "InfoStatus": "observe",
              "AreaIntensity": "1級",
              "EqStation": [
                {
                  "StationName": "竹東",
                  "StationID": "NJD",
                  "InfoStatus": "observe",
                  "BackAzimuth": 273.86,
                  "EpicenterDistance": 15.32,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 24.736,
                  "StationLongitude": 121.088
                }
              ]
            }
          ]
        }
      },
      {
        "IssueTime": "2026-09-24T05:59:35+08:00",
        "ValidTime": {
          "EndTime": "2026-09-24T13:59:35+08:00"
        },
        "EarthquakeNo": 115000,
        "ReportType": "地震報告",
        "ReportColor": "綠色",
        "ReportContent": "09/24-05:57嘉義市東區發生規模3.4有感地震，最大震度嘉義市3級。",
        "ReportImageURI": "https://scweb.cwa.gov.tw/webdata/OLDEQ/202609/2026092405570534_H.png",
        "ReportRemark": "本報告係中央氣象署地震觀測網即時地震資料地震速報之結果。",
        "Web": "https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026092405570534",
        "EarthquakeInfo": {
          "OriginTime": "2026-09-24T05:57:05+08:00",
          "Source": "中央氣象署",
          "FocalDepth": 7.3,
          "Epicenter": {
            "Location": "嘉義市政府北方  2.1  公里 (位於嘉義市東區)",
            "EpicenterLatitude": 23.5,
            "EpicenterLongitude": 120.46
          },
          "EarthquakeMagnitude": {
            "MagnitudeType": "芮氏規模",
            "MagnitudeValue": 3.4
          }
        },
        "Intensity": {
          "ShakingArea": [
            {
              "AreaDesc": "嘉義市地區",
              "CountyName": "嘉義市",
              "InfoStatus": "observe",
              "AreaIntensity": "3級",
              "EqStation": [
                {
                  "StationName": "嘉義市",
                  "StationID": "CHY",
                  "InfoStatus": "observe",
                  "BackAzimuth": 82.02,
                  "EpicenterDistance": 2.56,
                  "SeismicIntensity": "3級",
                  "StationLatitude": 23.496,
                  "StationLongitude": 120.433
                }
              ]
            },
            {
              "AreaDesc": "嘉義縣地區",
              "CountyName": "嘉義縣",
              "InfoStatus": "observe",
              "AreaIntensity": "2級",
              "EqStation": [
                {
                  "StationName": "太保市",
                  "StationID": "CHY1",
                  "InfoStatus": "observe",
                  "BackAzimuth": 74.24,
                  "EpicenterDistance": 17.36,
                  "SeismicIntensity": "2級",
                  "StationLatitude": 23.457,
                  "StationLongitude": 120.294
                },
                {
                  "StationName": "義竹",
                  "StationID": "CHN8",
                  "InfoStatus": "observe",
                  "BackAzimuth": 54.86,
                  "EpicenterDistance": 29.34,
                  "SeismicIntensity": "2級",
                  "StationLatitude": 23.347,
                  "StationLongitude": 120.223
                },
                {
                  "StationName": "民雄",
                  "StationID": "CHN2",
                  "BackAzimuth": 205.65,
                  "EpicenterDistance": 3.99,
                  "SeismicIntensity": "1級",
                  "StationLatitude": 23.532,
                  "StationLongitude": 120.474
                }
              ]
            }
          ]
        }
      }
    ]
  }
}
```

- [ ] **Step 3：寫解析測試（先失敗）**

`server/cwa/parse.test.ts` 的 import 改成：

```ts
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseTyphoons, parseWarnings, parseEarthquakes,
} from './parse.js'
```

檔尾加：

```ts
describe('parseEarthquakes', () => {
  const significant = parseEarthquakes(fixture('E-A0015-001.json'), true)
  const local = parseEarthquakes(fixture('E-A0016-001.json'), false)

  it('keeps report numbers only for significant quakes', () => {
    expect(significant.map(q => q.no)).toEqual([115064, 115063])
    expect(local.map(q => q.no)).toEqual([null, null])
  })

  it('maps the epicentre, time and short location', () => {
    expect(significant[0]).toMatchObject({
      id: '2026-09-22T05:16:13+08:00', time: '2026-09-22T05:16:13+08:00',
      lat: 23.21, lon: 120.54, depth: 7.5, magnitude: 4.2, location: '臺南市楠西區',
      web: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026064',
    })
    expect(significant[1].location).toBe('臺灣東南部海域')
    expect(local.map(q => q.location)).toEqual(['新竹市香山區', '嘉義市東區'])
  })

  it('keeps per-county areas with their stations and skips the summary areas', () => {
    expect(significant[0].counties.map(c => `${c.county} ${c.intensity}`)).toEqual(['臺南市 4級', '嘉義縣 3級', '高雄市 1級'])
    expect(significant[0].counties[0].stations[0]).toEqual({ id: 'SNS', name: '曾文', lat: 23.22, lon: 120.497, intensity: '4級' })
    // 民雄站沒有 InfoStatus，照樣保留
    expect(significant[0].counties[1].stations.map(s => s.name)).toEqual(['大埔', '番路', '民雄'])
  })

  it('falls back to the whole location text and skips unusable reports and stations', () => {
    const json = fixture('E-A0015-001.json')
    const [a, b] = json.records.Earthquake
    a.EarthquakeInfo.Epicenter.Location = '臺灣東部海域   外海'
    a.Intensity.ShakingArea[0].EqStation[0].StationLatitude = ''
    b.EarthquakeInfo.OriginTime = ''
    const list = parseEarthquakes(json, true)
    expect(list).toHaveLength(1)
    expect(list[0].location).toBe('臺灣東部海域 外海')
    expect(list[0].counties[0].stations.map(s => s.name)).toEqual(['楠西', '白河'])
  })

  it('returns an empty list without reports', () => {
    expect(parseEarthquakes({ records: {} }, true)).toEqual([])
    expect(parseEarthquakes({ records: { Earthquake: [] } }, false)).toEqual([])
  })
})
```

- [ ] **Step 4：跑測試確認失敗**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: FAIL，`parseEarthquakes` 不是 export（`is not a function` 或 import 錯誤）。

- [ ] **Step 5：實作解析**

`server/cwa/parse.ts` 第 2 行的型別 import 改成：

```ts
import type {
  Bounds, Earthquake, ForecastSlot, ImageKind, ImageOverlay, QuakeCounty, QuakeStation, Town, Typhoon, TyphoonFix, Warning, WeekSlot,
} from '../../shared/types.js'
```

檔尾加：

```ts
function quakeStation(s: any): QuakeStation | null {
  const lat = num(s.StationLatitude)
  const lon = num(s.StationLongitude)
  if (lat == null || lon == null) return null
  return { id: s.StationID, name: s.StationName, lat, lon, intensity: s.SeismicIntensity }
}

const isStation = (s: QuakeStation | null): s is QuakeStation => s != null

/** 「最大震度N級地區」摘要沒有測站、內容與逐縣市項目重複，只取有測站的項目 */
function quakeCounties(areas: any[] | undefined): QuakeCounty[] {
  return (areas ?? []).filter(a => a.EqStation?.length).map(a => ({
    county: a.CountyName,
    intensity: a.AreaIntensity,
    stations: a.EqStation.map(quakeStation).filter(isStation),
  }))
}

/** 取括號內「位於…」的地名；沒有括號時用整串 */
function quakeLocation(s: unknown): string {
  const text = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return /[(（]位於(.+?)[)）]/.exec(text)?.[1] ?? text
}

/** numbered：顯著有感報告才有編號，小區域報告一律 115000，不保留 */
export function parseEarthquakes(json: any, numbered: boolean): Earthquake[] {
  const out: Earthquake[] = []
  for (const q of json.records?.Earthquake ?? []) {
    const info = q.EarthquakeInfo
    const time = toTaipeiIso(info?.OriginTime)
    const lat = num(info?.Epicenter?.EpicenterLatitude)
    const lon = num(info?.Epicenter?.EpicenterLongitude)
    const depth = num(info?.FocalDepth)
    const magnitude = num(info?.EarthquakeMagnitude?.MagnitudeValue)
    if (!time || lat == null || lon == null || depth == null || magnitude == null) continue
    out.push({
      id: time,
      no: numbered ? num(q.EarthquakeNo) : null,
      time, lat, lon, depth, magnitude,
      location: quakeLocation(info.Epicenter.Location),
      counties: quakeCounties(q.Intensity?.ShakingArea),
      web: q.Web ?? '',
    })
  }
  return out
}
```

- [ ] **Step 6：跑測試確認通過**

Run: `npx vitest run server/cwa/parse.test.ts && npm run typecheck`
Expected: PASS（23 個測試），型別無錯。

- [ ] **Step 7：提交**

```bash
git add shared/types.ts server/__fixtures__/E-A0015-001.json server/__fixtures__/E-A0016-001.json server/cwa/parse.ts server/cwa/parse.test.ts
git commit -F - <<'EOF'
feat(api): parse felt earthquake reports

解析 CWA 顯著有感與小區域有感地震報告：保留震央、規模、深度、
括號內的短地名與逐縣市震度（含各測站）。小區域報告的編號一律
是 115000，不能當 id，改用發震時間；「最大震度N級地區」摘要與
逐縣市項目重複，只取有測站的項目。fixture 由當日實際回應裁出。

Parse CWA significant and local felt-earthquake reports into the
epicentre, magnitude, depth, a short place name and per-county
intensities with their stations. Local reports all carry number
115000, so the origin time is the id; the "max intensity N areas"
summaries duplicate the per-county entries, so only areas with
stations are kept. Fixtures are trimmed from today's responses.
EOF
```

---

### Task 2：儲存、同步、API

**Files:**
- Modify: `server/db.ts`、`server/repo.ts`、`server/sync.ts`、`server/freshness.ts`、`server/service.ts`、`scripts/build-db.ts`
- Create: `api/earthquakes.ts`
- Test: `server/repo.test.ts`、`server/sync.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Earthquake`、`parseEarthquakes`；既有 `ensureFresh`、`logFetch`、`Fetcher`
- Produces: `replaceEarthquakes(db, list: Earthquake[]): void`、`listEarthquakes(db): Earthquake[]`（新到舊）、`syncEarthquakes(db, f?): Promise<void>`、`getEarthquakes(): Promise<ApiResponse<Earthquake[]>>`、`GET /api/earthquakes` 回傳 `{ data: Earthquake[], updatedAt, stale }`

- [ ] **Step 1：寫 repo 測試（先失敗）**

`server/repo.test.ts` 的 import 改成：

```ts
import {
  replaceObservations, listObservations, replaceForecasts, listTowns, getTownForecast,
  listGridTimes, getGrid, upsertImage, getImage, logFetch, getFetchedAt,
  replaceSatelliteTiles, listSatelliteTiles, getSatelliteTile, replaceWarnings, listWarnings, replaceEarthquakes, listEarthquakes,
} from './repo.js'
import type { Bounds } from '../shared/types.js'
import {
  parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseWarnings, parseEarthquakes,
} from './cwa/parse.js'
```

檔尾加：

```ts
describe('earthquakes', () => {
  it('replaces the whole list and reads it back newest first', () => {
    const significant = parseEarthquakes(fixture('E-A0015-001.json'), true)
    const local = parseEarthquakes(fixture('E-A0016-001.json'), false)
    replaceEarthquakes(db, significant)
    replaceEarthquakes(db, [...significant, ...local])
    const rows = listEarthquakes(db)
    expect(rows.map(q => q.id)).toEqual([
      '2026-09-25T01:01:23+08:00', '2026-09-24T05:57:05+08:00', '2026-09-22T05:16:13+08:00', '2026-09-14T06:44:41+08:00',
    ])
    expect(rows[2]).toEqual(significant[0])
    replaceEarthquakes(db, local)
    expect(listEarthquakes(db).map(q => q.no)).toEqual([null, null])
  })

  it('keeps one row when both datasets report the same origin time', () => {
    const [q] = parseEarthquakes(fixture('E-A0015-001.json'), true)
    replaceEarthquakes(db, [q, { ...q, no: null }])
    expect(listEarthquakes(db)).toEqual([{ ...q, no: null }])
  })
})
```

- [ ] **Step 2：寫同步測試（先失敗）**

`server/sync.test.ts` 的兩行 import 改成：

```ts
import { syncObservations, syncForecast, syncImage, syncTyphoons, syncWarnings, syncEarthquakes } from './sync.js'
import {
  listObservations, listTowns, getTownForecast, getImage, getFetchedAt, listSatelliteTiles, listTyphoons, listWarnings, listEarthquakes,
} from './repo.js'
```

檔尾加：

```ts
describe('syncEarthquakes', () => {
  const withQuakes = (significant: unknown, local: unknown): Fetcher => ({
    async dataset(id) {
      if (id === 'E-A0015-001') return significant
      if (id === 'E-A0016-001') return local
      throw new Error(`unexpected dataset ${id}`)
    },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
  })

  it('merges both datasets newest first and logs the fetch', async () => {
    await syncEarthquakes(db, withQuakes(fixture('E-A0015-001.json'), fixture('E-A0016-001.json')))
    expect(listEarthquakes(db).map(q => q.no)).toEqual([null, null, 115064, 115063])
    expect(getFetchedAt(db, 'earthquakes')).not.toBeNull()
  })

  it('keeps the old list when either dataset comes back without reports', async () => {
    await syncEarthquakes(db, withQuakes(fixture('E-A0015-001.json'), fixture('E-A0016-001.json')))
    const fetchedAt = getFetchedAt(db, 'earthquakes')
    const none = { success: 'true', records: { Earthquake: [] } }
    await expect(syncEarthquakes(db, withQuakes(fixture('E-A0015-001.json'), none))).rejects.toThrow('no earthquake reports')
    await expect(syncEarthquakes(db, withQuakes({ success: 'true', records: {} }, fixture('E-A0016-001.json')))).rejects.toThrow('no earthquake reports')
    expect(listEarthquakes(db)).toHaveLength(4)
    expect(getFetchedAt(db, 'earthquakes')).toBe(fetchedAt)
  })
})
```

- [ ] **Step 3：跑測試確認失敗**

Run: `npx vitest run server/repo.test.ts server/sync.test.ts`
Expected: FAIL，`replaceEarthquakes`／`syncEarthquakes` 不是 export。

- [ ] **Step 4：資料表**

`server/db.ts` 的 `SCHEMA` 中，`CREATE TABLE IF NOT EXISTS fetch_log …` 那行之前加一行：

```sql
CREATE TABLE IF NOT EXISTS earthquakes (id TEXT PRIMARY KEY, json TEXT);
```

- [ ] **Step 5：repo**

`server/repo.ts` 第 2 行的型別 import 改成：

```ts
import type {
  Bounds, Earthquake, ForecastSlot, GridCell, ImageKind, ImageOverlay, Observation, Town, TownForecast, Typhoon, Warning, WeekSlot,
} from '../shared/types.js'
```

在 `export function logFetch(` 之前加：

```ts
// 震度資料為巢狀結構且一律整批讀寫，直接存 JSON；id 皆為 +08:00 ISO，字串序即時間序
export function replaceEarthquakes(db: DB, list: Earthquake[]): void {
  const insert = db.prepare('INSERT OR REPLACE INTO earthquakes (id, json) VALUES (?, ?)')
  db.transaction(() => {
    db.prepare('DELETE FROM earthquakes').run()
    for (const q of list) insert.run(q.id, JSON.stringify(q))
  })()
}

export function listEarthquakes(db: DB): Earthquake[] {
  return (db.prepare('SELECT json FROM earthquakes ORDER BY id DESC').all() as { json: string }[]).map(r => JSON.parse(r.json))
}

```

- [ ] **Step 6：同步**

`server/sync.ts` 的兩行 import 改成：

```ts
import {
  parseEarthquakes, parseForecast3h, parseForecastWeek, parseImage, parseRainStations, parseTyphoons, parseWarnings, parseWeatherStations,
} from './cwa/parse.js'
import {
  logFetch, replaceEarthquakes, replaceForecasts, replaceObservations, replaceSatelliteTiles, replaceTyphoons, replaceWarnings, upsertImage,
} from './repo.js'
```

檔尾加：

```ts
// 兩個資料集都固定回傳最新 16 筆；任一個沒有報告就視為異常回應，整批保留舊資料，兩者才會是同一版
export async function syncEarthquakes(db: DB, f: Fetcher = cwa): Promise<void> {
  const [significant, local] = await Promise.all([f.dataset('E-A0015-001'), f.dataset('E-A0016-001')])
  if (!significant.records?.Earthquake?.length || !local.records?.Earthquake?.length) throw new Error('CWA returned no earthquake reports')
  replaceEarthquakes(db, [...parseEarthquakes(significant, true), ...parseEarthquakes(local, false)])
  logFetch(db, 'earthquakes', now())
}
```

- [ ] **Step 7：跑測試確認通過**

Run: `npx vitest run server/repo.test.ts server/sync.test.ts`
Expected: PASS。

- [ ] **Step 8：TTL、service、API、種子 DB**

`server/freshness.ts` 的 `TTL` 中 `warnings: 10 * MIN,` 之後加：

```ts
  earthquakes: 5 * MIN,
```

`server/service.ts` 開頭的 import 區塊（到 `from './sync.js'` 那行為止）整段改成：

```ts
import type {
  ApiResponse, Earthquake, ForecastGrid, ImageOverlay, Observation, SatelliteOverlay, Town, TownForecast, Typhoon, Warning,
} from '../shared/types.js'
import { getDb } from './db.js'
import { ensureFresh } from './freshness.js'
import {
  getGrid, getImage, getSatelliteTile, getTownForecast, listEarthquakes, listGridTimes, listObservations, listSatelliteTiles, listTowns, listTyphoons,
  listWarnings,
} from './repo.js'
import { syncEarthquakes, syncForecast, syncImage, syncObservations, syncTyphoons, syncWarnings } from './sync.js'
```

檔尾加：

```ts

export async function getEarthquakes(): Promise<ApiResponse<Earthquake[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'earthquakes', () => syncEarthquakes(db))
  return { data: listEarthquakes(db), ...meta }
}
```

新增 `api/earthquakes.ts`：

```ts
import { handle, json } from '../server/http.js'
import { getEarthquakes } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getEarthquakes()))
}
```

`scripts/build-db.ts`：
- import 改成 `import { syncEarthquakes, syncForecast, syncImage, syncObservations, syncTyphoons, syncWarnings } from '../server/sync.js'`
- `steps` 中 `['warnings', () => syncWarnings(db)],` 之後加 `['earthquakes', () => syncEarthquakes(db)],`
- 最後一行的表名陣列尾端 `'typhoons', 'warnings']` 改成 `'typhoons', 'warnings', 'earthquakes']`

- [ ] **Step 9：全部測試、型別、即時資料**

Run: `npm test && npm run typecheck`
Expected: 全過。

Run: `npm run build:db`
Expected: 輸出含 `✓ earthquakes`，最後的筆數物件含 `earthquakes: 32`（兩個資料集各 16 筆；若兩者恰有同一發震時間會少一筆）。`data/weather.db` 已在 `.gitignore`，不提交。

- [ ] **Step 10：提交**

```bash
git add server/db.ts server/repo.ts server/repo.test.ts server/sync.ts server/sync.test.ts server/freshness.ts server/service.ts api/earthquakes.ts scripts/build-db.ts
git commit -F - <<'EOF'
feat(api): serve recent earthquakes from sqlite

新增 /api/earthquakes：同時抓顯著有感與小區域有感報告，合併後
在同一個交易裡整批替換，依發震時間由新到舊回傳。任一個資料集
失敗或回傳空清單都視為異常，保留舊資料，兩者永遠是同一版。
TTL 五分鐘，讓一小時內的地震徽章夠即時；種子 DB 一併抓取。

Add /api/earthquakes. Both the significant and local report sets
are fetched together and replaced in one transaction, newest
first. A failure or an empty list from either set is treated as
abnormal and keeps the old data, so the two never drift apart.
The five-minute TTL keeps the last-hour badge timely, and the
seed database now includes earthquakes.
EOF
```

---

### Task 3：前端純函式

**Files:**
- Create: `frontend/src/lib/quakes.ts`
- Test: `frontend/src/lib/quakes.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Earthquake`、`QuakeStation`；既有 `fmtMD(date)`（`lib/format.ts`）、`Bounds`
- Produces（Task 5、6 使用）：
  - `intensityRank(s: string): number`（0～9，未知 -1）
  - `intensityColor(s: string): string`
  - `INTENSITY_LEGEND: { label: string; color: string }[]`（1級～7級）
  - `maxIntensity(q: Earthquake): string | null`
  - `fmtQuakeTime(iso: string): string`（`M/D HH:mm`）
  - `pickQuake(list: Earthquake[], id: string | null): Earthquake | null`
  - `quakeBadge(list: Earthquake[], now: number): string | null`
  - `quakeBounds(q: Earthquake): Bounds`
  - `toGeoJSON(list: Earthquake[], selectedId: string | null): FeatureCollection`（`role: 'station' | 'epicenter'`；震央屬性 `id`、`magnitude`、`color`、`selected`）

- [ ] **Step 1：寫測試（先失敗）**

新增 `frontend/src/lib/quakes.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Point } from 'geojson'
import type { Earthquake, QuakeStation } from '../../../shared/types'
import {
  INTENSITY_LEGEND, fmtQuakeTime, intensityColor, intensityRank, maxIntensity, pickQuake, quakeBadge, quakeBounds, toGeoJSON,
} from './quakes'

const st = (name: string, lon: number, lat: number, intensity: string): QuakeStation => ({ id: name, name, lat, lon, intensity })
const quake = (time: string, extra: Partial<Earthquake> = {}): Earthquake => ({
  id: time, no: 115064, time, lat: 23.21, lon: 120.54, depth: 7.5, magnitude: 4.2, location: '臺南市楠西區',
  counties: [
    { county: '臺南市', intensity: '4級', stations: [st('曾文', 120.497, 23.22, '4級')] },
    { county: '嘉義縣', intensity: '3級', stations: [st('大埔', 120.59, 23.3, '3級'), st('民雄', 120.474, 23.532, '1級')] },
  ],
  web: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026064',
  ...extra,
})

describe('intensityRank / intensityColor', () => {
  it('orders the CWA scale including the weak/strong halves', () => {
    const scale = ['0級', '1級', '2級', '3級', '4級', '5弱', '5強', '6弱', '6強', '7級']
    expect(scale.map(intensityRank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(intensityRank('5弱')).toBeLessThan(intensityRank('5強'))
    expect(intensityRank('5強')).toBeLessThan(intensityRank('6弱'))
  })
  it('treats unknown strings as rank -1 in grey', () => {
    expect(intensityRank('8級')).toBe(-1)
    expect(intensityColor('8級')).toBe('#868e96')
    expect(intensityColor('')).toBe('#868e96')
    expect(intensityColor('4級')).toBe('#ff922b')
  })
  it('lists 1級 to 7級 in the legend', () => {
    expect(INTENSITY_LEGEND.map(l => l.label)).toEqual(['1級', '2級', '3級', '4級', '5弱', '5強', '6弱', '6強', '7級'])
  })
})

describe('maxIntensity', () => {
  it('takes the highest county intensity regardless of order', () => {
    const q = quake('2026-09-22T05:16:13+08:00', {
      counties: [
        { county: '嘉義縣', intensity: '4級', stations: [] },
        { county: '臺南市', intensity: '5弱', stations: [] },
        { county: '高雄市', intensity: '1級', stations: [] },
      ],
    })
    expect(maxIntensity(q)).toBe('5弱')
    expect(maxIntensity(quake('2026-09-22T05:16:13+08:00', { counties: [] }))).toBeNull()
  })
})

describe('fmtQuakeTime', () => {
  it('formats as M/D HH:mm', () => {
    expect(fmtQuakeTime('2026-09-22T05:16:13+08:00')).toBe('9/22 05:16')
  })
})

describe('pickQuake', () => {
  const list = [quake('2026-09-25T01:01:23+08:00'), quake('2026-09-22T05:16:13+08:00')]
  it('finds the selected quake and falls back to the newest', () => {
    expect(pickQuake(list, '2026-09-22T05:16:13+08:00')).toBe(list[1])
    expect(pickQuake(list, null)).toBe(list[0])
    expect(pickQuake(list, 'gone')).toBe(list[0])
    expect(pickQuake([], null)).toBeNull()
  })
})

describe('quakeBadge', () => {
  const t = Date.parse('2026-09-22T05:16:13+08:00')
  const list = [quake('2026-09-22T05:16:13+08:00')]
  it('shows the newest quake for 60 minutes', () => {
    expect(quakeBadge(list, t + 59 * 60_000)).toBe('地震 M4.2 臺南市楠西區 · 最大 4級')
    expect(quakeBadge(list, t + 60 * 60_000)).not.toBeNull()
    expect(quakeBadge(list, t + 61 * 60_000)).toBeNull()
  })
  it('is null without quakes and omits the intensity when there is none', () => {
    expect(quakeBadge([], t)).toBeNull()
    expect(quakeBadge([quake('2026-09-22T05:16:13+08:00', { counties: [] })], t)).toBe('地震 M4.2 臺南市楠西區')
  })
})

describe('quakeBounds', () => {
  it('covers the epicentre and every station', () => {
    expect(quakeBounds(quake('2026-09-22T05:16:13+08:00'))).toEqual([120.474, 23.21, 120.59, 23.532])
    expect(quakeBounds(quake('2026-09-22T05:16:13+08:00', { counties: [] }))).toEqual([120.54, 23.21, 120.54, 23.21])
  })
})

describe('toGeoJSON', () => {
  const list = [quake('2026-09-25T01:01:23+08:00', { magnitude: 2.6, counties: [] }), quake('2026-09-22T05:16:13+08:00')]
  it('emits every epicentre and only the selected quake\'s stations', () => {
    const fc = toGeoJSON(list, '2026-09-22T05:16:13+08:00')
    const stations = fc.features.filter(f => f.properties!.role === 'station')
    const epicentres = fc.features.filter(f => f.properties!.role === 'epicenter')
    expect(stations).toHaveLength(3)
    expect(stations.map(f => f.properties!.color)).toEqual(['#ff922b', '#fcc419', '#b2f2bb'])
    expect(epicentres.map(f => f.properties)).toEqual([
      { role: 'epicenter', id: '2026-09-25T01:01:23+08:00', magnitude: 2.6, color: '#868e96', selected: false },
      { role: 'epicenter', id: '2026-09-22T05:16:13+08:00', magnitude: 4.2, color: '#ff922b', selected: true },
    ])
    expect((epicentres[1].geometry as Point).coordinates).toEqual([120.54, 23.21])
  })
  it('has no stations when nothing matches the selection', () => {
    expect(toGeoJSON(list, null).features.every(f => f.properties!.role === 'epicenter')).toBe(true)
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/quakes.test.ts`
Expected: FAIL，找不到 `./quakes`。

- [ ] **Step 3：實作**

新增 `frontend/src/lib/quakes.ts`：

```ts
import type { Feature, FeatureCollection } from 'geojson'
import type { Bounds, Earthquake } from '../../../shared/types'
import { fmtMD } from './format'

// CWA 震度分級由小到大；色系參照 CWA 震度圖（綠→黃→橙→紅→紫），0 級與無法辨識用灰色
const LEVELS = ['0級', '1級', '2級', '3級', '4級', '5弱', '5強', '6弱', '6強', '7級']
const COLORS = ['#868e96', '#b2f2bb', '#51cf66', '#fcc419', '#ff922b', '#f76707', '#e03131', '#c2255c', '#9c36b5', '#5f3dc4']
const UNKNOWN = '#868e96'

/** 0～9；無法辨識為 -1 */
export const intensityRank = (s: string) => LEVELS.indexOf(s.trim())

export const intensityColor = (s: string) => COLORS[intensityRank(s)] ?? UNKNOWN

/** 卡片圖例：1級～7級 */
export const INTENSITY_LEGEND = LEVELS.slice(1).map(label => ({ label, color: intensityColor(label) }))

/** 各縣市中最大的震度；沒有震度資料時為 null */
export function maxIntensity(q: Earthquake): string | null {
  let best: string | null = null
  for (const c of q.counties) if (best == null || intensityRank(c.intensity) > intensityRank(best)) best = c.intensity
  return best
}

/** M/D HH:mm；CWA 時間固定 +08:00，直接取字元避免受瀏覽器時區影響 */
export const fmtQuakeTime = (iso: string) => `${fmtMD(iso.slice(0, 10))} ${iso.slice(11, 16)}`

/** 選取的地震；id 不在清單（null 或已被新資料擠掉）時退回最新一筆 */
export const pickQuake = (list: Earthquake[], id: string | null): Earthquake | null =>
  list.find(q => q.id === id) ?? list[0] ?? null

const BADGE_WINDOW = 60 * 60_000

/** 最新一筆（清單由新到舊）在 60 分鐘內才回傳徽章文字 */
export function quakeBadge(list: Earthquake[], now: number): string | null {
  const q = list[0]
  if (!q || now - Date.parse(q.time) > BADGE_WINDOW) return null
  const max = maxIntensity(q)
  return `地震 M${q.magnitude} ${q.location}${max ? ` · 最大 ${max}` : ''}`
}

/** 震央與所有測站的外框 */
export function quakeBounds(q: Earthquake): Bounds {
  let [w, s, e, n] = [q.lon, q.lat, q.lon, q.lat]
  for (const c of q.counties) {
    for (const st of c.stations) {
      w = Math.min(w, st.lon); e = Math.max(e, st.lon)
      s = Math.min(s, st.lat); n = Math.max(n, st.lat)
    }
  }
  return [w, s, e, n]
}

const point = (lon: number, lat: number, properties: Record<string, unknown>): Feature =>
  ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties })

/** 所有震央＋選取地震的測站；屬性只放純量，MapLibre 會把巢狀屬性轉成字串 */
export function toGeoJSON(list: Earthquake[], selectedId: string | null): FeatureCollection {
  const features: Feature[] = []
  const selected = list.find(q => q.id === selectedId)
  for (const c of selected?.counties ?? []) {
    for (const s of c.stations) features.push(point(s.lon, s.lat, { role: 'station', color: intensityColor(s.intensity) }))
  }
  for (const q of list) {
    features.push(point(q.lon, q.lat, {
      role: 'epicenter', id: q.id, magnitude: q.magnitude, color: intensityColor(maxIntensity(q) ?? ''), selected: q.id === selectedId,
    }))
  }
  return { type: 'FeatureCollection', features }
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run frontend/src/lib/quakes.test.ts && npm run typecheck`
Expected: PASS（11 個測試），型別無錯。

- [ ] **Step 5：提交**

```bash
git add frontend/src/lib/quakes.ts frontend/src/lib/quakes.test.ts
git commit -F - <<'EOF'
feat(web): add earthquake intensity and badge helpers

地震圖層的純函式：依 CWA 分級排序震度（5弱 < 5強 < 6弱）並給
色階、取各縣市最大震度、格式化時間、選取地震（找不到時退回最新
一筆）、一小時內的徽章文字、震央加測站的外框，以及地圖用的
GeoJSON。未知的震度字串退回灰色而不是壞掉。

Pure helpers for the earthquake layer: rank intensities on the
CWA scale (5- < 5+ < 6-) and colour them, take the maximum county
intensity, format times, pick the selected quake (falling back to
the newest), build the last-hour badge text, bound the epicentre
and stations, and emit GeoJSON for the map. Unknown intensity
strings fall back to grey instead of breaking.
EOF
```

---

### Task 4：圖層註冊、資料 hook、選取狀態、狀態列

**Files:**
- Modify: `frontend/src/lib/layers.ts`、`frontend/src/api.ts`、`frontend/src/store.ts`、`frontend/src/components/StatusBadge.tsx`
- Test: `frontend/src/lib/lib.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `GET /api/earthquakes`
- Produces: `LayerId` 含 `'quake'`；`useEarthquakes()`（TanStack Query，`data?.data: Earthquake[]`）；store 的 `quake: string | null` 與 `selectQuake(quake: string | null)`

- [ ] **Step 1：寫網址解析測試（先失敗）**

`frontend/src/lib/lib.test.ts` 的 `describe('urlState')` 裡，`expect(parseUrlState('?layer=bogus&t=-3'))…` 那行之後加：

```ts
    expect(parseUrlState('?layer=quake')).toEqual({ layer: 'quake', t: 0, town: null })
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/lib.test.ts`
Expected: FAIL，`layer` 為 `'temp'`（`quake` 尚未是合法圖層）。

- [ ] **Step 3：註冊圖層**

`frontend/src/lib/layers.ts` 的 `LayerId` 與 `LAYER_IDS` 兩行（第 3、4 行）改成：

```ts
export type LayerId = 'temp' | 'wind' | 'rain' | 'humidity' | 'radar' | 'satellite' | 'typhoon' | 'warning' | 'quake' | 'admin'
export const LAYER_IDS: LayerId[] = ['temp', 'wind', 'rain', 'humidity', 'radar', 'satellite', 'typhoon', 'warning', 'quake', 'admin']
```

`LAYERS` 中 `warning: { label: '特報', icon: '⚠️' },` 之後加：

```ts
  quake: { label: '地震', icon: '🫨' },
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run frontend/src/lib/lib.test.ts`
Expected: PASS。

- [ ] **Step 5：資料 hook**

`frontend/src/api.ts` 的 `shared/types` import 改成：

```ts
import type {
  ApiResponse, Earthquake, ForecastGrid, ImageOverlay, Observation, SatelliteOverlay, Town, TownForecast, Typhoon, Warning,
} from '../../shared/types'
```

檔尾加：

```ts

export const useEarthquakes = () =>
  useQuery({ queryKey: ['earthquakes'], queryFn: () => get<Earthquake[]>('/api/earthquakes'), refetchInterval: FIVE_MIN })
```

- [ ] **Step 6：選取狀態**

`frontend/src/store.ts`：
- `interface State` 中 `basemap: BasemapId` 之後加：

```ts
  /** 地震圖層選取的地震 id；null 為最新一筆，不寫進網址 */
  quake: string | null
```

- `setBasemap: (basemap: BasemapId) => void` 之後加 `  selectQuake: (quake: string | null) => void`
- `create` 裡 `basemap: 'dark',` 之後加 `  quake: null,`
- `setBasemap: basemap => set({ basemap }),` 之後加 `  selectQuake: quake => set({ quake }),`

網址同步的 `subscribe` 不動（只看 `layer`、`t`、`town`）。

- [ ] **Step 7：狀態列**

`frontend/src/components/StatusBadge.tsx`：
- 第 1 行 import 改成：

```ts
import {
  useEarthquakes, useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected, useSatellite, useSatelliteClouds, useTyphoons, useWarnings,
} from '../api'
```

- `const isWarning = layer === 'warning'` 之後加 `  const isQuake = layer === 'quake'`
- `const warnings = useWarnings()` 之後加 `  const quakes = useEarthquakes()`
- `const q = isWarning ? warnings : …` 改成以 `isQuake ? quakes : ` 開頭：

```ts
  const q = isQuake ? quakes : isWarning ? warnings : isTyphoon ? typhoon : isSatellite ? satellite : isRadar ? radar : t > 0 ? grid : obs
```

- [ ] **Step 8：全部測試與型別**

Run: `npm test && npm run typecheck`
Expected: 全過。此時切到「地震」圖層只會看到地點卡片或空白，地圖與資訊卡在 Task 5、6 加上。

- [ ] **Step 9：提交**

```bash
git add frontend/src/lib/layers.ts frontend/src/lib/lib.test.ts frontend/src/api.ts frontend/src/store.ts frontend/src/components/StatusBadge.tsx
git commit -F - <<'EOF'
feat(web): register earthquake layer

新增第十個互斥圖層「地震」（排在特報之後），沒有時間序列所以時
間軸自動停用，?layer=quake 可分享。資料 hook 不帶 enabled，因為
徽章在每個圖層都要用；選取的地震存在 store，null 代表最新一筆，
不寫進網址。狀態列在地震圖層顯示地震資料的更新時間。

Register earthquakes as the tenth exclusive layer, after warnings.
It has no time series, so the timeline disables itself, and
?layer=quake is shareable. The data hook is always enabled because
the badge needs it on every layer. The selected quake lives in the
store, with null meaning the newest, and stays out of the URL. The
status badge shows the earthquake data's update time on this layer.
EOF
```

---

### Task 5：地圖（震央、星號、測站）

**Files:**
- Modify: `frontend/src/map/helpers.ts`、`frontend/src/components/TyphoonLayer.tsx`、`frontend/src/components/MapView.tsx`、`frontend/src/components/DataLayers.tsx`
- Create: `frontend/src/components/QuakeLayer.tsx`

**Interfaces:**
- Consumes: Task 3 的 `pickQuake`、`quakeBounds`、`toGeoJSON`；Task 4 的 `useEarthquakes`、store `quake`／`selectQuake`；既有 `dataLayerBefore`、`removeLayerAndSource`、`inkOf`
- Produces: `cardFitPadding()`（`map/helpers.ts`，颱風與地震共用）；`<QuakeLayer map list />`

這個 Task 沒有自動化測試（專案沒有元件測試，Vitest 環境是 node）；純邏輯已在 Task 3 測過，這裡以型別檢查＋手動驗證。

- [ ] **Step 1：共用 fitBounds 邊距**

`frontend/src/map/helpers.ts` 檔尾加：

```ts

/** fitBounds 時避開資訊卡：桌機卡片在左側（340px＋間距），手機是底部抽屜 */
export const cardFitPadding = () => matchMedia('(max-width: 640px)').matches
  ? { top: 60, bottom: Math.round(innerHeight * 0.45), left: 20, right: 20 }
  : { top: 60, bottom: 110, left: 380, right: 140 }
```

`frontend/src/components/TyphoonLayer.tsx`：
- `import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'` 改成 `import { cardFitPadding, dataLayerBefore, removeLayerAndSource } from '../map/helpers'`
- 刪掉這四行（註解與本地的 `fitPadding`）：

```ts
// 左側避開 .card（340px＋間距）；手機版卡片在底部
const fitPadding = () => matchMedia('(max-width: 640px)').matches
  ? { top: 60, bottom: Math.round(innerHeight * 0.45), left: 20, right: 20 }
  : { top: 60, bottom: 110, left: 380, right: 140 }
```

- `{ padding: fitPadding(), maxZoom: 7 }` 改成 `{ padding: cardFitPadding(), maxZoom: 7 }`

- [ ] **Step 2：地圖圖層元件**

新增 `frontend/src/components/QuakeLayer.tsx`：

```tsx
import { useEffect, useMemo, useRef } from 'react'
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import type { Earthquake } from '../../../shared/types'
import { pickQuake, quakeBounds, toGeoJSON } from '../lib/quakes'
import { cardFitPadding, dataLayerBefore, removeLayerAndSource } from '../map/helpers'
import { useStore } from '../store'
import { inkOf } from '../lib/basemaps'

const SRC = 'quake'
const STATIONS = 'quake-stations'
const EPICENTERS = 'quake-epicenters'
const SELECTED = 'quake-selected'
const STAR = 'quake-star'

/** 紅色白邊五角星；用 canvas 畫，不依賴底圖字型有沒有 ★ */
function starImage(size = 48): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const c = size / 2
  const r = c - 3
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5
    const d = i % 2 ? r * 0.45 : r
    g.lineTo(c + d * Math.cos(a), c + d * Math.sin(a))
  }
  g.closePath()
  g.fillStyle = '#fa5252'
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = '#ffffff'
  g.stroke()
  return g.getImageData(0, 0, size, size)
}

export default function QuakeLayer({ map, list }: { map: MlMap; list: Earthquake[] }) {
  const quake = useStore(s => s.quake)
  const ink = useStore(s => inkOf(s.basemap))
  const selected = pickQuake(list, quake)
  const selectedId = selected?.id ?? null
  const data = useMemo(() => toGeoJSON(list, selectedId), [list, selectedId])
  // 重建圖層（換底圖 ink 色）時要用最新資料，不必把 data 放進依賴而每次都重建
  const latest = useRef({ data, selected })
  latest.current = { data, selected }

  useEffect(() => {
    const before = dataLayerBefore(map)
    if (!map.hasImage(STAR)) map.addImage(STAR, starImage(), { pixelRatio: 2 })
    map.addSource(SRC, { type: 'geojson', data: latest.current.data })
    map.addLayer({ id: STATIONS, type: 'circle', source: SRC, filter: ['==', ['get', 'role'], 'station'],
      paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': ink, 'circle-stroke-width': 0.5 } }, before)
    map.addLayer({ id: EPICENTERS, type: 'circle', source: SRC,
      filter: ['all', ['==', ['get', 'role'], 'epicenter'], ['!', ['get', 'selected']]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2, 4, 6, 16],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.5,
        'circle-stroke-color': ink,
        'circle-stroke-width': 1,
      } }, before)
    map.addLayer({ id: SELECTED, type: 'symbol', source: SRC,
      filter: ['all', ['==', ['get', 'role'], 'epicenter'], ['get', 'selected']],
      layout: { 'icon-image': STAR, 'icon-allow-overlap': true, 'icon-ignore-placement': true } }, before)

    const onClick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      if (typeof id === 'string') useStore.getState().selectQuake(id)
    }
    const pointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const unpointer = () => { map.getCanvas().style.cursor = '' }
    map.on('click', EPICENTERS, onClick)
    map.on('mouseenter', EPICENTERS, pointer)
    map.on('mouseleave', EPICENTERS, unpointer)

    return () => {
      map.off('click', EPICENTERS, onClick)
      map.off('mouseenter', EPICENTERS, pointer)
      map.off('mouseleave', EPICENTERS, unpointer)
      unpointer()
      for (const id of [SELECTED, EPICENTERS, STATIONS, SRC]) removeLayerAndSource(map, id)
      try {
        if (map.hasImage(STAR)) map.removeImage(STAR)
      } catch {
        // 地圖已被 remove
      }
    }
  }, [map, ink])

  // 資料或選取改變時只換資料，不重建圖層
  useEffect(() => {
    (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(data)
  }, [map, data])

  // 選取的地震換了才縮放（含切入圖層的預設選取）；同一筆重新取得資料不再移動畫面
  useEffect(() => {
    const q = latest.current.selected
    if (!q) return
    const [w, s, e, n] = quakeBounds(q)
    map.fitBounds([[w, s], [e, n]], { padding: cardFitPadding(), maxZoom: 9 })
  }, [map, selectedId])

  return null
}
```

- [ ] **Step 3：掛上圖層、MapView 讓出點擊與視角**

`frontend/src/components/DataLayers.tsx`：
- 第 4 行 `../api` 的 import 改成：

```ts
import {
  useEarthquakes, usePrefetchGrids, useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected, useSatellite, useSatelliteClouds,
  useTyphoons, useWarnings,
} from '../api'
```

- `import WarningLayer from './WarningLayer'` 之後加 `import QuakeLayer from './QuakeLayer'`
- `const warnings = useWarnings()` 之後加 `  const quakes = useEarthquakes()`
- JSX 中 `WarningLayer` 那行之後加：

```tsx
      {layer === 'quake' && quakes.data && <QuakeLayer map={map} list={quakes.data.data} />}
```

`frontend/src/components/MapView.tsx`：
- `setWorkerUrl(workerUrl)` 之後（空一行）加：

```ts
// 颱風、地震圖層自己處理地圖點擊，切入時也會自動縮放到資料範圍
const ownsMap = () => ['typhoon', 'quake'].includes(useStore.getState().layer)
```

- click handler 開頭這兩行：

```ts
      // 颱風圖層的點擊留給路徑點 popup
      if (useStore.getState().layer === 'typhoon') return
```

改成：

```ts
      if (ownsMap()) return
```

- 初次載入鄉鎮的 effect 中這兩行：

```ts
    // 颱風圖層已自動縮放到颱風路徑，不要被晚到的地點蓋掉
    if (useStore.getState().layer !== 'typhoon') mapRef.current.flyTo({ center: [t.lon, t.lat], zoom: 10 })
```

改成：

```ts
    // 颱風、地震圖層已自動縮放到資料範圍，不要被晚到的地點蓋掉
    if (!ownsMap()) mapRef.current.flyTo({ center: [t.lon, t.lat], zoom: 10 })
```

- GPS 定位 effect 最後一行 `if (useStore.getState().layer !== 'typhoon') mapRef.current.flyTo({ center: [here.lon, here.lat], zoom: 10 })` 改成：

```ts
    if (!ownsMap()) mapRef.current.flyTo({ center: [here.lon, here.lat], zoom: 10 })
```

- [ ] **Step 4：型別與測試**

Run: `npm test && npm run typecheck`
Expected: 全過。

- [ ] **Step 5：手動驗證**

`npm run dev`，在**前景**分頁開 `http://localhost:5173/?layer=quake`（桌機寬度）：

1. 地圖縮放到最新一筆地震（`maxZoom 9`），震央是紅色白邊星號，該筆各測站是依震度上色的小圓點；其他震央是半透明圓點，大小隨規模。
2. 點另一個震央圓點 → 星號移過去、測站換成那筆、畫面縮放到它的震央＋測站；滑過圓點時游標變手指。
3. 開 DevTools 的 Network 等 5 分鐘 refetch：同一筆資料重新取得時畫面**不**移動。
4. 在地震圖層點地圖空白處（台灣本島上）→ 不出現縣市框選、不縮放、麵包屑不變。
5. 開 `http://localhost:5173/?layer=quake&town=66000060` → 畫面停在地震的 `fitBounds`，不會飛到臺中市西屯區；切到「溫度」再點地圖，縣市逐層選取照常運作。
6. 停在地震圖層，右下角把底圖依序切成淺色、衛星、深色 → 每次星號、測站、震央都重新出現；淺色底圖上圓點邊框是深色。
7. 切到「颱風」圖層（有活動中颱風時）→ 仍會縮放到颱風路徑（`cardFitPadding` 搬家沒壞）。

- [ ] **Step 6：提交**

```bash
git add frontend/src/map/helpers.ts frontend/src/components/TyphoonLayer.tsx frontend/src/components/QuakeLayer.tsx frontend/src/components/MapView.tsx frontend/src/components/DataLayers.tsx
git commit -F - <<'EOF'
feat(web): plot epicentres and station intensities

地震圖層畫出所有震央（大小依規模、顏色依最大震度），選取的那筆
改以 canvas 畫的紅色星號標示，並依震度為它的各測站上色；點震央
即切換選取。選取換人時縮放到震央與測站，同一筆重新取得資料不再
移動畫面；資料更新只 setData，不重建圖層。地震圖層和颱風一樣不
觸發縣市逐層選取，也不被晚到的鄉鎮 flyTo 蓋掉；避開卡片的邊距
移到 helpers 共用。

Plot every epicentre, sized by magnitude and coloured by maximum
intensity, and mark the selected one with a canvas-drawn red star
while colouring its stations by intensity; clicking an epicentre
selects it. The view fits the epicentre and stations only when the
selection changes, and data updates call setData instead of
rebuilding layers. Like the typhoon layer, map clicks no longer
drill into counties and late town fly-tos no longer override the
fit; the card-avoiding padding moves into the shared helpers.
EOF
```

---

### Task 6：資訊卡與徽章

**Files:**
- Create: `frontend/src/components/QuakeCard.tsx`、`frontend/src/components/QuakeBadge.tsx`
- Modify: `frontend/src/App.tsx`、`frontend/src/styles.css`

**Interfaces:**
- Consumes: Task 3 的 `INTENSITY_LEGEND`、`fmtQuakeTime`、`intensityColor`、`maxIntensity`、`pickQuake`、`quakeBadge`；Task 4 的 `useEarthquakes`、store `layer`／`setLayer`／`quake`／`selectQuake`
- Produces: `<QuakeCard />`、`<QuakeBadge />`

- [ ] **Step 1：資訊卡**

新增 `frontend/src/components/QuakeCard.tsx`：

```tsx
import { useRef } from 'react'
import { useEarthquakes } from '../api'
import { useStore } from '../store'
import { INTENSITY_LEGEND, fmtQuakeTime, intensityColor, maxIntensity, pickQuake } from '../lib/quakes'

export default function QuakeCard() {
  const q = useEarthquakes()
  const quake = useStore(s => s.quake)
  const selectQuake = useStore(s => s.selectQuake)
  const ref = useRef<HTMLElement>(null)
  const list = q.data?.data ?? []
  const sel = pickQuake(list, quake)
  const choose = (id: string) => {
    selectQuake(id)
    ref.current?.scrollTo({ top: 0 })
  }
  return (
    <aside ref={ref} className="card glass" aria-label="地震資訊">
      <header><h2>🫨 有感地震</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入地震資料，請稍後再試。</p>}
      {q.data && !sel && <p className="muted">近期無有感地震資料</p>}
      {sel && (
        <>
          <section className="quake-detail">
            <h3>M{sel.magnitude} {sel.location}</h3>
            <div className="muted">
              {fmtQuakeTime(sel.time)} · 深度 {sel.depth} km · {sel.no != null ? `第 ${sel.no} 號` : '小區域有感地震'}
            </div>
            <a href={sel.web} target="_blank" rel="noreferrer">CWA 報告 ↗</a>
          </section>
          <section className="quake-counties">
            {sel.counties.map(c => (
              <details key={c.county}>
                <summary>
                  <span className="dot" style={{ background: intensityColor(c.intensity) }} />
                  <span>{c.county}</span>
                  <span className="muted">{c.intensity}</span>
                </summary>
                <ul>
                  {c.stations.map(s => (
                    <li key={s.id}><span>{s.name}</span><span className="muted">{s.intensity}</span></li>
                  ))}
                </ul>
              </details>
            ))}
            <div className="quake-legend">
              {INTENSITY_LEGEND.map(l => <span key={l.label} style={{ background: l.color }}>{l.label}</span>)}
            </div>
          </section>
          <section className="quake-list">
            <h3>近期地震</h3>
            <ul>
              {list.map(x => (
                <li key={x.id}>
                  <button className={x.id === sel.id ? 'on' : ''} aria-pressed={x.id === sel.id} onClick={() => choose(x.id)}>
                    <span className="dot" style={{ background: intensityColor(maxIntensity(x) ?? '') }} />
                    <b>M{x.magnitude}</b>
                    <span className="place">{x.location}</span>
                    <span className="muted">{fmtQuakeTime(x.time)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </aside>
  )
}
```

- [ ] **Step 2：徽章**

新增 `frontend/src/components/QuakeBadge.tsx`：

```tsx
import { useEarthquakes } from '../api'
import { useStore } from '../store'
import { quakeBadge } from '../lib/quakes'

/** 一小時內有地震時在任何圖層提示；點了切到地震圖層並選取最新一筆。已在地震圖層時不顯示 */
export default function QuakeBadge() {
  const layer = useStore(s => s.layer)
  const setLayer = useStore(s => s.setLayer)
  const selectQuake = useStore(s => s.selectQuake)
  const q = useEarthquakes()
  // 每次 refetch（5 分鐘）有新資料時重新渲染才重算，超過一小時後約晚 5 分鐘消失，不另加計時器
  const text = quakeBadge(q.data?.data ?? [], Date.now())
  if (!text || layer === 'quake') return null
  return (
    <button className="badge glass alert quake" onClick={() => { selectQuake(null); setLayer('quake') }}>{text}</button>
  )
}
```

- [ ] **Step 3：App**

`frontend/src/App.tsx`：
- `import WarningBadge from './components/WarningBadge'` 之後加 `import QuakeBadge from './components/QuakeBadge'`
- `import WarningCard from './components/WarningCard'` 之後加 `import QuakeCard from './components/QuakeCard'`
- `<WarningBadge />` 之後加 `<QuakeBadge />`（同縮排）
- 最後的卡片切換改成：

```tsx
      {layer === 'typhoon' ? <TyphoonCard />
        : layer === 'warning' ? <WarningCard />
        : layer === 'quake' ? <QuakeCard />
        : <LocationCard />}
```

- [ ] **Step 4：樣式**

`frontend/src/styles.css`：
- `.badge.alert:hover { background: #a61e1e; }` 之後加：

```css
.badge.alert.quake { background: #e8590c; }
.badge.alert.quake:hover { background: #d9480f; }
```

- `.warning-group li { … }` 那行之後加：

```css
.quake-detail, .quake-counties, .quake-list { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--glass-border); }
.quake-detail h3, .quake-list h3 { margin: 0 0 4px; font-size: 16px; }
.quake-detail a { display: inline-block; margin-top: 6px; font-size: 13px; color: var(--accent); text-decoration: none; }
.quake-counties .dot, .quake-list .dot { flex: none; width: 12px; height: 12px; border-radius: 50%; }
.quake-counties summary { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; cursor: pointer; list-style: none; }
.quake-counties summary::-webkit-details-marker { display: none; }
.quake-counties summary::before { content: '▸'; width: 10px; color: var(--muted); }
.quake-counties details[open] > summary::before { content: '▾'; }
.quake-counties summary .muted { margin-left: auto; }
.quake-counties ul, .quake-list ul { list-style: none; margin: 0; padding: 0; }
.quake-counties li { display: flex; justify-content: space-between; padding: 2px 0 2px 38px; font-size: 12px; }
.quake-legend { display: flex; margin-top: 10px; border-radius: 4px; overflow: hidden; }
.quake-legend span { flex: 1; padding: 2px 0; font-size: 10px; text-align: center; color: #fff; text-shadow: 0 0 2px rgba(0, 0, 0, 0.8); }
.quake-list button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px; font-size: 13px; text-align: left; }
.quake-list button:hover { background: rgba(255, 255, 255, 0.08); }
.quake-list button.on { background: rgba(59, 130, 246, 0.35); }
.quake-list .place { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- 「特報徽章讓左上角多一列…」那段改成（註解改寫、多一條兩顆徽章的規則；`:has()` 內選擇器較具體，會蓋過單顆的規則）：

```css
/* 特報、地震徽章各讓左上角多一列，桌面版卡片跟著下移才不會被蓋住；手機的卡片是底部抽屜，不受影響 */
@media (min-width: 641px) {
  .top-left:has(.badge.alert) ~ .card { top: 184px; max-height: calc(100% - 294px); }
  .top-left:has(.badge.alert ~ .badge.alert) ~ .card { top: 218px; max-height: calc(100% - 328px); }
}
```

- [ ] **Step 5：型別、測試與手動驗證**

Run: `npm test && npm run typecheck`
Expected: 全過。

`npm run dev`，前景分頁：

1. `?layer=quake`：卡片標題「🫨 有感地震」；上方是最新一筆（`M… 地名`、`M/D HH:mm · 深度 … km · 第 N 號`或`小區域有感地震`、「CWA 報告 ↗」新分頁開到 CWA 報告頁）；中間縣市列表點開可看測站與震度，下方有 1級～7級色階；最下方「近期地震」清單，選取中那列反白。
2. 捲到清單底部點一筆 → 卡片捲回頂端、詳細資料與地圖換成該筆。
3. 手機寬度（DevTools 390×844）：卡片是底部抽屜，地圖上方仍看得到星號。
4. 徽章：用 DevTools Console 無法直接改時間，改成暫時把 `frontend/src/lib/quakes.ts` 的 `BADGE_WINDOW` 改成 `1e12`（**不要提交**）→ 任何非地震圖層左上角出現橙色「地震 M… · 最大 …」徽章，點了切到地震圖層並選最新一筆；在地震圖層時徽章消失。
5. 兩顆徽章：在第 4 點的狀態下，再暫時把 `WarningBadge.tsx` 的 `const text = badgeText(groupByKind(q.data?.data ?? []))` 尾端加上 ` ?? '⚠ 大雨特報 · 2 縣市'`（**不要提交**），開 `?layer=temp&town=66000060`：紅、橙兩顆徽章上下排列，地點卡片頂端在 218px、不被蓋住。
6. 還原第 4、5 點的暫時修改：`git diff --stat` 只剩本 Task 的四個檔案。

- [ ] **Step 6：提交**

```bash
git add frontend/src/components/QuakeCard.tsx frontend/src/components/QuakeBadge.tsx frontend/src/App.tsx frontend/src/styles.css
git commit -F - <<'EOF'
feat(web): add earthquake card and badge

地震圖層的資訊卡取代地點卡片：上方是選取地震的規模、地名、時
間、深度、編號與 CWA 報告連結，中間是可展開測站的各縣市震度與
色階圖例，下方是近期地震清單，點了切換選取並捲回頂端。左上角
在一小時內有地震時顯示橙色徽章，任何圖層都看得到，點了切到地震
圖層並選最新一筆；與特報徽章同時出現時卡片再下移一列。

The earthquake card takes the location card's slot: the selected
quake's magnitude, place, time, depth, number and CWA report link
on top, county intensities with expandable stations and a legend
in the middle, and the recent list below, which switches the
selection and scrolls back up. An orange badge in the top-left
flags a quake from the last hour on every layer and opens the
newest one; with the warnings badge also shown, the card moves
down another row.
EOF
```

---

### Task 7：README

**Files:**
- Modify: `README.md`
- Create: `docs/screenshots/quake.png`

- [ ] **Step 1：截圖**

`npm run dev`，**前景**瀏覽器視窗調成 1440×900 的可視區（DevTools 裝置模式選 Responsive 並填 1440×900 最準），開 `http://localhost:5173/?layer=quake`，在「近期地震」清單點規模最大的一筆，等地圖縮放完成後截取可視區，存成 `docs/screenshots/quake.png`（1440×900 PNG，與其他截圖一致）。

- [ ] **Step 2：截圖表格**

README 第 27～29 行「底圖切換」那個表格之後（空一行）加：

```markdown
| 地震（震央依規模與最大震度上色；選取的地震以星號標示、測站依震度上色，資訊卡列出各縣市震度與近期清單） |
|---|
| ![地震](docs/screenshots/quake.png) |
```

- [ ] **Step 3：功能清單**

`- **九種圖層**：溫度、風、雨量、濕度、雷達、衛星、颱風、特報、行政區` 改成：

```markdown
- **十種圖層**：溫度、風、雨量、濕度、雷達、衛星、颱風、特報、地震、行政區
```

「**特報**」那條之後加：

```markdown
- **地震**：合併顯著有感與小區域有感地震報告，震央依規模與最大震度畫成圓點；選取的地震以星號標示並依震度為各測站上色，資訊卡列出各縣市震度（可展開看測站）與近期地震清單；一小時內發生地震時，左上角徽章在任何圖層都會提示，點了切到地震圖層
```

- [ ] **Step 4：架構圖、TTL 表、API 表**

mermaid 裡的 API 路由節點改成：

```
      API["路由<br/>observations · towns · forecast<br/>forecast-grid · radar · satellite · satellite-tile · typhoon · warnings · earthquakes"]
```

datastore 節點改成：

```
    DS["datastore API<br/>O-A0001/0002/0003-001 觀測<br/>F-D0047-093 鄉鎮預報<br/>W-C0034-005 颱風路徑<br/>W-C0033-001 縣市特報<br/>E-A0015/0016-001 有感地震"]
```

TTL 表「特報」那列之後加：

```markdown
| 地震 | 5 分鐘 | 5 分鐘 |
```

API 表「`GET /api/warnings`」那列之後加：

```markdown
| `GET /api/earthquakes` | 近期顯著有感與小區域有感地震（含各縣市與測站震度） |
```

- [ ] **Step 5：提交**

```bash
git add README.md docs/screenshots/quake.png
git commit -F - <<'EOF'
docs: add earthquake layer to readme

README 的截圖、功能清單、架構圖、TTL 表與 API 表補上地震圖層。

Add the earthquake layer to the README screenshots, feature list,
architecture diagram, TTL table and API table.
EOF
```

- [ ] **Step 6：最終驗證**

Run: `npm test && npm run typecheck && npm run build`
Expected: 測試全過（118 個）、型別無錯、`build:db` 輸出 `✓ earthquakes` 且筆數物件含 `earthquakes`、`vite build` 成功。`git status` 乾淨（`data/`、`dist/` 已被忽略）。
