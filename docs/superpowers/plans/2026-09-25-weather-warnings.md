# 天氣特報圖層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第九個互斥圖層「特報」，把 CWA `W-C0033-001` 發布中的縣市天氣特報依最嚴重種類為縣市著色，附資訊卡，並在任何圖層都以左上角徽章提示目前有特報。

**Architecture:** 後端沿用 `ensureFresh → sync → repo → SQLite` 管線，新增 `warnings` 表（每則特報一列）與 `/api/warnings`。前端純函式（`lib/warnings.ts`）負責嚴重度、分組與文字；`WarningLayer` 以縣市多邊形上色，`WarningCard` 佔用既有 `.card` 位置，`WarningBadge` 常駐左上角。

**Tech Stack:** TypeScript、better-sqlite3、Vitest、React 19、MapLibre GL 6、TanStack Query。

**Spec:** `docs/superpowers/specs/2026-09-25-weather-warnings-design.md`

**Commit 規則：** 每個 commit 用 `commit-message` skill 的格式（英文 subject＋中英雙語 body，不加 trailer）。每個 Task 最後一步已附上完整訊息，用 `git commit -F -` 搭配 heredoc 提交。

**測試指令：** `npm test`（Vitest 一次跑完 server 與 frontend）、`npm run typecheck`。單檔可用 `npx vitest run <path>`。

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `shared/types.ts` | 修改 | `Warning` 型別 |
| `server/cwa/parse.ts` | 修改 | `toCountyCode`、`toTaipeiIso`、`parseWarnings` |
| `server/__fixtures__/W-C0033-001.json` | 新增 | 依欄位定義手寫的 fixture（4 個縣市有特報） |
| `server/cwa/parse.test.ts` | 修改 | 解析測試 |
| `server/db.ts` | 修改 | `warnings` 表 |
| `server/repo.ts` | 修改 | `replaceWarnings`、`listWarnings` |
| `server/repo.test.ts` | 修改 | repo 測試 |
| `server/sync.ts` | 修改 | `syncWarnings` |
| `server/sync.test.ts` | 修改 | 同步測試 |
| `server/freshness.ts` | 修改 | `TTL.warnings` |
| `server/service.ts` | 修改 | `getWarnings` |
| `api/warnings.ts` | 新增 | `GET /api/warnings` |
| `scripts/build-db.ts` | 修改 | 種子 DB 一併抓特報 |
| `frontend/src/lib/warnings.ts` | 新增 | 純函式：`severityOf`、`worstByCounty`、`groupByKind`、`badgeText`、`fmtValid` |
| `frontend/src/lib/warnings.test.ts` | 新增 | 純函式測試 |
| `frontend/src/lib/layers.ts` | 修改 | `warning` 圖層 |
| `frontend/src/api.ts` | 修改 | `useWarnings` |
| `frontend/src/components/StatusBadge.tsx` | 修改 | 特報圖層的更新時間 |
| `frontend/src/components/WarningLayer.tsx` | 新增 | 縣市著色 |
| `frontend/src/components/DataLayers.tsx` | 修改 | 掛上 `WarningLayer` |
| `frontend/src/components/WarningCard.tsx` | 新增 | 資訊卡 |
| `frontend/src/components/WarningBadge.tsx` | 新增 | 左上角徽章 |
| `frontend/src/App.tsx` | 修改 | 特報圖層顯示 `WarningCard`；掛上 `WarningBadge` |
| `frontend/src/styles.css` | 修改 | 徽章、資訊卡樣式 |
| `README.md` | 修改 | 功能、架構圖、TTL 表、API 表 |

---

### Task 1：型別、解析與 fixture

**Files:**
- Modify: `shared/types.ts`（檔尾）
- Create: `server/__fixtures__/W-C0033-001.json`
- Modify: `server/cwa/parse.ts`
- Test: `server/cwa/parse.test.ts`

- [ ] **Step 1：新增型別**

在 `shared/types.ts` 檔尾加：

```ts
export interface Warning {
  /** 5 碼，對應 taiwan-atlas COUNTYCODE */
  countyCode: string
  county: string
  /** 例：大雨、豪雨、陸上強風 */
  phenomena: string
  /** 例：特報、警報 */
  significance: string
  /** +08:00 ISO；CWA 未提供時為 null */
  start: string | null
  end: string | null
}
```

- [ ] **Step 2：手寫 fixture**

當日 CWA 沒有任何特報，`hazards` 全空，無法抓真實資料。依 `result.fields`（`phenomena`、`significance`、`startTime`、`endTime`、`language`）與已驗證的巢狀結構手寫 `server/__fixtures__/W-C0033-001.json`。22 個縣市與 `geocode` 皆為 2026-09-25 實際回應的值；宜蘭縣兩則（兩種時間格式各一）、花蓮縣、臺北市（geocode 63）、連江縣（geocode 9007，無結束時間）各一則：

