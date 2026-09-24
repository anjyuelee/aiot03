# 颱風圖層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增第七個互斥圖層「颱風」，顯示 CWA `W-C0034-005` 活動中熱帶氣旋的過去／預測路徑、暴風圈、70% 潛勢圓，附資訊卡與點擊 popup。

**Architecture:** 後端沿用 `ensureFresh → sync → repo → SQLite` 管線，新增 `typhoons` 表（每颱風一列 JSON）與 `/api/typhoon`。前端純函式（`lib/typhoon.ts`）把資料轉成 GeoJSON，`TyphoonLayer` 以 MapLibre GeoJSON source 繪製並處理 popup／fitBounds，`TyphoonCard` 佔用既有 `.card` 位置。

**Tech Stack:** TypeScript、better-sqlite3、Vitest、React 19、MapLibre GL 6、TanStack Query。

**Spec:** `docs/superpowers/specs/2026-09-24-typhoon-layer-design.md`

**與 spec 的補充決定：** spec 寫「卡片位置避開 LocationCard，實作時調整」。此計畫定案為：在颱風圖層時，`TyphoonCard` 取代 `LocationCard` 的位置（`LocationCard` 不顯示），且點地圖不選鄉鎮 — 颱風點擊與鄉鎮點擊因此不會衝突，也不必處理兩張卡片疊放。

**Commit 規則：** 每個 commit 用 `commit-message` skill 的格式（英文 subject＋中英雙語 body，不加 trailer）。

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `shared/types.ts` | 修改 | `TyphoonFix`、`Typhoon` 型別 |
| `server/cwa/parse.ts` | 修改 | `parseTyphoons` |
| `server/__fixtures__/W-C0034-005.json` | 新增 | 2026-09-24 實抓資料（舒力基） |
| `server/cwa/parse.test.ts` | 修改 | 解析測試 |
| `server/db.ts` | 修改 | `typhoons` 表 |
| `server/repo.ts` | 修改 | `replaceTyphoons`、`listTyphoons` |
| `server/sync.ts` | 修改 | `syncTyphoons` |
| `server/sync.test.ts` | 修改 | 同步測試 |
| `server/freshness.ts` | 修改 | `TTL.typhoon` |
| `server/service.ts` | 修改 | `getTyphoons` |
| `api/typhoon.ts` | 新增 | `GET /api/typhoon` |
| `scripts/build-db.ts` | 修改 | 種子 DB 一併抓颱風 |
| `frontend/src/lib/typhoon.ts` | 新增 | 純函式：`circlePolygon`、`typhoonBounds`、`toGeoJSON`、`fixLines` |
| `frontend/src/lib/typhoon.test.ts` | 新增 | 純函式測試 |
| `frontend/src/lib/layers.ts` | 修改 | `typhoon` 圖層 |
| `frontend/src/api.ts` | 修改 | `useTyphoons` |
| `frontend/src/components/StatusBadge.tsx` | 修改 | 颱風圖層的更新時間 |
| `frontend/src/components/MapView.tsx` | 修改 | 颱風圖層不選鄉鎮 |
| `frontend/src/components/TyphoonLayer.tsx` | 新增 | 繪圖、popup、fitBounds |
| `frontend/src/components/DataLayers.tsx` | 修改 | 掛上 `TyphoonLayer` |
| `frontend/src/components/TyphoonCard.tsx` | 新增 | 資訊卡 |
| `frontend/src/App.tsx` | 修改 | 颱風圖層顯示 `TyphoonCard` 取代 `LocationCard` |
| `frontend/src/styles.css` | 修改 | 資訊卡、popup 樣式 |

---

### Task 1：型別與解析

**Files:**
- Modify: `shared/types.ts`（檔尾）
- Modify: `server/cwa/parse.ts`
- Create: `server/__fixtures__/W-C0034-005.json`
- Test: `server/cwa/parse.test.ts`

- [ ] **Step 1：建立 fixture**

```bash
set -a && . ./.env && set +a
curl -s "https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0034-005?Authorization=$CWA_API_KEY&format=JSON" \
  | python3 -m json.tool --no-ensure-ascii > server/__fixtures__/W-C0034-005.json
python3 -c "import json;d=json.load(open('server/__fixtures__/W-C0034-005.json'));print([t['CwaTyphoonName'] for t in d['records']['TropicalCyclones']['TropicalCyclone']])"
```

