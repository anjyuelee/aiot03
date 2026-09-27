# 特報全文與高溫資訊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 特報卡片每組特報可展開 CWA `W-C0033-002` 的原文，並以 `W-C0033-005` 補上 `W-C0033-001` 不含的高溫資訊（歸到縣市，卡片列出鄉鎮）。

**Architecture:** 後端沿用 `ensureFresh → sync → repo → SQLite`。`syncWarnings` 同時抓 `001`、`005`、`002`：高溫資訊解析成 `Warning` 列寫進既有 `warnings` 表（新增 `level`、`towns` 欄），全文寫進新表 `warning_texts`，由新的 `/api/warning-texts` 提供，與 `/api/warnings` 共用 `ensureFresh('warnings')`。前端 `lib/warnings.ts` 加入高溫的嚴重度與燈號分組、全文配對；`WarningCard` 顯示鄉鎮列與可展開的全文。填色、描邊、徽章都讀 `useWarnings()`，不需改動即包含高溫資訊。

**Tech Stack:** TypeScript、better-sqlite3、Vitest、React 19、MapLibre GL 6、TanStack Query。

**Spec:** `docs/superpowers/specs/2026-09-27-warning-text-design.md`（前一版：`2026-09-25-weather-warnings-design.md`、`2026-09-26-warning-outline-design.md`）

**Commit 規則：** 英文 subject＋中英雙語 body＋`Co-Authored-By` 行。每個 Task 最後一步已附上完整訊息，用 `git commit -F -` 搭配 heredoc 提交。分支 `feat/warning-text`（spec 已 commit 在上面）。

**測試指令：** `npm test`、`npm run typecheck`。單檔可用 `npx vitest run <path>`。目前 209 個測試全過；本計畫完成後為 228 個。

本計畫的程式碼已在 repo 副本跑過：測試（228 個）、型別檢查，以及 headless Chrome 實測（2026-09-27 真實高溫資訊：特報圖層 9 縣市填色、卡片鄉鎮列與全文展開、溫度圖層描邊與徽章 `⚠ 高溫資訊・黃色燈號 · 9 縣市`、淺色／深色底圖、手機 390×664；以 fixture 替身檢查多組特報時的排序與全文配對）。

## Global Constraints

- 資料集：`W-C0033-001`（縣市特報，沿用）、`W-C0033-005`（高溫資訊，CAP）、`W-C0033-002`（特報全文），都走 `f.dataset(id)`；三個一起抓，任一失敗整批保留舊資料
- 共用 freshness key `'warnings'`（TTL 10 分鐘）；`/api/warnings` 與 `/api/warning-texts` 只觸發一次同步
- `Warning.level`：燈號，例 `黃色燈號`，只有高溫資訊有值，其他為 `null`；`Warning.towns`：鄉鎮名陣列，整個縣市時為 `null`（`001` 的特報皆為 `null`）
- 高溫列：`phenomena = event`（`高溫`）、`significance = '資訊'`、`start = onset`、`end = expires`；依「縣市＋燈號」合併
- CAP 過濾：`urgency === 'Past'`、`expires <= now`、`headline` 含「解除」的訊息一律略過
- `Taiwan_Geocode_103` 7 碼鄉鎮碼：以 `6` 開頭者取前 2 碼右補零（`6500100` → `65000`），其他取前 5 碼（`1000404` → `10004`）；2／5 碼沿用 `toCountyCode`；縣市名為 `areaDesc` 前 3 字
- `WarningText.kind` = `phenomena + significance`（例 `大雨特報`、`高溫資訊`）；同一 kind 取 `issueTime` 最新者；高溫全文 = `description` + `\n\n` + `instruction`
- 嚴重度（由重到輕）：颱風 8 `#c2255c`、大豪雨 7 `#e03131`、豪雨 6 `#f76707`、大雨 5 `#fcc419`、高溫 4 `#9c4221`、低溫 3 `#7048e8`、強風 2 `#228be6`、濃霧 1 `#adb5bd`、其他 0 `#868e96`
- 分組標題：有燈號時 `${kind}・${level}`，否則 `kind`；排序 rank 高者先 → 燈號 紅 > 橙 > 黃 > 無 → 標題
- 全文只放在同 kind 的第一組；摘要文字「全文 · 9/27 07:30 發布」，無發布時間只寫「全文」
- DB：`warnings` 主鍵 `(county_code, phenomena, significance, level)`，`level` 以 `''` 存無燈號；`towns` 存 JSON；舊版 `warnings` 表（無 `level` 欄）在 `openDb` 時 drop 並刪除 `fetch_log` 的 `warnings` 列
- 本機 dev server 用 `--port 5174`（5173 被其他專案占用）

## Review Focus

1. **手機上長的鄉鎮列與徽章要排得下**（新北市一次 7 個區、徽章 `⚠ 高溫資訊・黃色燈號 · 9 縣市`）→ Task 5 Step 6 以 390×664 截圖檢查
2. **同一縣市同時有大雨與高溫時，地圖顯示雨的顏色；高溫與低溫同時出現時顯示高溫** → Task 4 `worstByCounty` 測試 `puts heat below rain and above cold`
3. **本機舊 DB 升級後第一次請求要自動重抓，而且之後每次冷啟動不能再清掉資料** → Task 2 `db.test.ts` 兩個測試
4. **高溫資訊剛好到 `expires` 那一刻就不再顯示** → Task 1 `parseHeat` 測試以 `AFTER` 恰等於 `expires`
5. **`002` 的真實結構與推定不同、或找不到某種特報的全文時，卡片清單照常、只是沒有全文** → Task 4 `textsByGroup`（有組沒全文、有全文沒組）＋Task 5 Step 6 fixture 替身檢查

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `shared/types.ts` | 修改 | `Warning.level`、`Warning.towns`、`WarningText` |
| `server/cwa/parse.ts`、`parse.test.ts` | 修改 | `parseWarnings` 補兩欄；`townCountyCode`、`parseHeat`、`parseHeatText`、`parseWarningTexts` |
| `server/__fixtures__/W-C0033-005.json` | 新增 | 2026-09-27 真實高溫資訊 |
| `server/__fixtures__/W-C0033-002.json` | 新增 | 依推定結構手寫的特報全文 |
| `server/db.ts`、`server/db.test.ts`（新增） | 修改 | schema、舊版 `warnings` 表遷移 |
| `server/repo.ts`、`repo.test.ts` | 修改 | `warnings` 兩欄、`replaceWarningTexts`／`listWarningTexts` |
| `server/sync.ts`、`sync.test.ts` | 修改 | `syncWarnings` 抓三個資料集 |
| `server/service.ts`、`api/warning-texts.ts`（新增） | 修改 | `getWarningTexts`、`GET /api/warning-texts` |
| `scripts/build-db.ts` | 修改 | 筆數輸出加 `warning_texts` |
| `frontend/src/lib/warnings.ts`、`warnings.test.ts` | 修改 | 高溫嚴重度、燈號分組、`textsByGroup`、`textSummary` |
| `frontend/src/api.ts` | 修改 | `useWarningTexts()` |
| `frontend/src/components/WarningCard.tsx`、`frontend/src/styles.css` | 修改 | 鄉鎮列、全文 `details` |
| `README.md`、`docs/screenshots/warning.png` | 修改 | 說明與截圖 |

---

### Task 1：解析高溫資訊與特報全文

**Files:**
- Modify: `shared/types.ts`（`Warning`，新增 `WarningText`）
- Modify: `server/cwa/parse.ts`（import、`parseWarnings`，在 `function quakeStation` 之前新增函式）
- Create: `server/__fixtures__/W-C0033-005.json`、`server/__fixtures__/W-C0033-002.json`
- Test: `server/cwa/parse.test.ts`
- Modify: `frontend/src/lib/warnings.test.ts`（只改 `w` 輔助函式，讓型別檢查通過）

**Interfaces:**
- Consumes: 既有 `toCountyCode(geocode: unknown): string`、`toTaipeiIso(s: unknown): string | null`
- Produces:
  - `interface Warning { countyCode; county; phenomena; significance; level: string | null; towns: string[] | null; start; end }`
  - `interface WarningText { kind: string; issued: string | null; text: string }`
  - `townCountyCode(geocode: string): string`
  - `parseHeat(json: any, now: string): Warning[]`
  - `parseHeatText(json: any, now: string): WarningText[]`
  - `parseWarningTexts(json: any): WarningText[]`
  - `parseWarnings` 回傳的每列 `level: null`、`towns: null`

- [ ] **Step 1：新增 fixture**

`server/__fixtures__/W-C0033-005.json`（2026-09-27 CWA 真實回應，逐字保留）：