```json
{
  "success": "true",
  "result": {
    "resource_id": "W-C0033-001",
    "fields": [
      { "id": "locationName", "type": "String" },
      { "id": "geocode", "type": "Double" },
      { "id": "language", "type": "String" },
      { "id": "phenomena", "type": "String" },
      { "id": "significance", "type": "String" },
      { "id": "startTime", "type": "Timestamp" },
      { "id": "endTime", "type": "Timestamp" }
    ]
  },
  "records": {
    "location": [
      { "locationName": "宜蘭縣", "geocode": 10002, "hazardConditions": { "hazards": [
        { "info": { "language": "zh-TW", "phenomena": "大雨", "significance": "特報" },
          "validTime": { "startTime": "2026-09-25 05:30:00", "endTime": "2026-09-25 17:30:00" } },
        { "info": { "language": "zh-TW", "phenomena": "陸上強風", "significance": "特報" },
          "validTime": { "startTime": "2026-09-25T00:00:00+08:00", "endTime": "2026-09-26T06:00:00+08:00" } }
      ] } },
      { "locationName": "花蓮縣", "geocode": 10015, "hazardConditions": { "hazards": [
        { "info": { "language": "zh-TW", "phenomena": "豪雨", "significance": "特報" },
          "validTime": { "startTime": "2026-09-25 05:30:00", "endTime": "2026-09-25 17:30:00" } }
      ] } },
      { "locationName": "臺北市", "geocode": 63, "hazardConditions": { "hazards": [
        { "info": { "language": "zh-TW", "phenomena": "大雨", "significance": "特報" },
          "validTime": { "startTime": "2026-09-25 05:30:00", "endTime": "2026-09-25 17:30:00" } }
      ] } },
      { "locationName": "連江縣", "geocode": 9007, "hazardConditions": { "hazards": [
        { "info": { "language": "zh-TW", "phenomena": "濃霧", "significance": "特報" },
          "validTime": { "startTime": "2026-09-25 06:00:00", "endTime": "" } }
      ] } },
      { "locationName": "嘉義縣", "geocode": 10010, "hazardConditions": { "hazards": [] } },
      { "locationName": "彰化縣", "geocode": 10007, "hazardConditions": { "hazards": [] } },
      { "locationName": "高雄市", "geocode": 64, "hazardConditions": { "hazards": [] } },
      { "locationName": "新北市", "geocode": 65, "hazardConditions": { "hazards": [] } },
      { "locationName": "金門縣", "geocode": 9020, "hazardConditions": { "hazards": [] } },
      { "locationName": "新竹市", "geocode": 10018, "hazardConditions": { "hazards": [] } },
      { "locationName": "嘉義市", "geocode": 10020, "hazardConditions": { "hazards": [] } },
      { "locationName": "雲林縣", "geocode": 10009, "hazardConditions": { "hazards": [] } },
      { "locationName": "南投縣", "geocode": 10008, "hazardConditions": { "hazards": [] } },
      { "locationName": "臺南市", "geocode": 67, "hazardConditions": { "hazards": [] } },
      { "locationName": "臺中市", "geocode": 66, "hazardConditions": { "hazards": [] } },
      { "locationName": "基隆市", "geocode": 10017, "hazardConditions": { "hazards": [] } },
      { "locationName": "澎湖縣", "geocode": 10016, "hazardConditions": { "hazards": [] } },
      { "locationName": "桃園市", "geocode": 68, "hazardConditions": { "hazards": [] } },
      { "locationName": "苗栗縣", "geocode": 10005, "hazardConditions": { "hazards": [] } },
      { "locationName": "屏東縣", "geocode": 10013, "hazardConditions": { "hazards": [] } },
      { "locationName": "新竹縣", "geocode": 10004, "hazardConditions": { "hazards": [] } },
      { "locationName": "臺東縣", "geocode": 10014, "hazardConditions": { "hazards": [] } }
    ]
  }
}
```

- [ ] **Step 3：寫解析測試（先失敗）**

`server/cwa/parse.test.ts` 的 import 加上 `parseWarnings`：

```ts
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseTyphoons, parseWarnings,
} from './parse.js'
```

檔尾加：

```ts
describe('parseWarnings', () => {
  const list = parseWarnings(fixture('W-C0033-001.json'))

  it('emits one row per hazard and skips counties without hazards', () => {
    expect(list).toHaveLength(5)
    expect(list.filter(w => w.county === '宜蘭縣').map(w => w.phenomena)).toEqual(['大雨', '陸上強風'])
  })

  it('pads geocodes to 5-digit county codes', () => {
    expect(list.find(w => w.county === '臺北市')!.countyCode).toBe('63000')
    expect(list.find(w => w.county === '連江縣')!.countyCode).toBe('09007')
    expect(list.find(w => w.county === '宜蘭縣')!.countyCode).toBe('10002')
  })

  it('normalises both time formats to +08:00 ISO and keeps a missing end null', () => {
    const [rain, wind] = list.filter(w => w.county === '宜蘭縣')
    expect(rain).toEqual({
      countyCode: '10002', county: '宜蘭縣', phenomena: '大雨', significance: '特報',
      start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00',
    })
    expect(wind.start).toBe('2026-09-25T00:00:00+08:00')
    expect(wind.end).toBe('2026-09-26T06:00:00+08:00')
    expect(list.find(w => w.county === '連江縣')!.end).toBeNull()
  })

  it('returns an empty list when no county has hazards', () => {
    const quiet = { records: { location: [{ locationName: '宜蘭縣', geocode: 10002, hazardConditions: { hazards: [] } }] } }
    expect(parseWarnings(quiet)).toEqual([])
    expect(parseWarnings({ records: {} })).toEqual([])
  })
})
```

- [ ] **Step 4：跑測試確認失敗**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: FAIL，錯誤為 `parseWarnings` 不是 export（`SyntaxError` 或 `is not a function`）。

- [ ] **Step 5：實作解析**

`server/cwa/parse.ts` 的型別 import 加上 `Warning`：

```ts
import type { Bounds, ForecastSlot, ImageKind, ImageOverlay, Town, Typhoon, TyphoonFix, Warning, WeekSlot } from '../../shared/types.js'
```

檔尾加：

```ts
/** CWA 縣市代碼是數字：直轄市 2 碼（63～68）右補零、其餘左補零，對齊 taiwan-atlas 的 5 碼 COUNTYCODE */
export function toCountyCode(geocode: unknown): string {
  const s = String(geocode)
  return s.length <= 2 ? s.padEnd(5, '0') : s.padStart(5, '0')
}

/** 特報時間可能是 `YYYY-MM-DD HH:mm:ss` 或 ISO，統一成 +08:00 ISO；空白或無法辨識為 null */
export function toTaipeiIso(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/.exec(s.trim())
  return m ? `${m[1]}T${m[2]}:${m[3] ?? '00'}+08:00` : null
}

export function parseWarnings(json: any): Warning[] {
  const out: Warning[] = []
  for (const loc of json.records?.location ?? []) {
    for (const h of loc.hazardConditions?.hazards ?? []) {
      const phenomena = h.info?.phenomena
      if (!phenomena) continue
      out.push({
        countyCode: toCountyCode(loc.geocode),
        county: loc.locationName,
        phenomena,
        significance: h.info?.significance || '特報',
        start: toTaipeiIso(h.validTime?.startTime),
        end: toTaipeiIso(h.validTime?.endTime),
      })
    }
  }
  return out
}
```