Expected：`['舒力基']`。若颱風已消散或資料已更新，改用 session scratchpad 中 2026-09-24 抓到的 `ty.json`（同一份資料）。以下測試數值皆依這份資料：過去 8 點、預測 9 點；最新過去點 `2026-09-24T02:00:00+08:00`、17.4N 135.6E、998 hPa、20／28 m/s、WNW 34 km/h、`Circle15ms.Radius=100` 且象限最大 120；第一個預測點 +6h、134.6E 17.7N、七級風半徑 120、70% 半徑 40。

- [ ] **Step 2：加型別**（`shared/types.ts` 檔尾）

```ts
export interface TyphoonFix {
  /** 過去點為觀測時間；預測點為 InitialTime + ForecastHour，皆為 +08:00 ISO 字串 */
  time: string
  /** 過去點為 null */
  forecastHour: number | null
  lat: number
  lon: number
  pressure: number | null
  maxWind: number | null
  maxGust: number | null
  moveDir: string | null
  moveSpeed: number | null
  /** 七級風暴風半徑（km）；有象限半徑時取四象限最大值 */
  radius15ms: number | null
  /** 70% 機率半徑（km），僅預測點 */
  radius70: number | null
}

export interface Typhoon {
  id: string
  name: string
  nameEn: string | null
  past: TyphoonFix[]
  forecast: TyphoonFix[]
}
```

- [ ] **Step 3：寫失敗測試**（`server/cwa/parse.test.ts`：import 加 `parseTyphoons`，檔尾加）

```ts
describe('parseTyphoons', () => {
  const list = parseTyphoons(fixture('W-C0034-005.json'))

  it('parses names, id and track lengths', () => {
    expect(list).toHaveLength(1)
    const t = list[0]
    expect(t.id).toBe('2026-29')
    expect(t.name).toBe('舒力基')
    expect(t.nameEn).toBe('SURIGAE')
    expect(t.past).toHaveLength(8)
    expect(t.forecast).toHaveLength(9)
  })

  it('converts the latest past fix and takes the max quadrant radius', () => {
    expect(list[0].past.at(-1)).toEqual({
      time: '2026-09-24T02:00:00+08:00', forecastHour: null, lat: 17.4, lon: 135.6,
      pressure: 998, maxWind: 20, maxGust: 28, moveDir: 'WNW', moveSpeed: 34,
      radius15ms: 120, radius70: null,
    })
    expect(list[0].past[0].radius15ms).toBeNull()
  })

  it('computes forecast times from InitialTime + ForecastHour', () => {
    const f = list[0].forecast[0]
    expect(f.time).toBe('2026-09-24T08:00:00+08:00')
    expect(f.forecastHour).toBe(6)
    expect([f.lon, f.lat]).toEqual([134.6, 17.7])
    expect(f.radius15ms).toBe(120)
    expect(f.radius70).toBe(40)
    expect(list[0].forecast.at(-1)!.time).toBe('2026-09-29T02:00:00+08:00')
  })

  it('names unnamed depressions by TD number and tolerates missing data', () => {
    const td = { Year: '2026', TyphoonName: '', CwaTyphoonName: '', CwaTdNo: '30', CwaTyNo: '',
      AnalysisData: { Fix: [{ DateTime: '2026-09-24T02:00:00+08:00', CoordinateLongitude: '120', CoordinateLatitude: '15' }] } }
    const [t] = parseTyphoons({ records: { TropicalCyclones: { TropicalCyclone: [td] } } })
    expect(t.name).toBe('熱帶性低氣壓 TD30')
    expect(t.nameEn).toBeNull()
    expect(t.forecast).toEqual([])
    expect(parseTyphoons({ records: {} })).toEqual([])
  })
})
```

- [ ] **Step 4：跑測試確認失敗**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: FAIL（`parseTyphoons` is not exported）

- [ ] **Step 5：實作**（`server/cwa/parse.ts`：型別 import 加 `Typhoon, TyphoonFix`，檔尾加）