```json
{
  "success": "true",
  "result": {
    "resource_id": "W-C0033-005",
    "fields": [
      {"id": "language", "type": "String"},
      {"id": "category", "type": "String"},
      {"id": "event", "type": "String"},
      {"id": "responseType", "type": "String"},
      {"id": "urgency", "type": "String"},
      {"id": "severity", "type": "String"},
      {"id": "certainty", "type": "String"},
      {"id": "valueName", "type": "String"},
      {"id": "value", "type": "String"},
      {"id": "effective", "type": "String"},
      {"id": "onset", "type": "String"},
      {"id": "expires", "type": "String"},
      {"id": "senderName", "type": "String"},
      {"id": "headline", "type": "String"},
      {"id": "description", "type": "String"},
      {"id": "instruction", "type": "String"},
      {"id": "web", "type": "String"},
      {"id": "areaDesc", "type": "String"}
    ]
  },
  "records": {
    "info": [
      {
        "language": "zh-TW",
        "category": "Met",
        "event": "高溫",
        "responseType": "Monitor",
        "urgency": "Future",
        "severity": "Moderate",
        "certainty": "Likely",
        "eventCode": {"valueName": "profile:CAP-TWP:Event:1.0", "value": "heat"},
        "effective": "2026-09-27T07:30:00+08:00",
        "onset": "2026-09-27T08:00:00+08:00",
        "expires": "2026-09-27T17:00:00+08:00",
        "senderName": "中央氣象署",
        "headline": "高溫資訊",
        "description": "各地天氣高溫炎熱，今(27)日中午前後臺北市、新北市、桃園市、彰化縣、南投縣、臺南市、屏東縣為黃色燈號，請注意。",
        "instruction": "減少戶外活動及勞動，避免劇烈運動、注意防曬、多補充水份、慎防熱傷害。室內保持通風及涼爽，適時採取人體或環境降溫的方法，如搧風或利用冰袋降溫等。適時關懷老人、小孩、慢性病人、肥胖、服用藥物、弱勢族群、戶外工作或運動者，減少長時間處在高溫環境。",
        "web": "https://www.cwa.gov.tw/V8/C/P/Warning/W29.html",
        "parameter": [
          {"valueName": "alert_title", "value": "高溫資訊"},
          {"valueName": "severity_level", "value": "高溫黃色燈號"},
          {"valueName": "alert_criteria", "value": "氣溫達攝氏36度以上"},
          {"valueName": "alert_color", "value": "黃色"},
          {"valueName": "website_color", "value": "255,255,0"}
        ],
        "area": [
          {"areaDesc": "臺北市文山區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6300800"}},
          {"areaDesc": "臺北市大安區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6300300"}},
          {"areaDesc": "臺北市中正區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6300500"}},
          {"areaDesc": "臺北市萬華區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6300700"}},
          {"areaDesc": "新北市板橋區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6500100"}},
          {"areaDesc": "新北市樹林區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6500700"}},
          {"areaDesc": "新北市鶯歌區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6500800"}},
          {"areaDesc": "新北市新店區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6500600"}},
          {"areaDesc": "新北市永和區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6500400"}},
          {"areaDesc": "新北市中和區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6500300"}},
          {"areaDesc": "新北市三峽區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6500900"}},
          {"areaDesc": "桃園市桃園區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6800100"}},
          {"areaDesc": "桃園市龜山區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6800700"}},
          {"areaDesc": "桃園市大溪區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6800300"}},
          {"areaDesc": "彰化縣埔心鄉", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "1000715"}},
          {"areaDesc": "彰化縣永靖鄉", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "1000716"}},
          {"areaDesc": "南投縣草屯鎮", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "1000803"}},
          {"areaDesc": "臺南市楠西區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6702400"}},
          {"areaDesc": "臺南市玉井區", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "6702300"}},
          {"areaDesc": "屏東縣內埔鄉", "geocode": {"valueName": "Taiwan_Geocode_103", "value": "1001313"}}
        ]
      }
    ]
  }
}
```

`server/__fixtures__/W-C0033-002.json`（依 `result.fields` 推定的結構手寫；A 為大雨特報，B 為颱風警報且發布較晚、同時含大雨特報）：

```json
{
  "success": "true",
  "result": {
    "resource_id": "W-C0033-002",
    "fields": [
      { "id": "datasetDescription", "type": "String" },
      { "id": "datasetLanguage", "type": "String" },
      { "id": "issueTime", "type": "Timestamp" },
      { "id": "startTime", "type": "Timestamp" },
      { "id": "endTime", "type": "Timestamp" },
      { "id": "update", "type": "Timestamp" },
      { "id": "contentLanguage", "type": "String" },
      { "id": "contentText", "type": "String" },
      { "id": "language", "type": "String" },
      { "id": "phenomena", "type": "String" },
      { "id": "significance", "type": "String" },
      { "id": "locationName", "type": "String" }
    ]
  },
  "records": {
    "record": [
      {
        "datasetInfo": {
          "datasetDescription": "大雨特報",
          "datasetLanguage": "zh-TW",
          "issueTime": "2026-09-25 05:30:00",
          "validTime": { "startTime": "2026-09-25 05:30:00", "endTime": "2026-09-25 17:30:00" },
          "update": "2026-09-25 05:35:00"
        },
        "contents": {
          "content": {
            "contentLanguage": "zh-TW",
            "contentText": "\n東北風及低壓帶影響，今（25）日宜蘭地區及花蓮山區有局部大雨發生的機率，請注意雷擊及強陣風。\n山區請慎防坍方、落石及溪水暴漲，低窪地區請慎防積水。\n"
          }
        },
        "hazardConditions": {
          "hazards": {
            "hazard": [
              {
                "info": {
                  "language": "zh-TW", "phenomena": "大雨", "significance": "特報",
                  "affectedAreas": { "location": [{ "locationName": "宜蘭縣" }, { "locationName": "花蓮縣" }] }
                }
              }
            ]
          }
        }
      },
      {
        "datasetInfo": {
          "datasetDescription": "颱風警報",
          "datasetLanguage": "zh-TW",
          "issueTime": "2026-09-25T08:30:00+08:00",
          "validTime": { "startTime": "2026-09-25T08:30:00+08:00", "endTime": "2026-09-25T11:30:00+08:00" },
          "update": "2026-09-25T08:35:00+08:00"
        },
        "contents": {
          "content": {
            "contentLanguage": "zh-TW",
            "contentText": "海上陸上颱風警報第5報。\n颱風外圍環流影響，今（25）日臺北市有局部大雨發生的機率。"
          }
        },
        "hazardConditions": {
          "hazards": {
            "hazard": [
              {
                "info": {
                  "language": "zh-TW", "phenomena": "颱風", "significance": "警報",
                  "affectedAreas": { "location": [{ "locationName": "臺北市" }] }
                }
              },
              {
                "info": {
                  "language": "zh-TW", "phenomena": "大雨", "significance": "特報",
                  "affectedAreas": { "location": [{ "locationName": "臺北市" }] }
                }
              }
            ]
          }
        }
      }
    ]
  }
}
```

- [ ] **Step 2：寫失敗的測試**

`server/cwa/parse.test.ts` 第 3–6 行 import 改為：

```ts
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseRadarTimes, parseTyphoons, parseWarnings,
  parseEarthquakes, parseHeat, parseHeatText, parseWarningTexts, townCountyCode,
} from './parse.js'
```

`describe('parseWarnings', …)` 內 `expect(rain).toEqual({…})` 的物件改為（補 `level`、`towns`）：

```ts
    expect(rain).toEqual({
      countyCode: '10002', county: '宜蘭縣', phenomena: '大雨', significance: '特報', level: null, towns: null,
      start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00',
    })
```

在 `describe('parseEarthquakes', () => {` 之前插入：