- [ ] **Step 6：跑測試確認通過**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: PASS（含既有測試）。

- [ ] **Step 7：型別檢查與提交**

Run: `npm run typecheck`
Expected: 無錯誤。

```bash
git add shared/types.ts server/cwa/parse.ts server/cwa/parse.test.ts server/__fixtures__/W-C0033-001.json
git commit -F - <<'EOF'
feat(api): parse county weather warnings

為特報圖層加入 W-C0033-001 的解析。CWA 給的縣市代碼是數
字，直轄市只有 2 碼、離島縣會掉前導零，對不上地圖用的 5
碼縣市代碼，依長度分別右補零與左補零；時間欄位同時接受空
白分隔與 ISO 兩種寫法。當日沒有任何特報可抓，fixture 依
欄位定義手寫，待實際發布時再用真實回應核對。

Add parsing of W-C0033-001 for the warnings layer. CWA sends
county codes as numbers, so special municipalities have only
two digits and offshore counties lose their leading zero,
neither matching the map's five-digit codes; pad right or left
by length. Accept both the space-separated and ISO time
formats. No warning was active today, so the fixture is
hand-written from the field definitions and must be checked
against a real response later.
EOF
```

---

### Task 2：儲存、同步、API

**Files:**
- Modify: `server/db.ts`
- Modify: `server/repo.ts`
- Modify: `server/sync.ts`
- Modify: `server/freshness.ts`
- Modify: `server/service.ts`
- Create: `api/warnings.ts`
- Modify: `scripts/build-db.ts`
- Test: `server/repo.test.ts`、`server/sync.test.ts`

- [ ] **Step 1：寫 repo 測試（先失敗）**

`server/repo.test.ts` 的 import 改成：

```ts
import {
  replaceObservations, listObservations, replaceForecasts, listTowns, getTownForecast,
  listGridTimes, getGrid, upsertImage, getImage, logFetch, getFetchedAt,
  replaceSatelliteTiles, listSatelliteTiles, getSatelliteTile, replaceWarnings, listWarnings,
} from './repo.js'
import type { Bounds } from '../shared/types.js'
import { parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseWarnings } from './cwa/parse.js'
```

檔尾加：

```ts
describe('warnings', () => {
  it('replaces the whole list and reads it back sorted by county then phenomena', () => {
    const list = parseWarnings(fixture('W-C0033-001.json'))
    replaceWarnings(db, [list[0]])
    replaceWarnings(db, list)
    const rows = listWarnings(db)
    expect(rows.map(w => `${w.countyCode} ${w.phenomena}`)).toEqual(['09007 濃霧', '10002 大雨', '10002 陸上強風', '10015 豪雨', '63000 大雨'])
    expect(rows[1]).toEqual({
      countyCode: '10002', county: '宜蘭縣', phenomena: '大雨', significance: '特報',
      start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00',
    })
    expect(rows[0].end).toBeNull()
  })
})
```

- [ ] **Step 2：寫同步測試（先失敗）**

`server/sync.test.ts` 的 import 改成：

```ts
import { syncObservations, syncForecast, syncImage, syncTyphoons, syncWarnings } from './sync.js'
import { listObservations, listTowns, getTownForecast, getImage, getFetchedAt, listSatelliteTiles, listTyphoons, listWarnings } from './repo.js'
```

檔尾加：

```ts
describe('syncWarnings', () => {
  const withWarnings = (json: unknown): Fetcher => ({
    async dataset(id) {
      if (id === 'W-C0033-001') return json
      throw new Error(`unexpected dataset ${id}`)
    },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
  })

  it('stores warnings and logs the fetch', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    expect(listWarnings(db)).toHaveLength(5)
    expect(getFetchedAt(db, 'warnings')).not.toBeNull()
  })

  it('clears old warnings when none are active', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    await syncWarnings(db, withWarnings({ success: 'true', records: { location: [] } }))
    expect(listWarnings(db)).toEqual([])
  })
})
```

- [ ] **Step 3：跑測試確認失敗**

Run: `npx vitest run server/repo.test.ts server/sync.test.ts`
Expected: FAIL，`replaceWarnings`／`syncWarnings` 不存在。

- [ ] **Step 4：加資料表**

`server/db.ts` 的 `SCHEMA`，在 `typhoons` 那行之後加：

```sql
CREATE TABLE IF NOT EXISTS warnings (
  county_code TEXT, county TEXT, phenomena TEXT, significance TEXT, start_time TEXT, end_time TEXT,
  PRIMARY KEY (county_code, phenomena, significance));
```

- [ ] **Step 5：repo**

`server/repo.ts` 的型別 import 加上 `Warning`：

```ts
import type { Bounds, ForecastSlot, GridCell, ImageKind, ImageOverlay, Observation, Town, TownForecast, Typhoon, Warning, WeekSlot } from '../shared/types.js'
```

在 `logFetch` 之前加（`end` 是 SQL 關鍵字，別名要加引號）：