```ts
const HOUR = 3600_000
const TAIPEI = 8 * HOUR

/** 以 +08:00 表示，與 CWA 其他時間欄位格式一致 */
function addHours(iso: string, h: number): string {
  return new Date(Date.parse(iso) + h * HOUR + TAIPEI).toISOString().slice(0, 19) + '+08:00'
}

function radius15(c: any): number | null {
  const quads: number[] = (c?.QuadrantRadii?.Radius ?? []).map((r: any) => num(r.value)).filter((n: number | null) => n != null)
  return quads.length ? Math.max(...quads) : num(c?.Radius)
}

function typhoonFix(f: any, time: string, forecastHour: number | null): TyphoonFix | null {
  const lat = num(f.CoordinateLatitude)
  const lon = num(f.CoordinateLongitude)
  if (lat == null || lon == null) return null
  return {
    time, forecastHour, lat, lon,
    pressure: num(f.Pressure),
    maxWind: num(f.MaxWindSpeed),
    maxGust: num(f.MaxGustSpeed),
    moveDir: f.MovingDirection || null,
    moveSpeed: num(f.MovingSpeed),
    radius15ms: radius15(f.Circle15ms),
    radius70: num(f.Radius70PercentProbability),
  }
}

const isFix = (f: TyphoonFix | null): f is TyphoonFix => f != null

export function parseTyphoons(json: any): Typhoon[] {
  return (json.records?.TropicalCyclones?.TropicalCyclone ?? []).map((t: any): Typhoon => ({
    id: `${t.Year}-${t.CwaTdNo}`,
    name: t.CwaTyphoonName || `熱帶性低氣壓 TD${t.CwaTdNo}`,
    nameEn: t.TyphoonName || null,
    past: (t.AnalysisData?.Fix ?? []).map((f: any) => typhoonFix(f, f.DateTime, null)).filter(isFix),
    forecast: (t.ForecastData?.Fix ?? []).map((f: any) => {
      const h = Number(f.ForecastHour)
      return typhoonFix(f, addHours(f.InitialTime, h), h)
    }).filter(isFix),
  }))
}
```

- [ ] **Step 6：跑測試確認通過**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: PASS（全部）

- [ ] **Step 7：Commit**

```bash
git add shared/types.ts server/cwa/parse.ts server/cwa/parse.test.ts server/__fixtures__/W-C0034-005.json
git commit  # feat(api): parse cwa tropical cyclone tracks
```

---

### Task 2：儲存、同步、API

**Files:**
- Modify: `server/db.ts:22`、`server/repo.ts`、`server/sync.ts`、`server/freshness.ts:6-11`、`server/service.ts`、`scripts/build-db.ts`
- Create: `api/typhoon.ts`
- Test: `server/sync.test.ts`

- [ ] **Step 1：寫失敗測試**（`server/sync.test.ts`：import 加 `syncTyphoons`、`listTyphoons`；檔尾加）

```ts
describe('syncTyphoons', () => {
  const withTyphoons = (json: unknown): Fetcher => ({
    async dataset(id) {
      if (id === 'W-C0034-005') return json
      throw new Error(`unexpected dataset ${id}`)
    },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
  })

  it('stores typhoons and logs the fetch', async () => {
    await syncTyphoons(db, withTyphoons(fixture('W-C0034-005.json')))
    const list = listTyphoons(db)
    expect(list.map(t => t.name)).toEqual(['舒力基'])
    expect(list[0].forecast).toHaveLength(9)
    expect(getFetchedAt(db, 'typhoon')).not.toBeNull()
  })

  it('clears old typhoons when none are active', async () => {
    await syncTyphoons(db, withTyphoons(fixture('W-C0034-005.json')))
    await syncTyphoons(db, withTyphoons({ success: 'true', records: {} }))
    expect(listTyphoons(db)).toEqual([])
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run server/sync.test.ts`
Expected: FAIL（`syncTyphoons` is not exported）

- [ ] **Step 3：實作**

`server/db.ts` SCHEMA 內 `fetch_log` 那行之前加：

```sql
CREATE TABLE IF NOT EXISTS typhoons (id TEXT PRIMARY KEY, json TEXT);
```

`server/repo.ts`：型別 import 加 `Typhoon`；在 `logFetch` 之前加：

```ts
// 路徑為巢狀結構且一律整批讀寫，直接存 JSON
export function replaceTyphoons(db: DB, list: Typhoon[]): void {
  const insert = db.prepare('INSERT INTO typhoons (id, json) VALUES (?, ?)')
  db.transaction(() => {
    db.prepare('DELETE FROM typhoons').run()
    for (const t of list) insert.run(t.id, JSON.stringify(t))
  })()
}

export function listTyphoons(db: DB): Typhoon[] {
  return (db.prepare('SELECT json FROM typhoons ORDER BY id').all() as { json: string }[]).map(r => JSON.parse(r.json))
}
```