```ts
describe('townCountyCode', () => {
  it('maps municipality towns by their first two digits and other towns by their first five', () => {
    expect(['6300800', '6500100', '6702400', '1000404', '1000715', '0902006'].map(townCountyCode))
      .toEqual(['63000', '65000', '67000', '10004', '10007', '09020'])
  })
})

describe('parseHeat', () => {
  const json = fixture('W-C0033-005.json')
  const BEFORE = '2026-09-27T04:00:00.000Z' // 12:00 台灣時間，有效期間內
  const AFTER = '2026-09-27T09:00:00.000Z' // 17:00 台灣時間，剛好到期
  const list = parseHeat(json, BEFORE)

  it('groups towns into one row per county', () => {
    expect(list.map(w => w.countyCode)).toEqual(['63000', '65000', '68000', '10007', '10008', '67000', '10013'])
    expect(list[0]).toEqual({
      countyCode: '63000', county: '臺北市', phenomena: '高溫', significance: '資訊', level: '黃色燈號',
      towns: ['文山區', '大安區', '中正區', '萬華區'],
      start: '2026-09-27T08:00:00+08:00', end: '2026-09-27T17:00:00+08:00',
    })
    expect(list.find(w => w.county === '彰化縣')!.towns).toEqual(['埔心鄉', '永靖鄉'])
  })

  it('drops expired, past and lifted messages', () => {
    expect(parseHeat(json, AFTER)).toEqual([])
    const info = json.records.info[0]
    expect(parseHeat({ records: { info: [{ ...info, urgency: 'Past' }] } }, BEFORE)).toEqual([])
    expect(parseHeat({ records: { info: [{ ...info, headline: '解除高溫資訊' }] } }, BEFORE)).toEqual([])
    expect(parseHeat({ records: {} }, BEFORE)).toEqual([])
  })

  it('keeps one row per level and lists no towns for county-wide areas', () => {
    const info = json.records.info[0]
    const orange = {
      ...info,
      parameter: [{ valueName: 'severity_level', value: '高溫橙色燈號' }],
      area: [
        { areaDesc: '臺北市士林區', geocode: { value: '6301100' } },
        { areaDesc: '臺東縣', geocode: { value: '10014' } },
      ],
    }
    const rows = parseHeat({ records: { info: [orange, info] } }, BEFORE)
    expect(rows.filter(w => w.countyCode === '63000').map(w => [w.level, w.towns])).toEqual([
      ['橙色燈號', ['士林區']],
      ['黃色燈號', ['文山區', '大安區', '中正區', '萬華區']],
    ])
    expect(rows.find(w => w.countyCode === '10014')).toMatchObject({ county: '臺東縣', level: '橙色燈號', towns: null })
  })
})

describe('parseHeatText', () => {
  const json = fixture('W-C0033-005.json')

  it('joins the description and the instruction', () => {
    const [t] = parseHeatText(json, '2026-09-27T04:00:00.000Z')
    expect(t.kind).toBe('高溫資訊')
    expect(t.issued).toBe('2026-09-27T07:30:00+08:00')
    expect(t.text.startsWith('各地天氣高溫炎熱')).toBe(true)
    expect(t.text).toContain('請注意。\n\n減少戶外活動')
  })

  it('is empty once the message expires', () => {
    expect(parseHeatText(json, '2026-09-27T09:00:00.000Z')).toEqual([])
  })
})

describe('parseWarningTexts', () => {
  const texts = parseWarningTexts(fixture('W-C0033-002.json'))

  it('maps every kind in a record to its trimmed text', () => {
    expect(texts.map(t => t.kind).sort()).toEqual(['大雨特報', '颱風警報'])
    expect(texts.find(t => t.kind === '颱風警報')!.text).toBe('海上陸上颱風警報第5報。\n颱風外圍環流影響，今（25）日臺北市有局部大雨發生的機率。')
  })

  it('takes the latest issued text when a kind appears in several records', () => {
    expect(texts.find(t => t.kind === '大雨特報')).toMatchObject({ issued: '2026-09-25T08:30:00+08:00', text: expect.stringContaining('颱風警報第5報') })
  })

  it('accepts single objects in place of arrays and skips empty text', () => {
    const one = {
      records: {
        record: [
          {
            datasetInfo: { issueTime: '2026-09-25 05:30:00' },
            contents: { content: { contentText: '濃霧' } },
            hazardConditions: { hazards: { hazard: { info: { phenomena: '濃霧', significance: '特報' } } } },
          },
          {
            datasetInfo: { issueTime: '2026-09-25 06:30:00' },
            contents: { content: { contentText: '  ' } },
            hazardConditions: { hazards: { hazard: { info: { phenomena: '低溫', significance: '特報' } } } },
          },
        ],
      },
    }
    expect(parseWarningTexts(one)).toEqual([{ kind: '濃霧特報', issued: '2026-09-25T05:30:00+08:00', text: '濃霧' }])
    expect(parseWarningTexts({ records: { record: [] } })).toEqual([])
  })
})

```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: FAIL — `parseHeat is not a function`（在 describe 收集階段就丟錯），`parseWarnings` 的 `toEqual` 也因缺 `level`、`towns` 失敗。

- [ ] **Step 4：型別**

`shared/types.ts` 的 `Warning` 從 `/** 例：特報、警報 */` 到介面結尾換成：

```ts
  /** 例：特報、警報、資訊 */
  significance: string
  /** 燈號，例：黃色燈號；只有高溫資訊有值 */
  level: string | null
  /** 受影響鄉鎮；整個縣市都在範圍內時為 null（W-C0033-001 的特報皆為 null） */
  towns: string[] | null
  /** +08:00 ISO；CWA 未提供時為 null */
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

- [ ] **Step 5：解析**

`server/cwa/parse.ts` 第 2–4 行 import 改為：

```ts
import type {
  Bounds, Earthquake, ForecastSlot, ImageKind, ImageOverlay, QuakeCounty, QuakeStation, Town, Typhoon, TyphoonFix, Warning, WarningText,
  WeekSlot,
} from '../../shared/types.js'
```

`parseWarnings` 內 `significance: h.info?.significance || '特報',` 之後加兩行：

```ts
        level: null,
        towns: null,
```

在 `function quakeStation(s: any)` 之前插入：

```ts
/** 7 碼鄉鎮 geocode（Taiwan_Geocode_103）換成 5 碼縣市碼：直轄市以 6 開頭，只取前 2 碼；其他取前 5 碼 */
export function townCountyCode(geocode: string): string {
  return geocode.startsWith('6') ? geocode.slice(0, 2).padEnd(5, '0') : geocode.slice(0, 5)
}

// CAP 資料集沒有新訊息時仍回傳最後一則，過期或解除的訊息都要濾掉
function activeInfos(json: any, now: string): any[] {
  return (json.records?.info ?? []).filter((i: any) =>
    i.urgency !== 'Past' && !String(i.headline ?? '').includes('解除') && Date.parse(i.expires) > Date.parse(now))
}

const HEAT_SIGNIFICANCE = '資訊'

/** W-C0033-005 高溫資訊：鄉鎮歸到縣市，每個縣市＋燈號一列 */
export function parseHeat(json: any, now: string): Warning[] {
  const rows = new Map<string, Warning>()
  for (const info of activeInfos(json, now)) {
    const event: string = info.event ?? '高溫'
    const severity: string | undefined = info.parameter?.find((p: any) => p.valueName === 'severity_level')?.value
    const level = (severity?.startsWith(event) ? severity.slice(event.length) : severity) || null
    for (const area of info.area ?? []) {
      const code = String(area.geocode?.value ?? '')
      const desc = String(area.areaDesc ?? '')
      if (!code || !desc) continue
      const countyCode = code.length === 7 ? townCountyCode(code) : toCountyCode(code)
      const key = `${countyCode} ${level}`
      const row = rows.get(key) ?? {
        countyCode, county: desc.slice(0, 3), phenomena: event, significance: HEAT_SIGNIFICANCE, level, towns: [],
        start: toTaipeiIso(info.onset), end: toTaipeiIso(info.expires),
      }
      // 縣市層級的地區代表整個縣市都在範圍內，之後不再列鄉鎮
      if (code.length !== 7) row.towns = null
      else row.towns?.push(desc.slice(3))
      rows.set(key, row)
    }
  }
  return [...rows.values()]
}

/** W-C0033-005 的說明與注意事項，當作高溫資訊的全文 */
export function parseHeatText(json: any, now: string): WarningText[] {
  const info = activeInfos(json, now)[0]
  if (!info) return []
  const text = [info.description, info.instruction].filter(Boolean).join('\n\n').trim()
  return text ? [{ kind: (info.event ?? '高溫') + HEAT_SIGNIFICANCE, issued: toTaipeiIso(info.effective), text }] : []
}

// CWA 的巢狀節點只有一筆時可能不是陣列
const asList = (x: any): any[] => (x == null ? [] : Array.isArray(x) ? x : [x])

/** W-C0033-002：每則特報的全文對應到它包含的每個種類；同一種類出現在多則時取發布時間最新者 */
export function parseWarningTexts(json: any): WarningText[] {
  const latest = new Map<string, WarningText>()
  for (const record of asList(json.records?.record)) {
    const text = String(asList(record.contents?.content)[0]?.contentText ?? '').trim()
    if (!text) continue
    const issued = toTaipeiIso(record.datasetInfo?.issueTime)
    const hazards = record.hazardConditions?.hazards
    for (const h of asList(hazards?.hazard ?? hazards)) {
      const phenomena = h.info?.phenomena
      if (!phenomena) continue
      const kind = phenomena + (h.info.significance || '特報')
      const prev = latest.get(kind)
      if (!prev || (issued ?? '') > (prev.issued ?? '')) latest.set(kind, { kind, issued, text })
    }
  }
  return [...latest.values()]
}

```

- [ ] **Step 6：前端測試輔助函式補欄位**

`Warning` 多了兩個必填欄位，`frontend/src/lib/warnings.test.ts` 的 `w` 輔助函式要補上，否則 `npm run typecheck` 失敗。第 8 行：

```ts
  countyCode, county, phenomena, significance: '特報',