```ts
export function replaceWarnings(db: DB, list: Warning[]): void {
  const insert = db.prepare(`INSERT OR REPLACE INTO warnings (county_code, county, phenomena, significance, start_time, end_time)
    VALUES (@countyCode, @county, @phenomena, @significance, @start, @end)`)
  db.transaction(() => {
    db.prepare('DELETE FROM warnings').run()
    for (const w of list) insert.run(w)
  })()
}

export function listWarnings(db: DB): Warning[] {
  return db.prepare(`SELECT county_code AS countyCode, county, phenomena, significance, start_time AS start, end_time AS "end"
    FROM warnings ORDER BY county_code, phenomena`).all() as Warning[]
}
```

- [ ] **Step 6：sync**

`server/sync.ts` 的 import 改成：

```ts
import { parseForecast3h, parseForecastWeek, parseImage, parseRainStations, parseTyphoons, parseWarnings, parseWeatherStations } from './cwa/parse.js'
import { logFetch, replaceForecasts, replaceObservations, replaceSatelliteTiles, replaceTyphoons, replaceWarnings, upsertImage } from './repo.js'
```

檔尾加：

```ts
// 無特報時 CWA 各縣市的 hazards 為空，照樣清空舊資料
export async function syncWarnings(db: DB, f: Fetcher = cwa): Promise<void> {
  replaceWarnings(db, parseWarnings(await f.dataset('W-C0033-001')))
  logFetch(db, 'warnings', now())
}
```

- [ ] **Step 7：TTL**

`server/freshness.ts` 的 `TTL` 加一行：

```ts
  typhoon: 30 * MIN,
  warnings: 10 * MIN,
```

- [ ] **Step 8：跑測試確認通過**

Run: `npx vitest run server`
Expected: PASS。

- [ ] **Step 9：service 與 API**

`server/service.ts` 的型別 import 加上 `Warning`，repo import 加上 `listWarnings`，sync import 加上 `syncWarnings`：

```ts
import type { ApiResponse, ForecastGrid, ImageOverlay, Observation, SatelliteOverlay, Town, TownForecast, Typhoon, Warning } from '../shared/types.js'
import {
  getGrid, getImage, getSatelliteTile, getTownForecast, listGridTimes, listObservations, listSatelliteTiles, listTowns, listTyphoons, listWarnings,
} from './repo.js'
import { syncForecast, syncImage, syncObservations, syncTyphoons, syncWarnings } from './sync.js'
```

檔尾加：

```ts
export async function getWarnings(): Promise<ApiResponse<Warning[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'warnings', () => syncWarnings(db))
  return { data: listWarnings(db), ...meta }
}
```

新增 `api/warnings.ts`：

```ts
import { handle, json } from '../server/http.js'
import { getWarnings } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getWarnings()))
}
```

- [ ] **Step 10：種子 DB**

`scripts/build-db.ts`：import 加上 `syncWarnings`，`steps` 加一項，筆數輸出加 `'warnings'`：

```ts
import { syncForecast, syncImage, syncObservations, syncTyphoons, syncWarnings } from '../server/sync.js'
```

```ts
  ['typhoon', () => syncTyphoons(db)],
  ['warnings', () => syncWarnings(db)],
]
```

```ts
console.log(Object.fromEntries(['stations', 'observations', 'towns', 'forecast_3h', 'forecast_week', 'images', 'satellite_tiles', 'typhoons', 'warnings'].map(t => [t, count(t)])))
```

- [ ] **Step 11：型別檢查、實際打 API、提交**

Run: `npm run typecheck`
Expected: 無錯誤。

Run: `npm run dev` 後另開終端 `curl -s localhost:5173/api/warnings`
Expected: `{"data":[],"updatedAt":"2026-…","stale":false}`（當日無特報；`updatedAt` 有值代表已成功向 CWA 抓過）。看完 `Ctrl+C` 關掉 dev server。

```bash
git add server/db.ts server/repo.ts server/repo.test.ts server/sync.ts server/sync.test.ts server/freshness.ts server/service.ts api/warnings.ts scripts/build-db.ts
git commit -F - <<'EOF'
feat(api): serve active weather warnings from sqlite

新增 warnings 表與 /api/warnings，走既有的 TTL 與退避管線；
特報每 10 分鐘重抓，CWA 沒有特報時各縣市清單為空，同步時
照樣清空舊資料，前端才不會留著已解除的特報。種子 DB 也一
併抓，冷啟動就有資料。

Add a warnings table and /api/warnings on the existing TTL and
backoff pipeline. Warnings refresh every 10 minutes; when CWA
reports none, every county list is empty and the sync still
clears old rows so lifted warnings do not linger. The seed DB
fetches them too, so cold starts have data.
EOF
```

---

### Task 3：前端純函式

**Files:**
- Create: `frontend/src/lib/warnings.ts`
- Test: `frontend/src/lib/warnings.test.ts`

- [ ] **Step 1：寫測試（先失敗）**