`server/sync.ts`：parse import 加 `parseTyphoons`、repo import 加 `replaceTyphoons`；檔尾加：

```ts
// 無活動中颱風時 CWA 回傳空清單，照樣清空舊資料
export async function syncTyphoons(db: DB, f: Fetcher = cwa): Promise<void> {
  replaceTyphoons(db, parseTyphoons(await f.dataset('W-C0034-005')))
  logFetch(db, 'typhoon', now())
}
```

`server/freshness.ts` 的 `TTL` 加一行：

```ts
  typhoon: 30 * MIN,
```

`server/service.ts`：型別 import 加 `Typhoon`；repo import 加 `listTyphoons`；sync import 加 `syncTyphoons`；檔尾加：

```ts
export async function getTyphoons(): Promise<ApiResponse<Typhoon[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'typhoon', () => syncTyphoons(db))
  return { data: listTyphoons(db), ...meta }
}
```

`api/typhoon.ts`：

```ts
import { handle, json } from '../server/http.js'
import { getTyphoons } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getTyphoons()))
}
```

`scripts/build-db.ts`：import 加 `syncTyphoons`；`steps` 加 `['typhoon', () => syncTyphoons(db)],`；最後統計的表名陣列加 `'typhoons'`。

- [ ] **Step 4：跑測試與型別檢查**

Run: `npx vitest run server && npm run typecheck`
Expected: 全部 PASS，typecheck 無錯誤

- [ ] **Step 5：實測 API**

```bash
npx tsx --env-file=.env -e "import('./server/service.ts').then(async s => { const r = await s.getTyphoons(); console.log(r.stale, r.data.map(t => [t.name, t.past.length, t.forecast.length])) })"
```

Expected: `false [ [ '舒力基', <n>, <n> ] ]`（或颱風消散時為 `[]`）

- [ ] **Step 6：Commit**

```bash
git add server/db.ts server/repo.ts server/sync.ts server/sync.test.ts server/freshness.ts server/service.ts api/typhoon.ts scripts/build-db.ts
git commit  # feat(api): serve active typhoons from sqlite cache
```

---

### Task 3：前端純函式

**Files:**
- Create: `frontend/src/lib/typhoon.ts`
- Test: `frontend/src/lib/typhoon.test.ts`

- [ ] **Step 1：寫失敗測試**

```ts
import { describe, it, expect } from 'vitest'
import { circlePolygon, fixLines, toGeoJSON, typhoonBounds } from './typhoon'
import { TAIWAN_BOUNDS } from './heat'
import type { LineString } from 'geojson'
import type { Typhoon, TyphoonFix } from '../../../shared/types'

const fix = (lon: number, lat: number, extra: Partial<TyphoonFix> = {}): TyphoonFix => ({
  time: '2026-09-24T02:00:00+08:00', forecastHour: null, lat, lon, pressure: 998, maxWind: 20, maxGust: 28,
  moveDir: 'WNW', moveSpeed: 34, radius15ms: 120, radius70: null, ...extra,
})
const ty: Typhoon = {
  id: '2026-29', name: '舒力基', nameEn: 'SURIGAE',
  past: [fix(137, 16), fix(135.6, 17.4)],
  forecast: [fix(134.6, 17.7, { forecastHour: 6, time: '2026-09-24T08:00:00+08:00', radius70: 40 })],
}

// haversine，公里
function km([lon1, lat1]: number[], [lon2, lat2]: number[]) {
  const r = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

describe('circlePolygon', () => {
  it('produces a closed ring whose vertices are radiusKm from the centre', () => {
    const ring = circlePolygon(135.6, 17.4, 120, 16)
    expect(ring).toHaveLength(17)
    expect(ring[0]).toEqual(ring[16])
    for (const p of ring) expect(km([135.6, 17.4], p)).toBeCloseTo(120, 0)
  })
})

describe('typhoonBounds', () => {
  it('covers Taiwan and every track point', () => {
    const [w, s, e, n] = typhoonBounds([ty])
    expect(w).toBe(TAIWAN_BOUNDS[0])
    expect(s).toBe(16)
    expect(e).toBe(137)
    expect(n).toBe(TAIWAN_BOUNDS[3])
  })
  it('is Taiwan alone when there are no typhoons', () => {
    expect(typhoonBounds([])).toEqual(TAIWAN_BOUNDS)
  })
})

describe('toGeoJSON', () => {
  it('emits tracks, points, wind circle and forecast cones', () => {
    const roles = toGeoJSON([ty]).features.map(f => f.properties!.role)
    expect(roles.filter(r => r === 'track-past')).toHaveLength(1)
    expect(roles.filter(r => r === 'track-forecast')).toHaveLength(1)
    expect(roles.filter(r => r === 'point')).toHaveLength(3)
    expect(roles.filter(r => r === 'wind')).toHaveLength(1)
    expect(roles.filter(r => r === 'cone')).toHaveLength(1)
  })
  it('starts the forecast track at the current position', () => {
    const f = toGeoJSON([ty]).features.find(f => f.properties!.role === 'track-forecast')!
    expect((f.geometry as LineString).coordinates[0]).toEqual([135.6, 17.4])
  })
})

describe('fixLines', () => {
  it('labels forecast points and skips missing values', () => {
    const lines = fixLines(ty.forecast[0])
    expect(lines[0]).toContain('+6h 預測')
    expect(lines).toContain('中心氣壓 998 hPa')
    expect(lines).toContain('七級風半徑 120 km')
    expect(lines).toContain('70% 機率半徑 40 km')
    expect(fixLines(fix(1, 1, { pressure: null }))).not.toContainEqual(expect.stringContaining('氣壓'))
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/typhoon.test.ts`
Expected: FAIL（找不到 `./typhoon`）