```

改為：

```ts
  countyCode, county, phenomena, significance: '特報', level: null, towns: null,
```

- [ ] **Step 7：確認通過**

Run: `npx vitest run server/cwa/parse.test.ts && npm test && npm run typecheck`
Expected: parse 測試 36 個全過；全部 218 個測試通過；型別檢查無錯誤。

- [ ] **Step 8：Commit**

```bash
git add shared/types.ts server/cwa/parse.ts server/cwa/parse.test.ts server/__fixtures__/W-C0033-005.json server/__fixtures__/W-C0033-002.json frontend/src/lib/warnings.test.ts
git commit -F - <<'EOF'
feat(api): parse heat info and warning texts

W-C0033-001 不含高溫資訊，新增 parseHeat 讀 W-C0033-005（CAP）：
略過過期、解除與 urgency 為 Past 的訊息，鄉鎮依 geocode 歸到縣市，
每個縣市＋燈號一列，Warning 因此多了 level 與 towns 兩欄。
parseWarningTexts 讀 W-C0033-002 的特報全文，同一種類取最新發布者；
parseHeatText 以高溫資訊的說明與注意事項當全文。

W-C0033-001 leaves heat information out, so parseHeat reads it from
W-C0033-005 (CAP). It skips expired, lifted and past messages, maps each
town's geocode to its county and emits one row per county and light
level, which adds level and towns to Warning. parseWarningTexts reads the
full warning text from W-C0033-002 and keeps the latest issue of each
kind; parseHeatText uses the heat message's description and instruction.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2：儲存燈號、鄉鎮與全文

**Files:**
- Modify: `server/db.ts`（`SCHEMA` 的 `warnings`、新增 `warning_texts`；`openDb`）
- Create: `server/db.test.ts`
- Modify: `server/repo.ts`（import、`replaceWarnings`、`listWarnings`，新增兩個函式）
- Test: `server/repo.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Warning`（含 `level`、`towns`）、`WarningText`；既有 `getFetchedAt(db, key)`
- Produces:
  - `replaceWarnings(db, list: Warning[]): void`、`listWarnings(db): Warning[]`（依 `county_code, phenomena, level` 排序，`level` 空字串讀回 `null`、`towns` 解析 JSON）
  - `replaceWarningTexts(db: DB, list: WarningText[]): void`
  - `listWarningTexts(db: DB): WarningText[]`（依 `kind` 排序）
  - `openDb(file)` 遇到沒有 `level` 欄的舊 `warnings` 表時，drop 該表並刪除 `fetch_log` 的 `warnings` 列

- [ ] **Step 1：寫失敗的測試**

新增 `server/db.test.ts`：

```ts
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb } from './db.js'
import { getFetchedAt } from './repo.js'

let dir: string
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('openDb', () => {
  it('drops an old warnings table and its fetch log so it is fetched again', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiot03-db-'))
    const file = path.join(dir, 'old.db')
    const old = new Database(file)
    old.exec(`
      CREATE TABLE warnings (county_code TEXT, county TEXT, phenomena TEXT, significance TEXT, start_time TEXT, end_time TEXT,
        PRIMARY KEY (county_code, phenomena, significance));
      INSERT INTO warnings VALUES ('10002', '宜蘭縣', '大雨', '特報', NULL, NULL);
      CREATE TABLE fetch_log (dataset TEXT PRIMARY KEY, fetched_at TEXT);
      INSERT INTO fetch_log VALUES ('warnings', '2026-09-27T00:00:00.000Z'), ('observations', '2026-09-27T00:00:00.000Z');
    `)
    old.close()

    const db = openDb(file)
    const cols = (db.prepare('PRAGMA table_info(warnings)').all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('level')
    expect(db.prepare('SELECT COUNT(*) AS n FROM warnings').get()).toEqual({ n: 0 })
    expect(getFetchedAt(db, 'warnings')).toBeNull()
    expect(getFetchedAt(db, 'observations')).toBe('2026-09-27T00:00:00.000Z')
    db.close()
  })

  it('keeps a current warnings table', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiot03-db-'))
    const file = path.join(dir, 'current.db')
    const first = openDb(file)
    first.exec(`INSERT INTO warnings (county_code, county, phenomena, significance) VALUES ('10002', '宜蘭縣', '大雨', '特報');
      INSERT INTO fetch_log VALUES ('warnings', '2026-09-27T00:00:00.000Z')`)
    first.close()

    const db = openDb(file)
    expect(db.prepare('SELECT COUNT(*) AS n FROM warnings').get()).toEqual({ n: 1 })
    expect(getFetchedAt(db, 'warnings')).toBe('2026-09-27T00:00:00.000Z')
    db.close()
  })
})
```

`server/repo.test.ts` 第 4–9 行 import 改為：

```ts
import {
  replaceObservations, listObservations, replaceForecasts, listTowns, getTownForecast,
  listGridTimes, getGrid, upsertImage, getImage, logFetch, getFetchedAt,
  replaceSatelliteTiles, listSatelliteTiles, getSatelliteTile, replaceWarnings, listWarnings, replaceEarthquakes, listEarthquakes,
  replaceRadarFrames, listRadarFrames, replaceWarningTexts, listWarningTexts,
} from './repo.js'
```

把整個 `describe('warnings', …)` 區塊換成：

```ts
describe('warnings', () => {
  it('replaces the whole list and reads it back sorted by county then phenomena', () => {
    const list = parseWarnings(fixture('W-C0033-001.json'))
    replaceWarnings(db, [list[0]])
    replaceWarnings(db, list)
    const rows = listWarnings(db)
    expect(rows.map(w => `${w.countyCode} ${w.phenomena}`)).toEqual(['09007 濃霧', '10002 大雨', '10002 陸上強風', '10015 豪雨', '63000 大雨'])
    expect(rows[1]).toEqual({
      countyCode: '10002', county: '宜蘭縣', phenomena: '大雨', significance: '特報', level: null, towns: null,
      start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00',
    })
    expect(rows[0].end).toBeNull()
  })

  it('keeps each level of a county apart and reads towns back', () => {
    const heat = (level: string, towns: string[] | null) => ({
      countyCode: '63000', county: '臺北市', phenomena: '高溫', significance: '資訊', level, towns,
      start: '2026-09-27T08:00:00+08:00', end: '2026-09-27T17:00:00+08:00',
    })
    replaceWarnings(db, [heat('黃色燈號', ['文山區', '大安區']), heat('橙色燈號', null)])
    expect(listWarnings(db).map(w => [w.level, w.towns])).toEqual([['橙色燈號', null], ['黃色燈號', ['文山區', '大安區']]])
  })
})

describe('warning texts', () => {
  it('replaces the whole list and reads it back sorted by kind', () => {
    const rain = { kind: '大雨特報', issued: '2026-09-25T05:30:00+08:00', text: '大雨' }
    replaceWarningTexts(db, [{ kind: '濃霧特報', issued: null, text: '濃霧' }])
    replaceWarningTexts(db, [{ kind: '高溫資訊', issued: '2026-09-27T07:30:00+08:00', text: '高溫' }, rain])
    expect(listWarningTexts(db)).toEqual([rain, { kind: '高溫資訊', issued: '2026-09-27T07:30:00+08:00', text: '高溫' }])
  })
})
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run server/db.test.ts server/repo.test.ts`
Expected: FAIL — `db.test.ts` 的 `cols` 不含 `level`；repo 的 `replaceWarningTexts is not a function`；`rows[1]` 缺 `level`、`towns`。

- [ ] **Step 3：schema 與遷移**

`server/db.ts` 的 `SCHEMA` 中，`warnings` 表那三行換成：

```sql
CREATE TABLE IF NOT EXISTS warnings (
  county_code TEXT, county TEXT, phenomena TEXT, significance TEXT, level TEXT NOT NULL DEFAULT '',
  towns TEXT, start_time TEXT, end_time TEXT,
  PRIMARY KEY (county_code, phenomena, significance, level));
CREATE TABLE IF NOT EXISTS warning_texts (kind TEXT PRIMARY KEY, issued TEXT, text TEXT);
```

`openDb` 換成（並在其後新增 `dropOldWarnings`）：

```ts
export function openDb(file: string): DB {
  const db = new Database(file)
  dropOldWarnings(db)
  db.exec(SCHEMA)
  return db
}

// warnings 只是快取：舊版表沒有 level 欄，CREATE TABLE IF NOT EXISTS 不會補，整張丟掉並清掉抓取紀錄，下次請求重抓
function dropOldWarnings(db: DB): void {
  const cols = db.prepare('PRAGMA table_info(warnings)').all() as { name: string }[]
  if (cols.length === 0 || cols.some(c => c.name === 'level')) return
  db.exec("DROP TABLE warnings; DELETE FROM fetch_log WHERE dataset = 'warnings'")
}
```