新增 `frontend/src/lib/warnings.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { badgeText, fmtValid, groupByKind, severityOf, worstByCounty } from './warnings'
import type { Warning } from '../../../shared/types'

const w = (countyCode: string, county: string, phenomena: string, extra: Partial<Warning> = {}): Warning => ({
  countyCode, county, phenomena, significance: '特報',
  start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00', ...extra,
})

describe('severityOf', () => {
  it('ranks by keyword, heaviest first', () => {
    const ranks = ['颱風', '超大豪雨', '大豪雨', '豪雨', '大雨', '低溫', '陸上強風', '濃霧'].map(p => severityOf(p).rank)
    expect(ranks).toEqual([7, 6, 6, 5, 4, 3, 2, 1])
  })
  it('falls back to grey for unknown kinds', () => {
    expect(severityOf('高溫')).toEqual({ rank: 0, color: '#868e96' })
  })
})

describe('worstByCounty', () => {
  it('keeps the most severe colour per county', () => {
    const m = worstByCounty([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '豪雨'), w('10015', '花蓮縣', '濃霧')])
    expect(m.get('10002')).toBe(severityOf('豪雨').color)
    expect(m.get('10015')).toBe(severityOf('濃霧').color)
    expect(m.size).toBe(2)
  })
})

describe('groupByKind', () => {
  const groups = groupByKind([
    w('10015', '花蓮縣', '大雨'),
    w('10002', '宜蘭縣', '陸上強風'),
    w('10002', '宜蘭縣', '大雨'),
    w('63000', '臺北市', '颱風', { significance: '警報' }),
  ])
  it('orders groups by severity and counties by code', () => {
    expect(groups.map(g => g.title)).toEqual(['颱風警報', '大雨特報', '陸上強風特報'])
    expect(groups[1].items.map(i => i.county)).toEqual(['宜蘭縣', '花蓮縣'])
    expect(groups[1].color).toBe(severityOf('大雨').color)
  })
})

describe('badgeText', () => {
  it('is null without warnings, names the kind when there is one, counts otherwise', () => {
    expect(badgeText([])).toBeNull()
    expect(badgeText(groupByKind([w('10002', '宜蘭縣', '大雨'), w('10015', '花蓮縣', '大雨')]))).toBe('⚠ 大雨特報 · 2 縣市')
    expect(badgeText(groupByKind([w('10002', '宜蘭縣', '大雨'), w('10015', '花蓮縣', '濃霧')]))).toBe('⚠ 2 則特報')
  })
})

describe('fmtValid', () => {
  it('formats same-day, cross-day and one-sided ranges', () => {
    expect(fmtValid('2026-09-25T05:30:00+08:00', '2026-09-25T17:30:00+08:00')).toBe('9/25 05:30 – 17:30')
    expect(fmtValid('2026-09-25T22:00:00+08:00', '2026-09-26T06:00:00+08:00')).toBe('9/25 22:00 – 9/26 06:00')
    expect(fmtValid('2026-09-25T06:00:00+08:00', null)).toBe('9/25 06:00 起')
    expect(fmtValid(null, '2026-09-25T06:00:00+08:00')).toBe('至 9/25 06:00')
    expect(fmtValid(null, null)).toBe('')
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/warnings.test.ts`
Expected: FAIL，找不到模組 `./warnings`。

- [ ] **Step 3：實作**

新增 `frontend/src/lib/warnings.ts`：

```ts
import type { Warning } from '../../../shared/types'
import { fmtMD } from './format'

export interface Severity { rank: number; color: string }

// 由重到輕；用包含比對，CWA 新增種類時退回灰色而不是壞掉
const LEVELS: [keyword: string, severity: Severity][] = [
  ['颱風', { rank: 7, color: '#c2255c' }],
  ['大豪雨', { rank: 6, color: '#e03131' }],
  ['豪雨', { rank: 5, color: '#f76707' }],
  ['大雨', { rank: 4, color: '#fcc419' }],
  ['低溫', { rank: 3, color: '#7048e8' }],
  ['強風', { rank: 2, color: '#228be6' }],
  ['濃霧', { rank: 1, color: '#adb5bd' }],
]
const OTHER: Severity = { rank: 0, color: '#868e96' }

export function severityOf(phenomena: string): Severity {
  return LEVELS.find(([k]) => phenomena.includes(k))?.[1] ?? OTHER
}

/** 每個縣市取最嚴重特報的顏色 */
export function worstByCounty(list: Warning[]): Map<string, string> {
  const best = new Map<string, Severity>()
  for (const w of list) {
    const s = severityOf(w.phenomena)
    if ((best.get(w.countyCode)?.rank ?? -1) < s.rank) best.set(w.countyCode, s)
  }
  return new Map([...best].map(([code, s]) => [code, s.color]))
}

export interface WarningGroup { title: string; color: string; rank: number; items: Warning[] }

/** 依種類分組（種類＋等級，例：大雨特報），嚴重者在前；組內依縣市代碼排序 */
export function groupByKind(list: Warning[]): WarningGroup[] {
  const groups = new Map<string, WarningGroup>()
  for (const w of list) {
    const title = w.phenomena + w.significance
    const g = groups.get(title) ?? { title, ...severityOf(w.phenomena), items: [] }
    g.items.push(w)
    groups.set(title, g)
  }
  return [...groups.values()]
    .map(g => ({ ...g, items: [...g.items].sort((a, b) => a.countyCode.localeCompare(b.countyCode)) }))
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title))
}

/** 左上角徽章文字；無特報回傳 null */
export function badgeText(groups: WarningGroup[]): string | null {
  if (groups.length === 0) return null
  if (groups.length === 1) return `⚠ ${groups[0].title} · ${groups[0].items.length} 縣市`
  return `⚠ ${groups.length} 則特報`
}

/** 有效時間：同日「9/25 05:30 – 17:30」，跨日結束也帶日期；缺任一端只寫有的那端 */
export function fmtValid(start: string | null, end: string | null): string {
  const day = (iso: string) => fmtMD(iso.slice(0, 10))
  const clock = (iso: string) => iso.slice(11, 16)
  if (start && end) {
    const sameDay = start.slice(0, 10) === end.slice(0, 10)
    return `${day(start)} ${clock(start)} – ${sameDay ? '' : `${day(end)} `}${clock(end)}`
  }
  if (start) return `${day(start)} ${clock(start)} 起`
  if (end) return `至 ${day(end)} ${clock(end)}`
  return ''
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run frontend/src/lib/warnings.test.ts`
Expected: PASS。

- [ ] **Step 5：型別檢查與提交**

Run: `npm run typecheck`
Expected: 無錯誤。

```bash
git add frontend/src/lib/warnings.ts frontend/src/lib/warnings.test.ts
git commit -F - <<'EOF'
feat(web): add warning severity and grouping helpers

特報圖層要把每個縣市畫成最嚴重的那種顏色、資訊卡要依種類
分組，徽章與有效時間也有固定文字格式。這些都與地圖無關，
先做成純函式並以測試固定行為。嚴重度用關鍵字包含比對，CWA
新增種類時退回灰色而不是壞掉。

The warnings layer colours each county by its most severe
warning, the card groups warnings by kind, and the badge and
validity range have fixed wording. None of that depends on the
map, so build them as pure functions pinned by tests. Severity
uses keyword matching so a new CWA kind falls back to grey
instead of breaking.
EOF
```