- [ ] **Step 3：實作 `frontend/src/lib/typhoon.ts`**

```ts
import type { Feature, FeatureCollection, Position } from 'geojson'
import type { Bounds, Typhoon, TyphoonFix } from '../../../shared/types'
import { TAIWAN_BOUNDS } from './heat'
import { fmtSlot } from './format'

const EARTH_KM = 6371
const RAD = Math.PI / 180

/** 以大圓距離畫圓，縮放時半徑仍對應實際公里數 */
export function circlePolygon(lon: number, lat: number, radiusKm: number, steps = 64): Position[] {
  const d = radiusKm / EARTH_KM
  const φ1 = lat * RAD
  const λ1 = lon * RAD
  const ring: Position[] = []
  for (let i = 0; i <= steps; i++) {
    const θ = (i % steps) / steps * 2 * Math.PI
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ))
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2))
    ring.push([λ2 / RAD, φ2 / RAD])
  }
  return ring
}

export function typhoonBounds(list: Typhoon[]): Bounds {
  let [w, s, e, n] = TAIWAN_BOUNDS
  for (const t of list) {
    for (const f of [...t.past, ...t.forecast]) {
      w = Math.min(w, f.lon); e = Math.max(e, f.lon)
      s = Math.min(s, f.lat); n = Math.max(n, f.lat)
    }
  }
  return [w, s, e, n]
}

type Role = 'track-past' | 'track-forecast' | 'point' | 'wind' | 'cone'
const feature = (role: Role, geometry: Feature['geometry'], props: Record<string, unknown> = {}): Feature =>
  ({ type: 'Feature', geometry, properties: { role, ...props } })

/** 點要素只帶索引：MapLibre 會把巢狀屬性轉成字串，點擊時再回頭查原資料 */
export function toGeoJSON(list: Typhoon[]): FeatureCollection {
  const features: Feature[] = []
  list.forEach((t, ti) => {
    const now = t.past.at(-1)
    const pos = (f: TyphoonFix): Position => [f.lon, f.lat]
    if (t.past.length > 1) features.push(feature('track-past', { type: 'LineString', coordinates: t.past.map(pos) }))
    const ahead = [...(now ? [now] : []), ...t.forecast]
    if (ahead.length > 1) features.push(feature('track-forecast', { type: 'LineString', coordinates: ahead.map(pos) }))
    for (const f of t.forecast) {
      if (f.radius70) features.push(feature('cone', { type: 'Polygon', coordinates: [circlePolygon(f.lon, f.lat, f.radius70)] }))
    }
    if (now?.radius15ms) features.push(feature('wind', { type: 'Polygon', coordinates: [circlePolygon(now.lon, now.lat, now.radius15ms)] }))
    t.past.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) },
      { ti, kind: 'past', i, current: i === t.past.length - 1 })))
    t.forecast.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) },
      { ti, kind: 'forecast', i, current: false })))
  })
  return { type: 'FeatureCollection', features }
}

/** popup 與資訊卡共用的數值列；缺值的欄位不顯示 */
export function fixLines(f: TyphoonFix): string[] {
  const lines = [f.forecastHour != null ? `${fmtSlot(f.time)}（+${f.forecastHour}h 預測）` : fmtSlot(f.time)]
  if (f.pressure != null) lines.push(`中心氣壓 ${f.pressure} hPa`)
  if (f.maxWind != null) lines.push(`最大風速 ${f.maxWind} m/s${f.maxGust != null ? `，陣風 ${f.maxGust} m/s` : ''}`)
  if (f.moveDir) lines.push(`向 ${f.moveDir}${f.moveSpeed != null ? ` ${f.moveSpeed} km/h` : ''}`)
  if (f.radius15ms != null) lines.push(`七級風半徑 ${f.radius15ms} km`)
  if (f.radius70 != null) lines.push(`70% 機率半徑 ${f.radius70} km`)
  return lines
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run frontend/src/lib/typhoon.test.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add frontend/src/lib/typhoon.ts frontend/src/lib/typhoon.test.ts
git commit  # feat(web): add typhoon geometry helpers
```