- [ ] **Step 4：repo**

`server/repo.ts` 第 2–4 行 import 改為：

```ts
import type {
  Bounds, Earthquake, ForecastSlot, GridCell, ImageKind, ImageOverlay, Observation, Town, TownForecast, Typhoon, Warning, WarningText,
  WeekSlot,
} from '../shared/types.js'
```

把 `replaceWarnings` 與 `listWarnings` 兩個函式換成：

```ts
// level 以空字串存「無燈號」才能放進主鍵；towns 存 JSON
export function replaceWarnings(db: DB, list: Warning[]): void {
  const insert = db.prepare(`INSERT OR REPLACE INTO warnings (county_code, county, phenomena, significance, level, towns, start_time, end_time)
    VALUES (@countyCode, @county, @phenomena, @significance, @level, @towns, @start, @end)`)
  db.transaction(() => {
    db.prepare('DELETE FROM warnings').run()
    for (const w of list) insert.run({ ...w, level: w.level ?? '', towns: w.towns && JSON.stringify(w.towns) })
  })()
}

export function listWarnings(db: DB): Warning[] {
  const rows = db.prepare(`SELECT county_code AS countyCode, county, phenomena, significance, NULLIF(level, '') AS level, towns,
    start_time AS start, end_time AS "end" FROM warnings ORDER BY county_code, phenomena, level`).all() as (Omit<Warning, 'towns'> & { towns: string | null })[]
  return rows.map(r => ({ ...r, towns: r.towns == null ? null : JSON.parse(r.towns) }))
}

export function replaceWarningTexts(db: DB, list: WarningText[]): void {
  const insert = db.prepare('INSERT OR REPLACE INTO warning_texts (kind, issued, text) VALUES (@kind, @issued, @text)')
  db.transaction(() => {
    db.prepare('DELETE FROM warning_texts').run()
    for (const t of list) insert.run(t)
  })()
}

export function listWarningTexts(db: DB): WarningText[] {
  return db.prepare('SELECT kind, issued, text FROM warning_texts ORDER BY kind').all() as WarningText[]
}
```

- [ ] **Step 5：確認通過**

Run: `npx vitest run server/db.test.ts server/repo.test.ts && npm test && npm run typecheck`
Expected: 全部 222 個測試通過；型別檢查無錯誤。

- [ ] **Step 6：Commit**

```bash
git add server/db.ts server/db.test.ts server/repo.ts server/repo.test.ts
git commit -F - <<'EOF'
feat(api): store warning levels, towns and texts

warnings 表加上 level 與 towns（JSON）兩欄，主鍵納入 level，同一縣市
可同時有不同燈號的高溫資訊；新增 warning_texts 表存特報全文。本機
/tmp 的舊 DB 不會因 CREATE TABLE IF NOT EXISTS 補欄位，openDb 發現
舊版 warnings 表時整張丟掉並清掉它的抓取紀錄，下次請求重抓。

The warnings table gains level and towns (JSON) columns, with level in
the primary key so a county can hold several heat light levels, and a
new warning_texts table keeps the full warning text. CREATE TABLE IF NOT
EXISTS does not add columns to the old local /tmp database, so openDb
drops an old warnings table together with its fetch log and the next
request fetches it again.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3：同步三個資料集並提供全文 API

**Files:**
- Modify: `server/sync.ts`（import、`syncWarnings`）
- Test: `server/sync.test.ts`
- Modify: `server/service.ts`（import，新增 `getWarningTexts`）
- Create: `api/warning-texts.ts`
- Modify: `scripts/build-db.ts`（筆數輸出）

**Interfaces:**
- Consumes: Task 1 的 `parseHeat`、`parseHeatText`、`parseWarningTexts`；Task 2 的 `replaceWarningTexts`、`listWarningTexts`
- Produces:
  - `syncWarnings(db, f)`：抓 `W-C0033-001`、`W-C0033-005`、`W-C0033-002`，寫 `warnings` 與 `warning_texts`，`logFetch(db, 'warnings', at)`
  - `getWarningTexts(): Promise<ApiResponse<WarningText[]>>`
  - `GET /api/warning-texts` → `{ data: WarningText[], updatedAt, stale }`

- [ ] **Step 1：寫失敗的測試**

`server/sync.test.ts` 第 1 行改為：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
```

第 8–11 行的 repo import 改為：

```ts
import {
  listObservations, listTowns, getTownForecast, getImage, getFetchedAt, listSatelliteTiles, listTyphoons, listWarnings, listEarthquakes,
  listRadarFrames, listWarningTexts,
} from './repo.js'
```

把整個 `describe('syncWarnings', …)` 區塊換成：

```ts
describe('syncWarnings', () => {
  // 台灣時間 12:00，fixture 的高溫資訊（08:00–17:00）有效
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T12:00:00+08:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  const quietHeat = { success: 'true', records: { info: [] } }
  const quietTexts = { success: 'true', records: { record: [] } }
  const withWarnings = (counties: unknown, heat: unknown = fixture('W-C0033-005.json'), texts: unknown = fixture('W-C0033-002.json')): Fetcher => ({
    async dataset(id) {
      if (id === 'W-C0033-001') return counties
      if (id === 'W-C0033-005') {
        if (heat instanceof Error) throw heat
        return heat
      }
      if (id === 'W-C0033-002') return texts
      throw new Error(`unexpected dataset ${id}`)
    },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
    ...noHistory,
  })

  it('stores county warnings, heat info and texts, and logs the fetch', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    const rows = listWarnings(db)
    expect(rows).toHaveLength(12)
    expect(rows.filter(w => w.phenomena === '高溫')).toHaveLength(7)
    expect(listWarningTexts(db).map(t => t.kind)).toEqual(['大雨特報', '颱風警報', '高溫資訊'])
    expect(getFetchedAt(db, 'warnings')).toBe('2026-09-27T04:00:00.000Z')
  })

  it('clears old warnings and texts when none are active', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    const quiet = fixture('W-C0033-001.json')
    for (const loc of quiet.records.location) loc.hazardConditions.hazards = []
    await syncWarnings(db, withWarnings(quiet, quietHeat, quietTexts))
    expect(listWarnings(db)).toEqual([])
    expect(listWarningTexts(db)).toEqual([])
  })

  it('refuses to wipe warnings when the response has no locations', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    const fetchedAt = getFetchedAt(db, 'warnings')
    await expect(syncWarnings(db, withWarnings({ success: 'true', records: { location: [] } }))).rejects.toThrow('no warning locations')
    expect(listWarnings(db)).toHaveLength(12)
    expect(getFetchedAt(db, 'warnings')).toBe(fetchedAt)
  })

  it('keeps both tables when one dataset fails', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    const fetchedAt = getFetchedAt(db, 'warnings')
    await expect(syncWarnings(db, withWarnings(fixture('W-C0033-001.json'), new Error('CWA HTTP 500'), quietTexts))).rejects.toThrow('CWA HTTP 500')
    expect(listWarnings(db)).toHaveLength(12)
    expect(listWarningTexts(db)).toHaveLength(3)
    expect(getFetchedAt(db, 'warnings')).toBe(fetchedAt)
  })
})
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run server/sync.test.ts`
Expected: FAIL — 現行 `syncWarnings` 只抓 `001`，`listWarnings` 只有 5 列、`listWarningTexts` 為空。

- [ ] **Step 3：同步**

`server/sync.ts` 第 5–12 行兩段 import 改為：

```ts
import {
  parseEarthquakes, parseForecast3h, parseForecastWeek, parseImage, parseRadarTimes, parseRainStations, parseTyphoons, parseWarnings,
  parseWeatherStations, parseHeat, parseHeatText, parseWarningTexts,
} from './cwa/parse.js'
import {
  logFetch, replaceEarthquakes, replaceForecasts, replaceObservations, replaceRadarFrames, replaceSatelliteTiles, replaceTyphoons, replaceWarnings,
  upsertImage, replaceWarningTexts,
} from './repo.js'
```

把 `syncWarnings` 與它上方的註解換成：

```ts
// 無特報時 CWA 仍回傳 22 縣市、各自 hazards 為空，照樣清空舊資料；連縣市都沒有則視為異常回應。
// 高溫資訊不在 W-C0033-001，從 W-C0033-005 補上；全文來自 W-C0033-002。三個一起抓，任一失敗就整批保留舊資料
export async function syncWarnings(db: DB, f: Fetcher = cwa): Promise<void> {
  const [counties, heat, texts] = await Promise.all(['W-C0033-001', 'W-C0033-005', 'W-C0033-002'].map(id => f.dataset(id)))
  if (!counties.records?.location?.length) throw new Error('CWA returned no warning locations')
  const at = now()
  replaceWarnings(db, [...parseWarnings(counties), ...parseHeat(heat, at)])
  replaceWarningTexts(db, [...parseWarningTexts(texts), ...parseHeatText(heat, at)])
  logFetch(db, 'warnings', at)
}
```