---

### Task 4：圖層註冊、資料 hook、狀態列

**Files:**
- Modify: `frontend/src/lib/layers.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/StatusBadge.tsx`

- [ ] **Step 1：註冊圖層**

`frontend/src/lib/layers.ts` 改成：

```ts
export type LayerId = 'temp' | 'wind' | 'rain' | 'humidity' | 'radar' | 'satellite' | 'typhoon' | 'warning' | 'admin'
export const LAYER_IDS: LayerId[] = ['temp', 'wind', 'rain', 'humidity', 'radar', 'satellite', 'typhoon', 'warning', 'admin']
```

`LAYERS` 在 `typhoon` 之後加：

```ts
  warning: { label: '特報', icon: '⚠️' },
```

（沒有 `now`/`future`，`store.setLayer` 會自動把 `t` 歸零、停止播放，`Timeline` 不顯示。）

- [ ] **Step 2：資料 hook**

`frontend/src/api.ts` 的型別 import 加上 `Warning`：

```ts
import type { ApiResponse, ForecastGrid, ImageOverlay, Observation, SatelliteOverlay, Town, TownForecast, Typhoon, Warning } from '../../shared/types'
```

檔尾加（徽章在每個圖層都要用，所以不帶 `enabled`）：

```ts
export const useWarnings = () =>
  useQuery({ queryKey: ['warnings'], queryFn: () => get<Warning[]>('/api/warnings'), refetchInterval: TEN_MIN })
```

- [ ] **Step 3：狀態列**

`frontend/src/components/StatusBadge.tsx` 整檔改成：

```tsx
import { useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected, useSatellite, useSatelliteClouds, useTyphoons, useWarnings } from '../api'
import { useStore } from '../store'
import { fmtClock } from '../lib/format'

export default function StatusBadge() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const cloudMode = useStore(s => s.cloudMode)
  const isRadar = layer === 'radar'
  const isSatellite = layer === 'satellite'
  const isTyphoon = layer === 'typhoon'
  const isWarning = layer === 'warning'
  const obs = useObservations()
  const radar = useOverlay(isRadar ? 'radar' : null)
  const image = useReprojected(isRadar ? radar.data?.data ?? null : null)
  const satellite = useSatellite(isSatellite)
  const clouds = useSatelliteClouds(isSatellite ? satellite.data?.data ?? null : null, cloudMode)
  const typhoon = useTyphoons(isTyphoon)
  const warnings = useWarnings()
  const times = useFutureTimes()
  const grid = useForecastGrid(t > 0 ? times[t - 1] ?? null : null)

  const q = isWarning ? warnings : isTyphoon ? typhoon : isSatellite ? satellite : isRadar ? radar : t > 0 ? grid : obs
  if (q.isError || image.isError || clouds.isError) return <div className="badge glass warn">暫時無法取得資料</div>
  if (!q.data) return <div className="badge glass">載入中…</div>

  const when = isSatellite ? satellite.data?.data.obsTime : isRadar ? radar.data?.data.obsTime : q.data.updatedAt
  return (
    <div className={`badge glass ${q.data.stale ? 'warn' : ''}`}>
      {when ? `${isRadar || isSatellite ? '觀測' : '更新'}於 ${fmtClock(when)}` : '尚無資料'}
      {q.data.stale && ' · 資料可能非最新'}
    </div>
  )
}
```

- [ ] **Step 4：型別檢查、測試、瀏覽器確認**

Run: `npm run typecheck && npm test`
Expected: 皆通過（`lib.test.ts` 的 `parseUrlState` 測試不受影響）。

Run: `npm run dev`，開 `http://localhost:5173/?layer=warning`
Expected: 右側圖層清單多了「⚠️ 特報」且被選中；時間軸消失；左上角顯示「更新於 HH:mm」；地圖上暫時什麼都沒畫（下一個 Task 才畫）。看完關掉 dev server。

- [ ] **Step 5：提交**

```bash
git add frontend/src/lib/layers.ts frontend/src/api.ts frontend/src/components/StatusBadge.tsx
git commit -F - <<'EOF'
feat(web): register warning layer

把「特報」加進互斥圖層清單並接上 /api/warnings。它沒有時間
序列，沿用雷達與颱風的規則自動隱藏時間軸；資料 hook 不帶
enabled，因為之後的常駐徽章在任何圖層都需要它。

Add "warnings" to the exclusive layer list and wire it to
/api/warnings. It has no time series, so the timeline hides
itself as it does for radar and typhoons. The data hook takes
no enabled flag because the upcoming persistent badge needs it
on every layer.
EOF
```

---

### Task 5：地圖著色

**Files:**
- Create: `frontend/src/components/WarningLayer.tsx`
- Modify: `frontend/src/components/DataLayers.tsx`

- [ ] **Step 1：新增圖層元件**

新增 `frontend/src/components/WarningLayer.tsx`：