---

### Task 4：圖層註冊與資料接線

**Files:**
- Modify: `frontend/src/lib/layers.ts`、`frontend/src/api.ts`、`frontend/src/components/StatusBadge.tsx`、`frontend/src/components/MapView.tsx:39-45`

- [ ] **Step 1：`layers.ts`**

```ts
export type LayerId = 'temp' | 'wind' | 'rain' | 'humidity' | 'radar' | 'satellite' | 'typhoon'
export const LAYER_IDS: LayerId[] = ['temp', 'wind', 'rain', 'humidity', 'radar', 'satellite', 'typhoon']
```

`LAYERS` 加：

```ts
  typhoon: { label: '颱風', icon: '🌀' },
```

（沒有 `future`，`store.setLayer` 會自動把 `t` 歸零、停止播放，時間軸停用。）

- [ ] **Step 2：`api.ts`**（型別 import 加 `Typhoon`；檔尾加）

```ts
export const useTyphoons = (enabled: boolean) =>
  useQuery({ queryKey: ['typhoon'], queryFn: () => get<Typhoon[]>('/api/typhoon'), enabled, refetchInterval: TEN_MIN })
```

- [ ] **Step 3：`StatusBadge.tsx`**：import 加 `useTyphoons`，加上 `const isTyphoon = layer === 'typhoon'` 與 `const typhoon = useTyphoons(isTyphoon)`，並把 `q` 改為：

```ts
  const q = isTyphoon ? typhoon : isSatellite ? satellite : isRadar ? radar : t > 0 ? grid : obs
```

（颱風走 `q.data.updatedAt`、顯示「更新於」，其餘不變。）

- [ ] **Step 4：`MapView.tsx`** click handler 開頭加：

```ts
      // 颱風圖層的點擊留給路徑點 popup
      if (useStore.getState().layer === 'typhoon') return
```

- [ ] **Step 5：驗證**

Run: `npm run typecheck && npm test`
Expected: 無錯誤、全部 PASS（`urlState` 測試若列舉圖層也應通過）

- [ ] **Step 6：Commit**

```bash
git add frontend/src/lib/layers.ts frontend/src/api.ts frontend/src/components/StatusBadge.tsx frontend/src/components/MapView.tsx
git commit  # feat(web): register typhoon layer
```

---

### Task 5：地圖繪製、popup、自動縮放

**Files:**
- Create: `frontend/src/components/TyphoonLayer.tsx`
- Modify: `frontend/src/components/DataLayers.tsx:47`、`frontend/src/styles.css`