- [ ] **Step 4：service、API 與 build-db**

`server/service.ts` 第 1–3 行 import 改為：

```ts
import type {
  ApiResponse, Earthquake, ForecastGrid, Observation, RadarFrames, SatelliteOverlay, Town, TownForecast, Typhoon, Warning,
  WarningText,
} from '../shared/types.js'
```

repo import 的 `listTyphoons, listWarnings,` 改為 `listTyphoons, listWarnings, listWarningTexts,`。在 `getWarnings` 之後新增：

```ts
// 與 getWarnings 共用同一次同步
export async function getWarningTexts(): Promise<ApiResponse<WarningText[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'warnings', () => syncWarnings(db))
  return { data: listWarningTexts(db), ...meta }
}
```

新增 `api/warning-texts.ts`：

```ts
import { handle, json } from '../server/http.js'
import { getWarningTexts } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getWarningTexts()))
}
```

`scripts/build-db.ts` 最後一行的表名清單中，`'warnings', 'earthquakes'` 改為 `'warnings', 'warning_texts', 'earthquakes'`。

- [ ] **Step 5：確認通過**

Run: `npx vitest run server/sync.test.ts && npm test && npm run typecheck`
Expected: 全部 223 個測試通過；型別檢查無錯誤。

- [ ] **Step 6：Commit**

```bash
git add server/sync.ts server/sync.test.ts server/service.ts api/warning-texts.ts scripts/build-db.ts
git commit -F - <<'EOF'
feat(api): serve heat info and warning texts

syncWarnings 同時抓 W-C0033-001、W-C0033-005 與 W-C0033-002：高溫
資訊併入 warnings，全文寫進 warning_texts；任一資料集失敗就整批保留
舊資料。新增 GET /api/warning-texts，與 /api/warnings 共用同一個
freshness key，兩支 API 只觸發一次同步。

syncWarnings now fetches W-C0033-001, W-C0033-005 and W-C0033-002
together: heat information joins the warnings and the full text goes to
warning_texts, and a failure in any of them keeps the old data. The new
GET /api/warning-texts shares the warnings freshness key, so the two
endpoints trigger a single sync.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4：高溫嚴重度、燈號分組與全文配對

**Files:**
- Modify: `frontend/src/lib/warnings.ts`（import、`LEVELS`、`WarningGroup`、`groupByKind`，新增 `textsByGroup`、`textSummary`）
- Test: `frontend/src/lib/warnings.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Warning`（`level`、`towns`）、`WarningText`；既有 `fmtMD(date)`
- Produces:
  - `interface WarningGroup { title: string; kind: string; color: string; rank: number; items: Warning[] }`
  - `groupByKind(list: Warning[]): WarningGroup[]`
  - `textsByGroup(groups: WarningGroup[], texts: WarningText[]): Map<string, WarningText>`（key 為 `title`）
  - `textSummary(t: WarningText): string`

- [ ] **Step 1：寫失敗的測試**

`frontend/src/lib/warnings.test.ts` 第 2–5 行 import 改為：

```ts
import {
  COUNTY_SELECTED_WIDTH, WARNING_LINE_WIDTH, badgeText, countyColor, countyFilter, countyRank, fmtValid, groupByKind, outlineOpacity, severityOf, textSummary, textsByGroup,
  worstByCounty,
} from './warnings'
import type { Warning, WarningText } from '../../../shared/types'
```

`describe('severityOf', …)` 整段換成：

```ts
describe('severityOf', () => {
  it('ranks by keyword, heaviest first', () => {
    const ranks = ['颱風', '超大豪雨', '大豪雨', '豪雨', '大雨', '高溫', '低溫', '陸上強風', '濃霧'].map(p => severityOf(p).rank)
    expect(ranks).toEqual([8, 7, 7, 6, 5, 4, 3, 2, 1])
  })
  it('gives heat its own colour, apart from the rain colours', () => {
    const heat = severityOf('高溫').color
    expect(heat).toBe('#9c4221')
    expect(['颱風', '大豪雨', '豪雨', '大雨', '低溫', '強風', '濃霧'].map(p => severityOf(p).color)).not.toContain(heat)
  })
  it('falls back to grey for unknown kinds', () => {
    expect(severityOf('長浪')).toEqual({ rank: 0, color: '#868e96' })
  })
})
```

`describe('worstByCounty', …)` 內，第一個 `it` 之後加：

```ts
  it('puts heat below rain and above cold', () => {
    const hot = (countyCode: string, county: string) => w(countyCode, county, '高溫', { significance: '資訊', level: '黃色燈號' })
    const m = worstByCounty([hot('63000', '臺北市'), w('63000', '臺北市', '大雨'), w('10002', '宜蘭縣', '低溫'), hot('10002', '宜蘭縣')])
    expect(m.get('63000')).toEqual(severityOf('大雨'))
    expect(m.get('10002')).toEqual(severityOf('高溫'))
  })
```

`describe('countyFilter', …)` 的 `w('10015', '花蓮縣', '高溫')` 改為 `w('10015', '花蓮縣', '長浪')`（高溫已不是未知種類）。

`describe('countyRank', …)` 的 `['match', ['get', 'COUNTYCODE'], '10002', 4, '10015', 5, 0]` 改為 `['match', ['get', 'COUNTYCODE'], '10002', 5, '10015', 6, 0]`。

`describe('groupByKind', …)` 內 `expect(groups[1].color).toBe(severityOf('大雨').color)` 之後加一行，並在該 `describe` 結尾的 `})` 之前加上燈號測試；`describe('groupByKind', …)` 之後新增兩個 `describe`。改完後這一段為：

```ts
    expect(groups[1].color).toBe(severityOf('大雨').color)
    expect(groups[1].kind).toBe('大雨特報')
  })

  const heat = (countyCode: string, county: string, level: string) =>
    w(countyCode, county, '高溫', { significance: '資訊', level, towns: ['某區'] })
  const lit = groupByKind([
    heat('63000', '臺北市', '黃色燈號'),
    w('10002', '宜蘭縣', '低溫'),
    heat('67000', '臺南市', '紅色燈號'),
    heat('65000', '新北市', '橙色燈號'),
    heat('63000', '臺北市', '橙色燈號'),
  ])
  it('splits heat by level, highest light first, and keeps the kind without the level', () => {
    expect(lit.map(g => g.title)).toEqual(['高溫資訊・紅色燈號', '高溫資訊・橙色燈號', '高溫資訊・黃色燈號', '低溫特報'])
    expect(lit[1].items.map(i => i.county)).toEqual(['臺北市', '新北市'])
    expect(lit.slice(0, 3).map(g => g.kind)).toEqual(['高溫資訊', '高溫資訊', '高溫資訊'])
  })
})

describe('textsByGroup', () => {
  const text = (kind: string): WarningText => ({ kind, issued: null, text: kind })
  it('gives each text to the first group of its kind only', () => {
    const groups = groupByKind([
      w('63000', '臺北市', '高溫', { significance: '資訊', level: '黃色燈號' }),
      w('65000', '新北市', '高溫', { significance: '資訊', level: '橙色燈號' }),
      w('10002', '宜蘭縣', '大雨'),
      w('10015', '花蓮縣', '濃霧'),
    ])
    const m = textsByGroup(groups, [text('高溫資訊'), text('大雨特報'), text('颱風警報')])
    expect([...m.keys()]).toEqual(['大雨特報', '高溫資訊・橙色燈號'])
    expect(m.get('高溫資訊・橙色燈號')!.kind).toBe('高溫資訊')
  })
})

describe('textSummary', () => {
  it('shows when the text was issued', () => {
    expect(textSummary({ kind: '高溫資訊', issued: '2026-09-27T07:30:00+08:00', text: '' })).toBe('全文 · 9/27 07:30 發布')
    expect(textSummary({ kind: '大雨特報', issued: null, text: '' })).toBe('全文')
  })
})
```

`describe('badgeText', …)` 內 `…toBe('⚠ 2 則特報')` 那行之後加：

```ts
    expect(badgeText(groupByKind([w('63000', '臺北市', '高溫', { significance: '資訊', level: '黃色燈號' })]))).toBe('⚠ 高溫資訊・黃色燈號 · 1 縣市')
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run frontend/src/lib/warnings.test.ts`
Expected: FAIL — rank 仍是舊值、`高溫` 為灰色、`textsByGroup is not a function`、`kind` 為 `undefined`。

- [ ] **Step 3：實作**

`frontend/src/lib/warnings.ts` 第 2 行改為：

```ts
import type { Warning, WarningText } from '../../../shared/types'
```

`LEVELS` 的前五項換成：

```ts
const LEVELS: [keyword: string, severity: Severity][] = [
  ['颱風', { rank: 8, color: '#c2255c' }],
  ['大豪雨', { rank: 7, color: '#e03131' }],
  ['豪雨', { rank: 6, color: '#f76707' }],
  ['大雨', { rank: 5, color: '#fcc419' }],
  // 高溫各燈號共用一色，避開雨的黃、橙、紅
  ['高溫', { rank: 4, color: '#9c4221' }],
  ['低溫', { rank: 3, color: '#7048e8' }],
```

（`強風`、`濃霧` 兩項與結尾 `]` 不變。）

把 `export interface WarningGroup …` 到 `groupByKind` 結尾換成：

```ts
/** kind 為種類＋等級（例：大雨特報、高溫資訊），對應全文；title 另加燈號（例：高溫資訊・黃色燈號） */
export interface WarningGroup { title: string; kind: string; color: string; rank: number; items: Warning[] }