```tsx
import { useEffect } from 'react'
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl'
import type { Warning } from '../../../shared/types'
import { useBoundaries } from '../api'
import { worstByCounty } from '../lib/warnings'
import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'

const ID = 'warning-fill'
const NONE = 'rgba(0,0,0,0)'

/** 有特報的縣市依最嚴重種類著色，其餘透明；match 至少要一組對應，沒有特報時直接給透明色 */
function fillColor(list: Warning[]): string | ExpressionSpecification {
  const colors = [...worstByCounty(list)]
  if (colors.length === 0) return NONE
  const expr: unknown[] = ['match', ['get', 'COUNTYCODE'], ...colors.flat(), NONE]
  return expr as ExpressionSpecification
}

export default function WarningLayer({ map, list }: { map: MlMap; list: Warning[] }) {
  const counties = useBoundaries().data?.countyShapes

  useEffect(() => {
    if (!counties) return
    map.addSource(ID, { type: 'geojson', data: counties })
    // 插在界線之下，縣市／鄉鎮界仍疊在色塊上
    map.addLayer({ id: ID, type: 'fill', source: ID, paint: { 'fill-color': NONE, 'fill-opacity': 0.45 } }, dataLayerBefore(map))
    return () => removeLayerAndSource(map, ID)
  }, [map, counties])

  // 特報變動時只換顏色，不重建圖層
  useEffect(() => {
    if (counties) map.setPaintProperty(ID, 'fill-color', fillColor(list))
  }, [map, counties, list])

  return null
}
```

- [ ] **Step 2：掛到 DataLayers**

`frontend/src/components/DataLayers.tsx`：

import 改成：

```tsx
import { usePrefetchGrids, useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected, useSatellite, useSatelliteClouds, useTyphoons, useWarnings } from '../api'
```

`import AdminLayer from './AdminLayer'` 之後加：

```tsx
import WarningLayer from './WarningLayer'
```

`const typhoon = useTyphoons(layer === 'typhoon')` 之後加：

```tsx
  const warnings = useWarnings()
```

回傳的 JSX 在 `AdminLayer` 那行之後加：

```tsx
      {layer === 'warning' && warnings.data && <WarningLayer map={map} list={warnings.data.data} />}
```

- [ ] **Step 3：型別檢查**

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 4：用 fixture 餵本機 DB 看著色**

本機 dev server 的 API 讀寫 `os.tmpdir()/aiot03-weather.db`。把 fixture 寫進去並把抓取時間標成現在，10 分鐘內 API 不會重抓：

```bash
npx tsx -e "
import os from 'node:os'; import path from 'node:path';
import { openDb } from './server/db.js';
import { replaceWarnings, logFetch } from './server/repo.js';
import { parseWarnings } from './server/cwa/parse.js';
import { fixture } from './server/__fixtures__/load.js';
const db = openDb(path.join(os.tmpdir(), 'aiot03-weather.db'));
replaceWarnings(db, parseWarnings(fixture('W-C0033-001.json')));
logFetch(db, 'warnings', new Date().toISOString());
console.log(db.prepare('SELECT COUNT(*) AS n FROM warnings').get());
"
```

Expected: `{ n: 5 }`。

Run: `npm run dev`，開 `http://localhost:5173/?layer=warning`
Expected: 宜蘭縣與臺北市黃色（大雨）、花蓮縣橘色（豪雨）、連江縣灰色（濃霧），其餘縣市不上色；縣市界線仍在色塊上；切到溫度圖層色塊消失、切回來再出現。10 分鐘後 API 會重抓 CWA 而清空，要再看就重跑上面的指令。看完關掉 dev server。

- [ ] **Step 5：提交**

```bash
git add frontend/src/components/WarningLayer.tsx frontend/src/components/DataLayers.tsx
git commit -F - <<'EOF'
feat(web): color counties by active warnings

特報圖層以縣市多邊形上色，每個縣市取最嚴重特報的顏色。色
塊插在界線之下，縣市與鄉鎮界仍看得到；特報更新時只換填色
表達式、不重建圖層。沒有特報時 match 表達式不能為空，改給
純透明色。

Fill county polygons on the warnings layer, each in the colour
of its most severe warning. The fill sits below the boundary
lines so county and township borders stay visible, and updates
only swap the colour expression rather than rebuilding the
layer. A match expression cannot be empty, so with no warnings
the fill is a plain transparent colour.
EOF
```

---

### Task 6：資訊卡與徽章

**Files:**
- Create: `frontend/src/components/WarningCard.tsx`
- Create: `frontend/src/components/WarningBadge.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1：資訊卡**

新增 `frontend/src/components/WarningCard.tsx`：

```tsx
import { useWarnings } from '../api'
import { fmtValid, groupByKind } from '../lib/warnings'