- [ ] **Step 1：`TyphoonLayer.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { Popup, type FilterSpecification, type Map as MlMap, type MapLayerMouseEvent } from 'maplibre-gl'
import type { Typhoon } from '../../../shared/types'
import { fixLines, toGeoJSON, typhoonBounds } from '../lib/typhoon'
import { firstSymbolLayer, removeLayerAndSource } from '../map/helpers'

const SRC = 'typhoon'
const POINTS = 'typhoon-points'
const LAYER_IDS = ['typhoon-cone', 'typhoon-wind-fill', 'typhoon-wind-line', 'typhoon-track-past', 'typhoon-track-forecast', POINTS]
const role = (r: string): FilterSpecification => ['==', ['get', 'role'], r]
// 左側避開 .card（340px＋間距）；手機版卡片在底部
const fitPadding = () => matchMedia('(max-width: 640px)').matches
  ? { top: 60, bottom: Math.round(innerHeight * 0.45), left: 20, right: 20 }
  : { top: 60, bottom: 110, left: 380, right: 140 }

export default function TyphoonLayer({ map, list }: { map: MlMap; list: Typhoon[] }) {
  const fitted = useRef(false)

  useEffect(() => {
    const before = firstSymbolLayer(map)
    map.addSource(SRC, { type: 'geojson', data: toGeoJSON(list) })
    map.addLayer({ id: 'typhoon-cone', type: 'line', source: SRC, filter: role('cone'),
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 1 } }, before)
    map.addLayer({ id: 'typhoon-wind-fill', type: 'fill', source: SRC, filter: role('wind'),
      paint: { 'fill-color': '#fa5252', 'fill-opacity': 0.2 } }, before)
    map.addLayer({ id: 'typhoon-wind-line', type: 'line', source: SRC, filter: role('wind'),
      paint: { 'line-color': '#fa5252', 'line-width': 1.5 } }, before)
    map.addLayer({ id: 'typhoon-track-past', type: 'line', source: SRC, filter: role('track-past'),
      paint: { 'line-color': '#ffffff', 'line-width': 2 } }, before)
    map.addLayer({ id: 'typhoon-track-forecast', type: 'line', source: SRC, filter: role('track-forecast'),
      paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] } }, before)
    map.addLayer({ id: POINTS, type: 'circle', source: SRC, filter: role('point'),
      paint: {
        'circle-radius': ['case', ['get', 'current'], 7, 4],
        'circle-color': ['case', ['get', 'current'], '#fa5252', ['==', ['get', 'kind'], 'past'], '#ffffff', '#0b0e17'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['get', 'current'], 2, 1],
      } })

    const popup = new Popup({ closeButton: false, className: 'typhoon-popup' })
    const onClick = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      const t = list[p.ti]
      const f = (p.kind === 'past' ? t.past : t.forecast)[p.i]
      const el = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = t.name
      el.append(title, ...fixLines(f).map(line => Object.assign(document.createElement('div'), { textContent: line })))
      popup.setLngLat([f.lon, f.lat]).setDOMContent(el).addTo(map)
    }
    const pointer = () => { map.getCanvas().style.cursor = 'pointer' }
    const unpointer = () => { map.getCanvas().style.cursor = '' }
    map.on('click', POINTS, onClick)
    map.on('mouseenter', POINTS, pointer)
    map.on('mouseleave', POINTS, unpointer)

    return () => {
      map.off('click', POINTS, onClick)
      map.off('mouseenter', POINTS, pointer)
      map.off('mouseleave', POINTS, unpointer)
      unpointer()
      popup.remove()
      for (const id of LAYER_IDS) removeLayerAndSource(map, id)
      removeLayerAndSource(map, SRC)
    }
  }, [map, list])

  // 每次切入颱風圖層只縮放一次，之後不干擾使用者自行移動
  useEffect(() => {
    if (fitted.current || list.length === 0) return
    fitted.current = true
    const [w, s, e, n] = typhoonBounds(list)
    map.fitBounds([[w, s], [e, n]], { padding: fitPadding(), maxZoom: 7 })
  }, [map, list])

  return null
}
```

注意：`removeLayerAndSource(map, id)` 對圖層 id 只會移除圖層（無同名 source），最後再以 `SRC` 移除 source；順序必須是先移圖層再移 source。

- [ ] **Step 2：`DataLayers.tsx`**：import `useTyphoons`、`TyphoonLayer`；加 `const typhoon = useTyphoons(layer === 'typhoon')`；最後 return 改為：

```tsx
  return (
    <>
      {layer === 'wind' && !future && obs.data && <WindParticles map={map} obs={obs.data.data} />}
      {layer === 'typhoon' && typhoon.data && <TyphoonLayer map={map} list={typhoon.data.data} />}
    </>
  )
```