// 燈號由高到低；沒有燈號的排最後
const LIGHTS = ['紅色', '橙色', '黃色']
const lightOrder = (level: string | null) => {
  const i = LIGHTS.findIndex(l => level?.startsWith(l))
  return i < 0 ? LIGHTS.length : i
}

/** 依種類與燈號分組，嚴重者在前、同種類燈號高者在前；組內依縣市代碼排序 */
export function groupByKind(list: Warning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>()
  for (const w of list) {
    const kind = w.phenomena + w.significance
    const title = w.level ? `${kind}・${w.level}` : kind
    const g = groups.get(title) ?? { title, kind, ...severityOf(w.phenomena), items: [] }
    g.items.push(w)
    groups.set(title, g)
  }
  return [...groups.values()]
    .map(g => ({ ...g, items: [...g.items].sort((a, b) => a.countyCode.localeCompare(b.countyCode)) }))
    .sort((a, b) => b.rank - a.rank || lightOrder(a.items[0].level) - lightOrder(b.items[0].level) || a.title.localeCompare(b.title))
}

/** 每則全文只配給同種類的第一組（最嚴重者），同一段文字不重複出現；回傳 title → 全文 */
export function textsByGroup(groups: WarningGroup[], texts: WarningText[]): Map<string, WarningText> {
  const byKind = new Map(texts.map(t => [t.kind, t]))
  const out = new Map<string, WarningText>()
  for (const g of groups) {
    const t = byKind.get(g.kind)
    if (!t) continue
    out.set(g.title, t)
    byKind.delete(g.kind)
  }
  return out
}

/** 全文摺疊列的文字：「全文 · 9/27 07:30 發布」，沒有發布時間只寫「全文」 */
export function textSummary(t: WarningText): string {
  return t.issued ? `全文 · ${fmtMD(t.issued.slice(0, 10))} ${t.issued.slice(11, 16)} 發布` : '全文'
}
```

- [ ] **Step 4：確認通過**

Run: `npx vitest run frontend/src/lib/warnings.test.ts && npm test && npm run typecheck`
Expected: warnings 測試 20 個全過；全部 228 個測試通過；型別檢查無錯誤。

- [ ] **Step 5：Commit**

```bash
git add frontend/src/lib/warnings.ts frontend/src/lib/warnings.test.ts
git commit -F - <<'EOF'
feat(web): rank heat info and pair warning texts with groups

高溫資訊排在大雨與低溫之間，各燈號共用鐵鏽棕 #9c4221，避開雨的
黃、橙、紅；其餘種類的 rank 順移。分組標題帶上燈號（高溫資訊・黃色
燈號），同種類燈號高者在前，並保留不含燈號的 kind 對應全文。
textsByGroup 讓每則全文只出現在同種類的第一組。