export default function WarningCard() {
  const q = useWarnings()
  const groups = groupByKind(q.data?.data ?? [])
  return (
    <aside className="card glass" aria-label="天氣特報">
      <header><h2>⚠️ 天氣特報</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入特報資料，請稍後再試。</p>}
      {q.data && groups.length === 0 && <p className="muted">目前無天氣特報</p>}
      {groups.map(g => (
        <section key={g.title} className="warning-group">
          <h3><span className="dot" style={{ background: g.color }} />{g.title}</h3>
          <ul>
            {g.items.map(w => (
              <li key={w.countyCode}>
                <span>{w.county}</span>
                <span className="muted">{fmtValid(w.start, w.end)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  )
}
```

- [ ] **Step 2：徽章**

新增 `frontend/src/components/WarningBadge.tsx`：

```tsx
import { useWarnings } from '../api'
import { useStore } from '../store'
import { badgeText, groupByKind } from '../lib/warnings'

/** 任何圖層都看得到的特報提示；點了切到特報圖層。無特報或已在特報圖層時不顯示 */
export default function WarningBadge() {
  const layer = useStore(s => s.layer)
  const setLayer = useStore(s => s.setLayer)
  const q = useWarnings()
  const text = badgeText(groupByKind(q.data?.data ?? []))
  if (!text || layer === 'warning') return null
  return <button className="badge glass alert" onClick={() => setLayer('warning')}>{text}</button>
}
```

- [ ] **Step 3：接到 App**

`frontend/src/App.tsx` 整檔改成：

```tsx
import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'
import DataLayers from './components/DataLayers'
import SelectionMarker from './components/SelectionMarker'
import Boundaries from './components/Boundaries'
import Breadcrumb from './components/Breadcrumb'
import SearchBox from './components/SearchBox'
import StatusBadge from './components/StatusBadge'
import WarningBadge from './components/WarningBadge'
import LayerPicker from './components/LayerPicker'
import BasemapPicker from './components/BasemapPicker'
import Timeline from './components/Timeline'
import LocationCard from './components/LocationCard'
import TyphoonCard from './components/TyphoonCard'
import WarningCard from './components/WarningCard'
import { useStore } from './store'

export default function App() {
  const [map, setMap] = useState<MlMap | null>(null)
  const layer = useStore(s => s.layer)
  return (
    <>
      <MapView onReady={setMap} />
      {map && <DataLayers map={map} />}
      {map && <Boundaries map={map} />}
      {map && <SelectionMarker map={map} />}
      <div className="top-left">
        <SearchBox map={map} />
        <Breadcrumb map={map} />
        <StatusBadge />
        <WarningBadge />
      </div>
      <LayerPicker />
      <BasemapPicker />
      <Timeline />
      {layer === 'typhoon' ? <TyphoonCard /> : layer === 'warning' ? <WarningCard /> : <LocationCard />}
    </>
  )
}
```

- [ ] **Step 4：樣式**

`frontend/src/styles.css`，在 `.badge.warn { color: var(--warn); }` 之後加：

```css
.badge.alert { color: #fff; font-weight: 600; background: rgba(224, 49, 49, 0.85); cursor: pointer; }
.badge.alert:hover { background: rgba(224, 49, 49, 1); }
```

在 `.typhoon h3 { … }` 之後加：

```css
.warning-group { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--glass-border); }
.warning-group h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 16px; }
.warning-group .dot { flex: none; width: 12px; height: 12px; border-radius: 50%; }
.warning-group ul { list-style: none; margin: 0; padding: 0; }
.warning-group li { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; font-size: 13px; }
```

- [ ] **Step 5：型別檢查與瀏覽器確認**

Run: `npm run typecheck && npm test`
Expected: 皆通過。

先確認「無特報」狀態：`npm run dev`，開 `http://localhost:5173/?layer=warning`
Expected: 資訊卡標題「⚠️ 天氣特報」、內容「目前無天氣特報」；切到溫度圖層，左上角沒有紅色徽章。

再用 Task 5 Step 4 的 `npx tsx -e "…"` 指令餵 fixture，重新整理：
Expected:
- 特報圖層：資訊卡依序列出「豪雨特報」（花蓮縣 9/25 05:30 – 17:30）、「大雨特報」（宜蘭縣、臺北市）、「陸上強風特報」（宜蘭縣 9/25 00:00 – 9/26 06:00）、「濃霧特報」（連江縣 9/25 06:00 起），每組前有對應顏色的圓點；左上角沒有徽章。
- 切到溫度圖層：左上角出現紅色徽章「⚠ 4 則特報」，點了切回特報圖層。
- 手機寬度（DevTools 切 375px）：資訊卡在底部抽屜、徽章不會被搜尋框蓋住。

看完關掉 dev server。

- [ ] **Step 6：提交**

```bash
git add frontend/src/components/WarningCard.tsx frontend/src/components/WarningBadge.tsx frontend/src/App.tsx frontend/src/styles.css
git commit -F - <<'EOF'
feat(web): add warning card and badge

特報圖層的資訊卡依種類分組列出縣市與有效時間，取代地點卡
片的位置。另外在左上角常駐一顆徽章，任何圖層都看得到目前
有幾則特報，點了切到特報圖層；否則使用者要自己切圖層才知
道有特報。

The warnings card groups active warnings by kind with their
counties and validity, taking the location card's slot. A
persistent badge in the top-left shows how many warnings are
active from any layer and switches to the warnings layer on
click; without it users would only find warnings by switching
layers themselves.
EOF
```

---

### Task 7：README

**Files:**
- Modify: `README.md`

- [ ] **Step 1：功能清單**

第 33 行改成：

```markdown
- **九種圖層**：溫度、風、雨量、濕度、雷達、衛星、颱風、特報、行政區
```

「**颱風**」那條之後加：

```markdown
- **特報**：發布中的縣市天氣特報依最嚴重種類為縣市著色（颱風警報、大豪雨、豪雨、大雨、低溫、強風、濃霧），資訊卡依種類列出縣市與有效時間；左上角徽章在任何圖層都提示目前特報，點了切到特報圖層
```

- [ ] **Step 2：架構圖**

mermaid 裡的 API 路由節點改成：

```
      API["路由<br/>observations · towns · forecast<br/>forecast-grid · radar · satellite · satellite-tile · typhoon · warnings"]
```

datastore 節點改成：

```
    DS["datastore API<br/>O-A0001/0002/0003-001 觀測<br/>F-D0047-093 鄉鎮預報<br/>W-C0034-005 颱風路徑<br/>W-C0033-001 縣市特報"]
```

- [ ] **Step 3：TTL 表與 API 表**

TTL 表「颱風」那列之後加：

```markdown
| 特報 | 10 分鐘 | 10 分鐘 |
```

API 表「`GET /api/typhoon`」那列之後加：

```markdown
| `GET /api/warnings` | 發布中的縣市天氣特報 |
```

截圖依 spec 等實際有特報時再補，此 Task 不截圖。

- [ ] **Step 4：提交**

```bash
git add README.md
git commit -F - <<'EOF'
docs: add warning layer to readme

README 的功能清單、架構圖、TTL 表與 API 表補上特報圖層。
當日沒有特報，截圖等實際發布時再補。

Add the warnings layer to the README feature list, architecture
diagram, TTL table and API table. No warning was active today,
so screenshots wait for a real one.
EOF
```

- [ ] **Step 5：最終驗證**

Run: `npm test && npm run typecheck && npm run build`
Expected: 測試全過、型別無錯、`build:db` 輸出的筆數物件含 `warnings: 0`（當日無特報）、`vite build` 成功。