- [ ] **Step 3：`styles.css`**（`.maplibregl-ctrl-attrib` 那行之前加）

```css
/* 颱風路徑點 popup */
.typhoon-popup .maplibregl-popup-content { background: var(--glass); color: var(--text); border: 1px solid var(--glass-border); border-radius: 8px; font-size: 12px; line-height: 1.6; backdrop-filter: blur(12px); }
.typhoon-popup .maplibregl-popup-tip { display: none; }
```

- [ ] **Step 4：驗證**

Run: `npm run typecheck && npm test`
Expected: 無錯誤、全部 PASS

- [ ] **Step 5：Commit**

```bash
git add frontend/src/components/TyphoonLayer.tsx frontend/src/components/DataLayers.tsx frontend/src/styles.css
git commit  # feat(web): draw typhoon tracks with popups
```

---

### Task 6：資訊卡

**Files:**
- Create: `frontend/src/components/TyphoonCard.tsx`
- Modify: `frontend/src/App.tsx`、`frontend/src/styles.css`

- [ ] **Step 1：`TyphoonCard.tsx`**

```tsx
import { useTyphoons } from '../api'
import { fixLines } from '../lib/typhoon'

export default function TyphoonCard() {
  const q = useTyphoons(true)
  const list = q.data?.data ?? []
  return (
    <aside className="card glass" aria-label="颱風資訊">
      <header><h2>🌀 熱帶氣旋</h2></header>
      {q.isLoading && <div className="skeleton" />}
      {q.isError && <p>無法載入颱風資料，請稍後再試。</p>}
      {q.data && list.length === 0 && <p className="muted">目前無活動中的熱帶氣旋</p>}
      {list.map(t => {
        const now = t.past.at(-1)
        return (
          <section key={t.id} className="typhoon">
            <h3>{t.name}{t.nameEn && <span className="muted"> {t.nameEn}</span>}</h3>
            {now && fixLines(now).map((line, i) => <div key={i} className={i === 0 ? 'muted' : ''}>{line}</div>)}
          </section>
        )
      })}
    </aside>
  )
}
```

- [ ] **Step 2：`App.tsx`**：import `TyphoonCard` 與 `useStore`；在元件內加 `const layer = useStore(s => s.layer)`，把 `<LocationCard />` 改為：

```tsx
      {layer === 'typhoon' ? <TyphoonCard /> : <LocationCard />}
```

- [ ] **Step 3：`styles.css`**（`.skeleton` 那行之後加）

```css
.typhoon { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--glass-border); line-height: 1.7; }
.typhoon h3 { margin: 0 0 4px; font-size: 16px; }
```

- [ ] **Step 4：驗證**

Run: `npm run typecheck && npm test`
Expected: 無錯誤、全部 PASS

- [ ] **Step 5：Commit**

```bash
git add frontend/src/components/TyphoonCard.tsx frontend/src/App.tsx frontend/src/styles.css
git commit  # feat(web): add typhoon info card
```

---

### Task 7：實機驗證

- [ ] **Step 1：啟動**：`npm run dev`（vite 的 `apiDev` plugin 會直接執行 `api/*.ts`，需 `.env` 內的 `CWA_API_KEY`），開 http://localhost:5173/?layer=typhoon。
- [ ] **Step 2：桌面版檢查**（截圖）：
  - 自動縮放後台灣與舒力基整條路徑都在畫面內，不被左側卡片遮住
  - 過去路徑實線、預測路徑虛線且從目前位置接續、70% 潛勢圓外框、紅色七級風暴風圈
  - 點過去點／預測點出現 popup，預測點顯示「+Nh 預測」；點台灣陸地不會選鄉鎮
  - 資訊卡顯示名稱、觀測時間、氣壓、風速陣風、移向移速、七級風半徑
  - 時間軸停用；StatusBadge 顯示「更新於 …」
  - 切回溫度圖層：颱風圖層與 popup 全部消失，LocationCard 恢復；再切回颱風會再縮放一次
- [ ] **Step 3：手機寬度（390px）檢查**：卡片在底部，縮放範圍不被卡片遮住。
- [ ] **Step 4：若有調整就 commit**，最後跑 `npm run typecheck && npm test` 並回報結果（含截圖）。