Heat information ranks between heavy rain and cold, with one rust colour
(#9c4221) for every light level so it does not clash with the yellow,
orange and red of the rain warnings; the other ranks shift up. Group
titles carry the light level, higher lights come first, and each group
keeps its kind without the level to find its text. textsByGroup shows
each text only under the first group of its kind.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5：特報卡片的鄉鎮列與全文、README

**Files:**
- Modify: `frontend/src/api.ts`（import，新增 `useWarningTexts`）
- Modify: `frontend/src/components/WarningCard.tsx`（整檔）
- Modify: `frontend/src/styles.css`（`.warning-group li` 一行換成七行）
- Modify: `README.md`、`docs/screenshots/warning.png`

**Interfaces:**
- Consumes: Task 3 的 `GET /api/warning-texts`；Task 4 的 `groupByKind`、`textsByGroup`、`textSummary`
- Produces: `useWarningTexts()`（`queryKey: ['warning-texts']`，`refetchInterval` 10 分鐘）

- [ ] **Step 1：API hook**

`frontend/src/api.ts` 第 6–8 行 import 改為：

```ts
import type {
  ApiResponse, Bounds, Earthquake, ForecastGrid, Observation, RadarFrame, RadarFrames, SatelliteOverlay, Town, TownForecast, Typhoon, Warning,
  WarningText,
} from '../../shared/types'
```

在 `useWarnings` 之後新增：

```ts

// 只有特報卡片會用到全文
export const useWarningTexts = () =>
  useQuery({ queryKey: ['warning-texts'], queryFn: () => get<WarningText[]>('/api/warning-texts'), refetchInterval: TEN_MIN })
```

- [ ] **Step 2：卡片**

`frontend/src/components/WarningCard.tsx` 整檔換成：

```tsx
import { useWarningTexts, useWarnings } from '../api'
import { fmtValid, groupByKind, textSummary, textsByGroup } from '../lib/warnings'

export default function WarningCard() {
  const q = useWarnings()
  const groups = groupByKind(q.data?.data ?? [])
  const texts = textsByGroup(groups, useWarningTexts().data?.data ?? [])
  return (
    <aside className="card glass" aria-label="天氣特報">
      <header><h2>⚠️ 天氣特報</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入特報資料，請稍後再試。</p>}
      {q.data && groups.length === 0 && <p className="muted">目前無天氣特報</p>}
      {groups.map(g => {
        const text = texts.get(g.title)
        return (
          <section key={g.title} className="warning-group">
            <h3><span className="dot" style={{ background: g.color }} />{g.title}</h3>
            <ul>
              {g.items.map(w => (
                <li key={w.countyCode}>
                  <span>{w.county}</span>
                  <span className="muted">{fmtValid(w.start, w.end)}</span>
                  {w.towns && <span className="towns muted">{w.towns.join('、')}</span>}
                </li>
              ))}
            </ul>
            {text && (
              <details className="warning-text">
                <summary>{textSummary(text)}</summary>
                <p>{text.text}</p>
              </details>
            )}
          </section>
        )
      })}
    </aside>
  )
}
```

- [ ] **Step 3：樣式**

`frontend/src/styles.css` 的

```css
.warning-group li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; font-size: 13px; }
```

換成：

```css
.warning-group li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 8px; padding: 4px 0; font-size: 13px; }
.warning-group .towns { flex-basis: 100%; font-size: 12px; }
.warning-text summary { display: flex; align-items: center; gap: 8px; padding: 6px 0 2px; font-size: 13px; cursor: pointer; list-style: none; }
.warning-text summary::-webkit-details-marker { display: none; }
.warning-text summary::before { content: '▸'; width: 10px; color: var(--muted); }
.warning-text[open] > summary::before { content: '▾'; }
.warning-text p { margin: 4px 0 0; font-size: 13px; line-height: 1.7; white-space: pre-line; }
```

- [ ] **Step 4：確認型別與測試**

Run: `npm test && npm run typecheck`
Expected: 228 個測試通過；型別檢查無錯誤。

- [ ] **Step 5：Commit 程式**

```bash
git add frontend/src/api.ts frontend/src/components/WarningCard.tsx frontend/src/styles.css
git commit -F - <<'EOF'
feat(web): show towns and full text in the warning card

特報卡片在高溫資訊的縣市下方多一行列出鄉鎮，每組特報下方有預設
收合的「全文 · 發布時間」，點開顯示 CWA 原文並保留換行。全文由新的
useWarningTexts 取得，只在特報卡片呼叫；載入中、失敗或找不到對應
全文時只是不顯示，特報清單照常。

The warning card lists the affected towns under each county with heat
information, and each group gets a collapsed "full text" row with the
issue time that opens the CWA text with its line breaks. The text comes
from the new useWarningTexts, called only by the warning card; while it
loads, fails or has no match, the row is simply left out and the list
still shows.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 6：headless Chrome 實測**

背景啟動 `npx vite --config frontend/vite.config.ts --port 5174 --strictPort`，確認 `curl -s http://localhost:5174/api/warnings` 與 `curl -s http://localhost:5174/api/warning-texts` 都有回應（第一次請求會觸發本機舊 DB 的遷移並重抓）。

把 headless 工具存成 `.superpowers/sdd/2026-09-27-warning-text/cdp.mjs`（workspace，git 不追蹤），內容與 `docs/superpowers/plans/2026-09-27-typhoon-timeline.md` Task 3 Step 7 的 `cdp.mjs` 相同，用下面的指令從該檔取出第一個 `js` 程式區塊：

```bash
mkdir -p .superpowers/sdd/2026-09-27-warning-text
sed -n '/^```js$/,/^```$/p' docs/superpowers/plans/2026-09-27-typhoon-timeline.md \
  | awk '/^```js$/{n++; next} /^```$/{next} n==1' > .superpowers/sdd/2026-09-27-warning-text/cdp.mjs
```

用法：`node cdp.mjs <url> <out.png|-> <width> <height> <dpr> [script.js]`（不需要檢查腳本時省略最後一個參數，不要傳 `-`）。

同一目錄存 `verify-groups.js`：

```js
document.querySelectorAll('.warning-text').forEach(d => { d.open = true })
await sleep(300)
return {
  badge: [...document.querySelectorAll('.badge.alert')].map(b => b.textContent),
  groups: [...document.querySelectorAll('.warning-group')].map(s => ({
    title: s.querySelector('h3').textContent,
    counties: [...s.querySelectorAll('li > span:first-child')].map(e => e.textContent).join(' '),
    towns: s.querySelector('.towns')?.textContent ?? null,
    text: s.querySelector('.warning-text summary')?.textContent ?? null,
    head: s.querySelector('.warning-text p')?.innerText.slice(0, 12) ?? null,
  })),
  fill: map.getLayer('warning-fill') ? map.getPaintProperty('warning-fill', 'fill-color') : null,
}
```

與 `light.js`（切到淺色底圖）：

```js
document.querySelector('.basemap-toggle').click()
await sleep(300)
;[...document.querySelectorAll('.basemap-menu button')].find(b => b.textContent.includes('淺色')).click()
await sleep(5000)
return { badge: [...document.querySelectorAll('.badge.alert')].map(b => b.textContent) }
```

**若實測時 CWA 沒有發布中的高溫資訊或特報**（例如已過當天 17:00），暫時把 `api/warnings.ts` 與 `api/warning-texts.ts` 換成下面的 fixture 替身（不提交），並**重啟 dev server**（Vite 不會重新載入 `frontend/` 以外被改動的 api 模組）：

```ts
// api/warnings.ts 暫時替身（不提交）：以 fixture 模擬縣市特報加高溫資訊
import { json } from '../server/http.js'
import { fixture } from '../server/__fixtures__/load.js'
import { parseHeat, parseWarnings } from '../server/cwa/parse.js'

const AT = '2026-09-27T04:00:00.000Z'

export async function GET(): Promise<Response> {
  return json({ data: [...parseWarnings(fixture('W-C0033-001.json')), ...parseHeat(fixture('W-C0033-005.json'), AT)], updatedAt: AT, stale: false })
}
```

```ts
// api/warning-texts.ts 暫時替身（不提交）：以 fixture 模擬特報全文加高溫全文
import { json } from '../server/http.js'
import { fixture } from '../server/__fixtures__/load.js'
import { parseHeatText, parseWarningTexts } from '../server/cwa/parse.js'

const AT = '2026-09-27T04:00:00.000Z'

export async function GET(): Promise<Response> {
  return json({ data: [...parseWarningTexts(fixture('W-C0033-002.json')), ...parseHeatText(fixture('W-C0033-005.json'), AT)], updatedAt: AT, stale: false })
}
```

在 `.superpowers/sdd/2026-09-27-warning-text/` 執行並逐張看截圖：

```bash
node cdp.mjs "http://localhost:5174/?layer=warning" v-warning.png 1440 900 1 verify-groups.js
node cdp.mjs "http://localhost:5174/?layer=warning" v-warning-light.png 1440 900 1 light.js
node cdp.mjs "http://localhost:5174/?layer=temp" v-temp.png 1440 900 1 light.js
node cdp.mjs "http://localhost:5174/?layer=warning" v-phone-warning.png 390 664 2 verify-groups.js
node cdp.mjs "http://localhost:5174/?layer=temp" v-phone-temp.png 390 664 2
```

Expected（以 fixture 替身為例；真實資料時縣市與時間不同，但規則一樣）：

- `verify-groups.js` 的 `groups` 依序為 `豪雨特報`（花蓮縣，無全文）→ `大雨特報`（宜蘭縣 臺北市，`全文 · 9/25 08:30 發布`，開頭「海上陸上颱風警報第5報。」）→ `高溫資訊・黃色燈號`（7 縣市，`towns` 為「文山區、大安區、中正區、萬華區」，`全文 · 9/27 07:30 發布`）→ `陸上強風特報` → `濃霧特報`；後兩組 `text` 為 `null`
- `fill` 中高溫縣市為 `#9c4221`；臺北市同時有大雨與高溫，顯示大雨的 `#fcc419`
- `v-warning.png`（深色）與 `v-warning-light.png`（淺色）：高溫縣市的鐵鏽棕與豪雨的橙、大雨的黃都分得開
- `v-temp.png`：高溫縣市有鐵鏽棕描邊，與溫度色階分得開；徽章為 `⚠ N 則特報`（替身）或 `⚠ 高溫資訊・黃色燈號 · N 縣市`（只有高溫資訊時）
- 手機 390×664：卡片中鄉鎮列在縣市下方換行、不擠到時間欄；徽章一行放得下、不遮住搜尋框

- [ ] **Step 7：README 與截圖**

用 fixture 替身（Step 6）截新的 `docs/screenshots/warning.png`，大雨特報的全文展開：

```bash
cat > .superpowers/sdd/2026-09-27-warning-text/open-rain.js <<'EOF'
document.querySelector('.warning-text').open = true
await sleep(300)
return null
EOF
node .superpowers/sdd/2026-09-27-warning-text/cdp.mjs "http://localhost:5174/?layer=warning" docs/screenshots/warning.png 1440 900 1 .superpowers/sdd/2026-09-27-warning-text/open-rain.js
```

`README.md` 修改：

1. 第 35 行表頭 `特報（縣市依最嚴重種類著色，資訊卡依種類列出縣市與有效時間）` 改為 `特報（縣市依最嚴重種類著色，資訊卡依種類列出縣市與有效時間，可展開 CWA 全文）`
2. 第 39 行改為 `特報兩張圖為示意，以測試資料模擬宜蘭、花蓮、臺北、連江的特報；特報圖另加 2026-09-27 的高溫資訊。`
3. 第 58 行 `（颱風警報、大豪雨、豪雨、大雨、低溫、強風、濃霧），資訊卡依種類列出縣市與有效時間；` 改為 `（颱風警報、大豪雨、豪雨、大雨、高溫、低溫、強風、濃霧），資訊卡依種類列出縣市與有效時間，高溫資訊依燈號分組並列出鄉鎮，每種特報可展開 CWA 發布的全文；`
4. 第 85 行 `typhoon · warnings · earthquakes` 改為 `typhoon · warnings · warning-texts · earthquakes`
5. 第 102 行 `W-C0033-001 縣市特報` 改為 `W-C0033-001 縣市特報<br/>W-C0033-002 特報全文<br/>W-C0033-005 高溫資訊`
6. 第 169 行 `| 特報 | 10 分鐘 | 10 分鐘 |` 改為 `| 特報（含高溫資訊與全文） | 10 分鐘 | 10 分鐘 |`
7. 第 252 行 `| \`GET /api/warnings\` | 發布中的縣市天氣特報 |` 改為 `| \`GET /api/warnings\` | 發布中的縣市天氣特報（含高溫資訊） |`，並在其後新增一行 `| \`GET /api/warning-texts\` | 特報全文（含高溫資訊的說明與注意事項） |`

還原 `api/warnings.ts`、`api/warning-texts.ts`（`git checkout -- api/warnings.ts api/warning-texts.ts`），`git status` 確認只剩 README 與截圖變動，停掉 dev server（`pkill -f "vite --config frontend/vite.config.ts --port 5174"`，exit 144 為正常）。

- [ ] **Step 8：Commit 文件**

```bash
git add README.md docs/screenshots/warning.png
git commit -F - <<'EOF'
docs: describe warning text and heat info in readme

README 的特報說明加上高溫資訊與可展開的全文，資料集、API 路由、
快取表格補上 W-C0033-002、W-C0033-005 與 /api/warning-texts；特報
截圖改為加上高溫資訊、大雨特報全文展開的畫面。

The README's warning section now covers heat information and the
expandable full text, the dataset, route and cache tables list
W-C0033-002, W-C0033-005 and /api/warning-texts, and the warning
screenshot shows heat information with the heavy-rain text open.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```
