# CWA 天氣地圖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 CWA 開放資料建立類 Windy 的全螢幕互動天氣地圖（React 前端 + Vercel Functions 後端 + SQLite），推上 GitHub 並部署到 Vercel。

**Architecture:** 單一 repo、前後端分離：`frontend/`（Vite SPA，只呼叫 `/api/*`）、`api/`（Vercel Functions，Web 標準 `GET(request)`）、`server/`（CWA client、轉換、SQLite repository、快取新鮮度）。Build 時產生 `data/weather.db` 種子 DB 並打包；冷啟動複製到 `/tmp` 讀寫，過期時向 CWA 重抓。

**Tech Stack:** TypeScript、React 19、Vite、MapLibre GL、Recharts、TanStack Query、Zustand、topojson-client、taiwan-atlas、better-sqlite3、Vitest、Vercel CLI、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-09-23-cwa-weather-map-design.md`

**Conventions:**
- 後端（`api/`、`server/`、`scripts/`、`shared/`）是 Node ESM + `module: NodeNext`，**相對 import 一律寫 `.js` 副檔名**（Vercel 執行期需要）。
- 前端 import 不寫副檔名；從 `shared/` 只用 `import type`。
- Commit 訊息遵循 `commit-message` skill：英文 conventional subject + 繁中段落 + 英文段落，不加 trailer。以下各 Task 只列 subject。
- CWA 授權碼放在 `.env`（`CWA_API_KEY=...`，已存在且被 gitignore）。**任何輸出都不可印出授權碼。**
- Fixture 已存在於 `server/__fixtures__/`（從實際 API 擷取並裁切）。

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, vercel.json, .gitignore
shared/types.ts                     API 資料型別（前後端共用）
server/__fixtures__/*.json          CWA 真實回應樣本（已存在）
server/__fixtures__/load.ts         fixture 載入 helper
server/cwa/parse.ts                 CWA JSON → 內部 row
server/cwa/client.ts                CWA HTTP client（Fetcher 介面）
server/db.ts                        SQLite 連線、schema、/tmp 種子複製
server/repo.ts                      SQL 查詢
server/sync.ts                      抓取 + 轉換 + 寫入
server/freshness.ts                 TTL 判斷與退路
server/service.ts                   端點層商業邏輯
server/http.ts                      Response helpers
api/observations.ts, towns.ts, forecast.ts, forecast-grid.ts, radar.ts, satellite.ts
scripts/build-db.ts                 build 時產生 data/weather.db
.github/workflows/refresh.yml       每 3 小時觸發 Deploy Hook
frontend/index.html, vite.config.ts, tsconfig.json
frontend/src/main.tsx, App.tsx, store.ts, api.ts, styles.css, env.d.ts
frontend/src/lib/{mercator,idw,colorScale,layers,geo,format,week,wx,wind,urlState,reproject,heat}.ts (+ *.test.ts)
frontend/src/map/{helpers,useImageOverlay,useChoropleth}.ts
frontend/src/components/{MapView,DataLayers,WindParticles,LayerPicker,Timeline,Legend,SearchBox,StatusBadge,LocationCard,ForecastChart,SelectionMarker}.tsx
```

---

### Task 1: Scaffold & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `shared/types.ts`, `server/__fixtures__/load.ts`, `server/__fixtures__/load.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "aiot03",
  "private": true,
  "type": "module",
  "engines": { "node": "22.x" },
  "scripts": {
    "dev": "vite --config frontend/vite.config.ts",
    "build:db": "tsx --env-file-if-exists=.env scripts/build-db.ts",
    "build": "npm run build:db && vite build --config frontend/vite.config.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p frontend/tsconfig.json"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install better-sqlite3 react react-dom maplibre-gl recharts @tanstack/react-query zustand topojson-client taiwan-atlas
npm install -D typescript vite @vitejs/plugin-react vitest tsx @types/better-sqlite3 @types/react @types/react-dom @types/topojson-client @types/geojson @types/node
```
Expected: 安裝成功，產生 `package-lock.json`。

- [ ] **Step 3: Create `tsconfig.json`（後端）**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["api", "server", "scripts", "shared"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'frontend/src/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 5: Create `shared/types.ts`**

```ts
export type Bounds = [west: number, south: number, east: number, north: number]

export interface Observation {
  stationId: string
  name: string
  lat: number
  lon: number
  obsTime: string
  temp: number | null
  humidity: number | null
  windSpeed: number | null
  windDir: number | null
  rain1h: number | null
  rain24h: number | null
}

export interface Town {
  id: string
  name: string
  county: string
  lat: number
  lon: number
}

export interface ForecastSlot {
  start: string
  temp: number | null
  pop: number | null
  humidity: number | null
  windSpeed: number | null
  windDir: string | null
  wx: string | null
  wxCode: string | null
}

export interface WeekSlot {
  start: string
  end: string
  minTemp: number | null
  maxTemp: number | null
  pop: number | null
  wx: string | null
  wxCode: string | null
}

export interface TownForecast {
  town: Town
  hourly3: ForecastSlot[]
  week: WeekSlot[]
}

export interface GridCell {
  townId: string
  temp: number | null
  pop: number | null
  humidity: number | null
  windSpeed: number | null
}

export interface ForecastGrid {
  times: string[]
  time: string | null
  cells: GridCell[]
}

export type ImageKind = 'radar' | 'satellite'

export interface ImageOverlay {
  kind: ImageKind
  url: string
  obsTime: string
  bounds: Bounds
}

export interface ApiResponse<T> {
  data: T
  updatedAt: string | null
  stale: boolean
}
```

- [ ] **Step 6: Write the failing test `server/__fixtures__/load.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { fixture } from './load.js'

describe('fixture', () => {
  it('loads a CWA fixture', () => {
    expect(fixture('O-A0001-001.json').success).toBe('true')
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run server/__fixtures__/load.test.ts`
Expected: FAIL（找不到 `./load.js`）

- [ ] **Step 8: Create `server/__fixtures__/load.ts`**

```ts
import fs from 'node:fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fixture = (name: string): any =>
  JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'))
```

- [ ] **Step 9: Run test & typecheck**

Run: `npx vitest run server/__fixtures__/load.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: 1 passed；tsc 無錯誤。

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts shared server/__fixtures__
git commit   # subject: "build: scaffold project and add cwa fixtures"
```

---

### Task 2: CWA 回應轉換（parse）

**Files:**
- Create: `server/cwa/parse.ts`
- Test: `server/cwa/parse.test.ts`

Fixture 內的已知值（直接取自實際資料）：
- `O-A0001-001`：`C0X110` 臺南市南區，WGS84 `22.961189, 120.188378`，溫度 29.8、濕度 69、風速 1.8、風向 335；`C0V360` 全為 `-99`。
- `O-A0002-001`：`C1I230` 九份二山 `23.962025, 120.845272`，`Past1hr` 0.0、`Past24hr` 0.0。
- `F-D0047-093-3d`：宜蘭縣，宜蘭市 `10002010`（`24.753707, 121.745083`）、羅東鎮 `10002020`；宜蘭市第一格 `2026-09-23T18:00:00+08:00`：溫度 27、降雨機率 20、濕度 77、風速 3、風向「偏東風」、天氣「多雲」/`04`；共 32 格。
- `F-D0047-093-week`：宜蘭市第一格 `2026-09-23T18:00:00+08:00` ~ `2026-09-24T06:00:00+08:00`：最低 23、最高 27、降雨機率 20、「多雲」/`04`；共 15 格。
- `O-A0058-005`：範圍 `115.00-126.50` / `17.75-29.25`，時間 `2026-09-23T19:20:00+08:00`。
- `O-B0032-002`：範圍 `102.0-155.0` / `0.0-50.0`，時間 `2026-09-23T19:10:00+08:00`。

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { fixture } from '../__fixtures__/load.js'
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage,
} from './parse.js'

describe('num', () => {
  it('parses numbers and maps missing markers to null', () => {
    expect(num('29.8')).toBe(29.8)
    expect(num('0.0')).toBe(0)
    expect(num('-99')).toBeNull()
    expect(num('-999')).toBeNull()
    expect(num(' ')).toBeNull()
    expect(num('X')).toBeNull()
    expect(num(undefined)).toBeNull()
  })
})

describe('parseWeatherStations', () => {
  const { stations, obs } = parseWeatherStations(fixture('O-A0001-001.json'))
  it('uses WGS84 coordinates', () => {
    expect(stations[0]).toEqual({ id: 'C0X110', name: '臺南市南區', county: '臺南市', town: '南區', lat: 22.961189, lon: 120.188378 })
  })
  it('maps weather values and -99 to null', () => {
    expect(obs[0]).toEqual({ stationId: 'C0X110', obsTime: '2026-09-23T19:00:00+08:00', temp: 29.8, humidity: 69, windSpeed: 1.8, windDir: 335 })
    expect(obs.find(o => o.stationId === 'C0V360')).toMatchObject({ temp: null, humidity: null, windSpeed: null, windDir: null })
  })
})

describe('parseRainStations', () => {
  it('reads 1h and 24h rainfall', () => {
    const { stations, obs } = parseRainStations(fixture('O-A0002-001.json'))
    expect(stations[0]).toMatchObject({ id: 'C1I230', name: '九份二山', lat: 23.962025, lon: 120.845272 })
    expect(obs[0]).toEqual({ stationId: 'C1I230', obsTime: '2026-09-23T19:20:00+08:00', rain1h: 0, rain24h: 0 })
  })
})

describe('parseForecast3h', () => {
  const { towns, slots } = parseForecast3h(fixture('F-D0047-093-3d.json'))
  it('reads towns with centroid', () => {
    expect(towns).toHaveLength(2)
    expect(towns[0]).toEqual({ id: '10002010', name: '宜蘭市', county: '宜蘭縣', lat: 24.753707, lon: 121.745083 })
  })
  it('builds one slot per 3h period', () => {
    expect(slots.filter(s => s.townId === '10002010')).toHaveLength(32)
    expect(slots[0]).toEqual({
      townId: '10002010', start: '2026-09-23T18:00:00+08:00', temp: 27, pop: 20, humidity: 77,
      windSpeed: 3, windDir: '偏東風', wx: '多雲', wxCode: '04',
    })
  })
})

describe('parseForecastWeek', () => {
  it('builds 12h slots', () => {
    const { slots } = parseForecastWeek(fixture('F-D0047-093-week.json'))
    expect(slots.filter(s => s.townId === '10002010')).toHaveLength(15)
    expect(slots[0]).toEqual({
      townId: '10002010', start: '2026-09-23T18:00:00+08:00', end: '2026-09-24T06:00:00+08:00',
      minTemp: 23, maxTemp: 27, pop: 20, wx: '多雲', wxCode: '04',
    })
  })
})

describe('parseImage', () => {
  it('parses radar metadata', () => {
    expect(parseImage(fixture('O-A0058-005.json'), 'radar')).toEqual({
      kind: 'radar',
      url: 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-A0058-005.png',
      obsTime: '2026-09-23T19:20:00+08:00',
      bounds: [115, 17.75, 126.5, 29.25],
    })
  })
  it('parses satellite metadata', () => {
    expect(parseImage(fixture('O-B0032-002.json'), 'satellite')).toEqual({
      kind: 'satellite',
      url: 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-B0032-002.jpg',
      obsTime: '2026-09-23T19:10:00+08:00',
      bounds: [102, 0, 155, 50],
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: FAIL（找不到 `./parse.js`）

- [ ] **Step 3: Implement `server/cwa/parse.ts`**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- CWA JSON is external, shapes verified by fixtures */
import type { Bounds, ForecastSlot, ImageKind, ImageOverlay, Town, WeekSlot } from '../../shared/types.js'

export interface StationRow { id: string; name: string; county: string; town: string; lat: number; lon: number }
export interface WeatherObsRow { stationId: string; obsTime: string; temp: number | null; humidity: number | null; windSpeed: number | null; windDir: number | null }
export interface RainObsRow { stationId: string; obsTime: string; rain1h: number | null; rain24h: number | null }
export interface Slot3hRow extends ForecastSlot { townId: string }
export interface WeekRow extends WeekSlot { townId: string }

/** CWA 以 -99、-999 等表示缺值；空字串或非數字也視為缺值。 */
export function num(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > -90 ? n : null
}

function stationRow(s: any): StationRow | null {
  const c = s.GeoInfo.Coordinates.find((x: any) => x.CoordinateName === 'WGS84')
  const lat = num(c?.StationLatitude)
  const lon = num(c?.StationLongitude)
  if (lat == null || lon == null) return null
  return { id: s.StationId, name: s.StationName, county: s.GeoInfo.CountyName, town: s.GeoInfo.TownName, lat, lon }
}

export function parseWeatherStations(json: any): { stations: StationRow[]; obs: WeatherObsRow[] } {
  const stations: StationRow[] = []
  const obs: WeatherObsRow[] = []
  for (const s of json.records.Station) {
    const st = stationRow(s)
    if (!st) continue
    const w = s.WeatherElement
    stations.push(st)
    obs.push({
      stationId: s.StationId,
      obsTime: s.ObsTime.DateTime,
      temp: num(w.AirTemperature),
      humidity: num(w.RelativeHumidity),
      windSpeed: num(w.WindSpeed),
      windDir: num(w.WindDirection),
    })
  }
  return { stations, obs }
}

export function parseRainStations(json: any): { stations: StationRow[]; obs: RainObsRow[] } {
  const stations: StationRow[] = []
  const obs: RainObsRow[] = []
  for (const s of json.records.Station) {
    const st = stationRow(s)
    if (!st) continue
    const r = s.RainfallElement
    stations.push(st)
    obs.push({
      stationId: s.StationId,
      obsTime: s.ObsTime.DateTime,
      rain1h: num(r.Past1hr?.Precipitation),
      rain24h: num(r.Past24hr?.Precipitation),
    })
  }
  return { stations, obs }
}

type CwaTime = { DataTime?: string; StartTime?: string; EndTime?: string; ElementValue: Record<string, string>[] }

function elements(loc: any): Map<string, CwaTime[]> {
  return new Map(loc.WeatherElement.map((e: any) => [e.ElementName, e.Time]))
}

function valueAt(times: CwaTime[] | undefined, start: string, key: string): string | undefined {
  return times?.find(t => (t.DataTime ?? t.StartTime) === start)?.ElementValue[0]?.[key]
}

function* locations(json: any): Generator<{ county: string; loc: any }> {
  for (const group of json.records.Locations) {
    for (const loc of group.Location) yield { county: group.LocationsName, loc }
  }
}

export function parseForecast3h(json: any): { towns: Town[]; slots: Slot3hRow[] } {
  const towns: Town[] = []
  const slots: Slot3hRow[] = []
  for (const { county, loc } of locations(json)) {
    const lat = num(loc.Latitude)
    const lon = num(loc.Longitude)
    if (lat == null || lon == null) continue
    const townId: string = loc.Geocode
    towns.push({ id: townId, name: loc.LocationName, county, lat, lon })
    const el = elements(loc)
    for (const p of el.get('3小時降雨機率') ?? []) {
      const start = p.StartTime!
      slots.push({
        townId,
        start,
        temp: num(valueAt(el.get('溫度'), start, 'Temperature')),
        pop: num(p.ElementValue[0]?.ProbabilityOfPrecipitation),
        humidity: num(valueAt(el.get('相對濕度'), start, 'RelativeHumidity')),
        windSpeed: num(valueAt(el.get('風速'), start, 'WindSpeed')),
        windDir: valueAt(el.get('風向'), start, 'WindDirection') ?? null,
        wx: valueAt(el.get('天氣現象'), start, 'Weather') ?? null,
        wxCode: valueAt(el.get('天氣現象'), start, 'WeatherCode') ?? null,
      })
    }
  }
  return { towns, slots }
}

export function parseForecastWeek(json: any): { slots: WeekRow[] } {
  const slots: WeekRow[] = []
  for (const { loc } of locations(json)) {
    const el = elements(loc)
    for (const w of el.get('天氣現象') ?? []) {
      const start = w.StartTime!
      slots.push({
        townId: loc.Geocode,
        start,
        end: w.EndTime!,
        minTemp: num(valueAt(el.get('最低溫度'), start, 'MinTemperature')),
        maxTemp: num(valueAt(el.get('最高溫度'), start, 'MaxTemperature')),
        pop: num(valueAt(el.get('12小時降雨機率'), start, 'ProbabilityOfPrecipitation')),
        wx: w.ElementValue[0]?.Weather ?? null,
        wxCode: w.ElementValue[0]?.WeatherCode ?? null,
      })
    }
  }
  return { slots }
}

const RANGE = /^(-?[\d.]+)-(-?[\d.]+)$/

function range(s: string): [number, number] {
  const m = RANGE.exec(s.trim())
  if (!m) throw new Error(`Unexpected range: ${s}`)
  return [Number(m[1]), Number(m[2])]
}

export function parseImage(json: any, kind: ImageKind): ImageOverlay {
  const ds = json.cwaopendata.dataset
  const geo = kind === 'radar' ? ds.datasetInfo.parameterSet : ds.GeoInfo
  const [west, east] = range(geo.LongitudeRange)
  const [south, north] = range(geo.LatitudeRange)
  const bounds: Bounds = [west, south, east, north]
  return kind === 'radar'
    ? { kind, url: ds.resource.ProductURL, obsTime: ds.DateTime, bounds }
    : { kind, url: ds.Resource.ProductURL, obsTime: ds.ObsTime.Datetime, bounds }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run server/cwa/parse.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add server/cwa
git commit   # subject: "feat(server): parse cwa observation and forecast data"
```

---

### Task 3: SQLite 連線與 repository

**Files:**
- Create: `server/db.ts`, `server/repo.ts`
- Test: `server/repo.test.ts`

- [ ] **Step 1: Write the failing test `server/repo.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { fixture } from './__fixtures__/load.js'
import { openDb, type DB } from './db.js'
import {
  replaceObservations, listObservations, replaceForecasts, listTowns, getTownForecast,
  listGridTimes, getGrid, upsertImage, getImage, logFetch, getFetchedAt,
} from './repo.js'
import { parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage } from './cwa/parse.js'

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('observations', () => {
  it('merges weather and rain stations and replaces on re-sync', () => {
    const weather = parseWeatherStations(fixture('O-A0001-001.json'))
    const rain = parseRainStations(fixture('O-A0002-001.json'))
    replaceObservations(db, weather, rain)
    replaceObservations(db, weather, rain)
    const rows = listObservations(db)
    expect(rows).toHaveLength(5)
    expect(rows.find(r => r.stationId === 'C0X110')).toEqual({
      stationId: 'C0X110', name: '臺南市南區', lat: 22.961189, lon: 120.188378, obsTime: '2026-09-23T19:00:00+08:00',
      temp: 29.8, humidity: 69, windSpeed: 1.8, windDir: 335, rain1h: null, rain24h: null,
    })
    expect(rows.find(r => r.stationId === 'C1I230')).toMatchObject({ temp: null, rain1h: 0, rain24h: 0 })
  })
})

describe('forecasts', () => {
  beforeEach(() => {
    replaceForecasts(db, parseForecast3h(fixture('F-D0047-093-3d.json')), parseForecastWeek(fixture('F-D0047-093-week.json')))
  })
  it('lists towns', () => {
    expect(listTowns(db).map(t => t.id)).toEqual(['10002010', '10002020'])
  })
  it('returns a town forecast', () => {
    const f = getTownForecast(db, '10002010')!
    expect(f.town.name).toBe('宜蘭市')
    expect(f.hourly3).toHaveLength(32)
    expect(f.hourly3[0]).toEqual({
      start: '2026-09-23T18:00:00+08:00', temp: 27, pop: 20, humidity: 77, windSpeed: 3, windDir: '偏東風', wx: '多雲', wxCode: '04',
    })
    expect(f.week).toHaveLength(15)
    expect(getTownForecast(db, 'nope')).toBeNull()
  })
  it('returns grid times and cells', () => {
    const times = listGridTimes(db)
    expect(times[0]).toBe('2026-09-23T18:00:00+08:00')
    expect(times).toHaveLength(32)
    expect(getGrid(db, times[0])).toContainEqual({ townId: '10002010', temp: 27, pop: 20, humidity: 77, windSpeed: 3 })
  })
})

describe('images & fetch log', () => {
  it('stores image overlays', () => {
    const radar = parseImage(fixture('O-A0058-005.json'), 'radar')
    upsertImage(db, radar)
    expect(getImage(db, 'radar')).toEqual(radar)
    expect(getImage(db, 'satellite')).toBeNull()
  })
  it('records fetch times', () => {
    expect(getFetchedAt(db, 'observations')).toBeNull()
    logFetch(db, 'observations', '2026-09-23T11:00:00.000Z')
    expect(getFetchedAt(db, 'observations')).toBe('2026-09-23T11:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/repo.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: Implement `server/db.ts`**

```ts
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stations (id TEXT PRIMARY KEY, name TEXT, county TEXT, town TEXT, lat REAL, lon REAL);
CREATE TABLE IF NOT EXISTS observations (
  station_id TEXT PRIMARY KEY, obs_time TEXT, temp REAL, humidity REAL,
  wind_speed REAL, wind_dir REAL, rain_1h REAL, rain_24h REAL);
CREATE TABLE IF NOT EXISTS towns (id TEXT PRIMARY KEY, name TEXT, county TEXT, lat REAL, lon REAL);
CREATE TABLE IF NOT EXISTS forecast_3h (
  town_id TEXT, start_time TEXT, temp REAL, pop REAL, humidity REAL,
  wind_speed REAL, wind_dir TEXT, wx TEXT, wx_code TEXT, PRIMARY KEY (town_id, start_time));
CREATE TABLE IF NOT EXISTS forecast_week (
  town_id TEXT, start_time TEXT, end_time TEXT, min_temp REAL, max_temp REAL,
  pop REAL, wx TEXT, wx_code TEXT, PRIMARY KEY (town_id, start_time));
CREATE TABLE IF NOT EXISTS images (kind TEXT PRIMARY KEY, url TEXT, obs_time TEXT, west REAL, south REAL, east REAL, north REAL);
CREATE TABLE IF NOT EXISTS fetch_log (dataset TEXT PRIMARY KEY, fetched_at TEXT);
`

export function openDb(file: string): DB {
  const db = new Database(file)
  db.exec(SCHEMA)
  return db
}

const SEED = path.join(process.cwd(), 'data', 'weather.db')

export const seedExists = () => fs.existsSync(SEED)

let shared: DB | null = null

/** Vercel 只有 /tmp 可寫：冷啟動時把打包的種子 DB 複製過去，之後都讀寫這一份。 */
export function getDb(): DB {
  if (shared) return shared
  const file = path.join(os.tmpdir(), 'aiot03-weather.db')
  if (!fs.existsSync(file) && seedExists()) fs.copyFileSync(SEED, file)
  shared = openDb(file)
  return shared
}
```

- [ ] **Step 4: Implement `server/repo.ts`**

```ts
import type { DB } from './db.js'
import type { ForecastSlot, GridCell, ImageKind, ImageOverlay, Observation, Town, TownForecast, WeekSlot } from '../shared/types.js'
import type { RainObsRow, Slot3hRow, StationRow, WeatherObsRow, WeekRow } from './cwa/parse.js'

export function replaceObservations(
  db: DB,
  weather: { stations: StationRow[]; obs: WeatherObsRow[] },
  rain: { stations: StationRow[]; obs: RainObsRow[] },
): void {
  const upsertStation = db.prepare(`INSERT INTO stations (id, name, county, town, lat, lon)
    VALUES (@id, @name, @county, @town, @lat, @lon)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, county = excluded.county, town = excluded.town, lat = excluded.lat, lon = excluded.lon`)
  const insertWeather = db.prepare(`INSERT OR REPLACE INTO observations (station_id, obs_time, temp, humidity, wind_speed, wind_dir)
    VALUES (@stationId, @obsTime, @temp, @humidity, @windSpeed, @windDir)`)
  const upsertRain = db.prepare(`INSERT INTO observations (station_id, obs_time, rain_1h, rain_24h)
    VALUES (@stationId, @obsTime, @rain1h, @rain24h)
    ON CONFLICT(station_id) DO UPDATE SET rain_1h = excluded.rain_1h, rain_24h = excluded.rain_24h`)
  db.transaction(() => {
    db.prepare('DELETE FROM observations').run()
    for (const s of [...weather.stations, ...rain.stations]) upsertStation.run(s)
    for (const o of weather.obs) insertWeather.run(o)
    for (const o of rain.obs) upsertRain.run(o)
  })()
}

export function listObservations(db: DB): Observation[] {
  return db.prepare(`SELECT s.id AS stationId, s.name, s.lat, s.lon, o.obs_time AS obsTime, o.temp, o.humidity,
      o.wind_speed AS windSpeed, o.wind_dir AS windDir, o.rain_1h AS rain1h, o.rain_24h AS rain24h
    FROM observations o JOIN stations s ON s.id = o.station_id`).all() as Observation[]
}

export function replaceForecasts(db: DB, f3h: { towns: Town[]; slots: Slot3hRow[] }, week: { slots: WeekRow[] }): void {
  const upsertTown = db.prepare(`INSERT OR REPLACE INTO towns (id, name, county, lat, lon) VALUES (@id, @name, @county, @lat, @lon)`)
  const insert3h = db.prepare(`INSERT OR REPLACE INTO forecast_3h (town_id, start_time, temp, pop, humidity, wind_speed, wind_dir, wx, wx_code)
    VALUES (@townId, @start, @temp, @pop, @humidity, @windSpeed, @windDir, @wx, @wxCode)`)
  const insertWeek = db.prepare(`INSERT OR REPLACE INTO forecast_week (town_id, start_time, end_time, min_temp, max_temp, pop, wx, wx_code)
    VALUES (@townId, @start, @end, @minTemp, @maxTemp, @pop, @wx, @wxCode)`)
  db.transaction(() => {
    db.prepare('DELETE FROM forecast_3h').run()
    db.prepare('DELETE FROM forecast_week').run()
    for (const t of f3h.towns) upsertTown.run(t)
    for (const s of f3h.slots) insert3h.run(s)
    for (const s of week.slots) insertWeek.run(s)
  })()
}

export function listTowns(db: DB): Town[] {
  return db.prepare('SELECT id, name, county, lat, lon FROM towns ORDER BY id').all() as Town[]
}

export function getTownForecast(db: DB, townId: string): TownForecast | null {
  const town = db.prepare('SELECT id, name, county, lat, lon FROM towns WHERE id = ?').get(townId) as Town | undefined
  if (!town) return null
  const hourly3 = db.prepare(`SELECT start_time AS start, temp, pop, humidity, wind_speed AS windSpeed, wind_dir AS windDir, wx, wx_code AS wxCode
    FROM forecast_3h WHERE town_id = ? ORDER BY start_time`).all(townId) as ForecastSlot[]
  const week = db.prepare(`SELECT start_time AS start, end_time AS end, min_temp AS minTemp, max_temp AS maxTemp, pop, wx, wx_code AS wxCode
    FROM forecast_week WHERE town_id = ? ORDER BY start_time`).all(townId) as WeekSlot[]
  return { town, hourly3, week }
}

export function listGridTimes(db: DB): string[] {
  return (db.prepare('SELECT DISTINCT start_time AS t FROM forecast_3h ORDER BY start_time').all() as { t: string }[]).map(r => r.t)
}

export function getGrid(db: DB, time: string): GridCell[] {
  return db.prepare(`SELECT town_id AS townId, temp, pop, humidity, wind_speed AS windSpeed
    FROM forecast_3h WHERE start_time = ?`).all(time) as GridCell[]
}

export function upsertImage(db: DB, o: ImageOverlay): void {
  const [west, south, east, north] = o.bounds
  db.prepare(`INSERT OR REPLACE INTO images (kind, url, obs_time, west, south, east, north) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(o.kind, o.url, o.obsTime, west, south, east, north)
}

export function getImage(db: DB, kind: ImageKind): ImageOverlay | null {
  const r = db.prepare('SELECT * FROM images WHERE kind = ?').get(kind) as
    { kind: ImageKind; url: string; obs_time: string; west: number; south: number; east: number; north: number } | undefined
  return r ? { kind: r.kind, url: r.url, obsTime: r.obs_time, bounds: [r.west, r.south, r.east, r.north] } : null
}

export function logFetch(db: DB, dataset: string, at: string): void {
  db.prepare('INSERT OR REPLACE INTO fetch_log (dataset, fetched_at) VALUES (?, ?)').run(dataset, at)
}

export function getFetchedAt(db: DB, dataset: string): string | null {
  const r = db.prepare('SELECT fetched_at AS at FROM fetch_log WHERE dataset = ?').get(dataset) as { at: string } | undefined
  return r?.at ?? null
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run server/repo.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: 全部 PASS、tsc 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add server/db.ts server/repo.ts server/repo.test.ts
git commit   # subject: "feat(server): add sqlite schema and repository"
```

---

### Task 4: CWA client 與同步

**Files:**
- Create: `server/cwa/client.ts`, `server/sync.ts`
- Test: `server/sync.test.ts`

- [ ] **Step 1: Write the failing test `server/sync.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { fixture } from './__fixtures__/load.js'
import { openDb, type DB } from './db.js'
import type { Fetcher } from './cwa/client.js'
import { syncObservations, syncForecast, syncImage } from './sync.js'
import { listObservations, listTowns, getTownForecast, getImage, getFetchedAt } from './repo.js'

const empty = { success: 'true', records: { Station: [], Locations: [] } }

function fakeFetcher(calls: string[] = []): Fetcher {
  return {
    async dataset(id, params) {
      if (id === 'O-A0001-001') return fixture('O-A0001-001.json')
      if (id === 'O-A0003-001') return empty
      if (id === 'O-A0002-001') return fixture('O-A0002-001.json')
      if (id === 'F-D0047-093') {
        const ids = params!.locationId
        calls.push(ids)
        if (ids.startsWith('F-D0047-001,')) return fixture('F-D0047-093-3d.json')
        if (ids.startsWith('F-D0047-003,')) return fixture('F-D0047-093-week.json')
        return empty
      }
      throw new Error(`unexpected dataset ${id}`)
    },
    async file(id) { return fixture(`${id}.json`) },
  }
}

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('syncObservations', () => {
  it('stores observations and logs the fetch', async () => {
    await syncObservations(db, fakeFetcher())
    expect(listObservations(db)).toHaveLength(5)
    expect(getFetchedAt(db, 'observations')).not.toBeNull()
  })
  it('refuses to wipe data with an empty response', async () => {
    const f: Fetcher = { dataset: async () => empty, file: async () => ({}) }
    await expect(syncObservations(db, f)).rejects.toThrow('no observations')
    expect(getFetchedAt(db, 'observations')).toBeNull()
  })
})

describe('syncForecast', () => {
  it('requests all 22 counties in chunks of at most 5', async () => {
    const calls: string[] = []
    await syncForecast(db, fakeFetcher(calls))
    const ids = calls.flatMap(c => c.split(','))
    expect(calls.every(c => c.split(',').length <= 5)).toBe(true)
    expect(ids).toHaveLength(44)
    expect(ids).toContain('F-D0047-085')
    expect(ids).toContain('F-D0047-087')
    expect(listTowns(db)).toHaveLength(2)
    expect(getTownForecast(db, '10002010')!.week).toHaveLength(15)
    expect(getFetchedAt(db, 'forecast')).not.toBeNull()
  })
})

describe('syncImage', () => {
  it('stores radar metadata', async () => {
    await syncImage(db, 'radar', fakeFetcher())
    expect(getImage(db, 'radar')?.bounds).toEqual([115, 17.75, 126.5, 29.25])
    expect(getFetchedAt(db, 'radar')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/sync.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: Implement `server/cwa/client.ts`**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- CWA JSON is external */
export interface Fetcher {
  dataset(id: string, params?: Record<string, string>): Promise<any>
  file(id: string): Promise<any>
}

const BASE = 'https://opendata.cwa.gov.tw'
const TIMEOUT_MS = 8000

function apiKey(): string {
  const key = process.env.CWA_API_KEY
  if (!key) throw new Error('CWA_API_KEY is not set')
  return key
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`CWA HTTP ${res.status} ${url.replace(/Authorization=[^&]+/, 'Authorization=***')}`)
  return res.json()
}

export const cwa: Fetcher = {
  async dataset(id, params = {}) {
    const q = new URLSearchParams({ Authorization: apiKey(), ...params })
    const json = await getJson(`${BASE}/api/v1/rest/datastore/${id}?${q}`)
    if (json.success !== 'true') throw new Error(`CWA ${id} returned success=${json.success}`)
    return json
  },
  // fileapi 會 302 轉址到 S3，fetch 預設會跟隨
  file(id) {
    const q = new URLSearchParams({ Authorization: apiKey(), format: 'JSON' })
    return getJson(`${BASE}/fileapi/v1/opendataapi/${id}?${q}`)
  },
}
```

- [ ] **Step 4: Implement `server/sync.ts`**

```ts
import type { DB } from './db.js'
import type { ImageKind } from '../shared/types.js'
import { cwa, type Fetcher } from './cwa/client.js'
import { parseForecast3h, parseForecastWeek, parseImage, parseRainStations, parseWeatherStations } from './cwa/parse.js'
import { logFetch, replaceForecasts, replaceObservations, upsertImage } from './repo.js'

// F-D0047-001 起每 4 號一個縣市：+0 為 3 天預報、+2 為一週預報
const countyIds = (offset: number) =>
  Array.from({ length: 22 }, (_, i) => `F-D0047-${String(1 + offset + 4 * i).padStart(3, '0')}`)

// F-D0047-093 每次最多回傳 5 個縣市
const CHUNK = 5

const IMAGE_IDS: Record<ImageKind, string> = { radar: 'O-A0058-005', satellite: 'O-B0032-002' }

const now = () => new Date().toISOString()

export async function syncObservations(db: DB, f: Fetcher = cwa): Promise<void> {
  const [auto, manned, rainJson] = await Promise.all([
    f.dataset('O-A0001-001'), f.dataset('O-A0003-001'), f.dataset('O-A0002-001'),
  ])
  const a = parseWeatherStations(auto)
  const b = parseWeatherStations(manned)
  const rain = parseRainStations(rainJson)
  if (a.obs.length + b.obs.length + rain.obs.length === 0) throw new Error('CWA returned no observations')
  replaceObservations(db, { stations: [...a.stations, ...b.stations], obs: [...a.obs, ...b.obs] }, rain)
  logFetch(db, 'observations', now())
}

async function fetchCounties(f: Fetcher, ids: string[]) {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
  const results = await Promise.all(chunks.map(c => f.dataset('F-D0047-093', { locationId: c.join(',') })))
  return { records: { Locations: results.flatMap(r => r.records.Locations) } }
}

export async function syncForecast(db: DB, f: Fetcher = cwa): Promise<void> {
  const [threeDay, week] = await Promise.all([fetchCounties(f, countyIds(0)), fetchCounties(f, countyIds(2))])
  const f3h = parseForecast3h(threeDay)
  if (f3h.towns.length === 0) throw new Error('CWA returned no town forecasts')
  replaceForecasts(db, f3h, parseForecastWeek(week))
  logFetch(db, 'forecast', now())
}

export async function syncImage(db: DB, kind: ImageKind, f: Fetcher = cwa): Promise<void> {
  upsertImage(db, parseImage(await f.file(IMAGE_IDS[kind]), kind))
  logFetch(db, kind, now())
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run server && npx tsc --noEmit -p tsconfig.json`
Expected: 全部 PASS、tsc 無錯誤。

- [ ] **Step 6: Live smoke check（真的打 CWA，不印授權碼）**

Run:
```bash
node --env-file=.env --import tsx -e "
import('./server/db.js').then(async ({ openDb }) => {
  const { syncObservations, syncForecast, syncImage } = await import('./server/sync.js')
  const { listObservations, listTowns } = await import('./server/repo.js')
  const db = openDb(':memory:')
  await syncObservations(db); await syncForecast(db); await syncImage(db, 'radar'); await syncImage(db, 'satellite')
  console.log('obs', listObservations(db).length, 'towns', listTowns(db).length)
})"
```
Expected: `obs` 約 1500 以上、`towns` 約 368。若 towns 遠少於 368，代表每批上限不是 5，把 `CHUNK` 調小並重跑。

- [ ] **Step 7: Commit**

```bash
git add server/cwa/client.ts server/sync.ts server/sync.test.ts
git commit   # subject: "feat(server): fetch and sync cwa datasets"
```

---

### Task 5: 新鮮度判斷與 service 層

**Files:**
- Create: `server/freshness.ts`, `server/service.ts`
- Test: `server/freshness.test.ts`

- [ ] **Step 1: Write the failing test `server/freshness.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { openDb, type DB } from './db.js'
import { logFetch } from './repo.js'
import { ensureFresh, TTL } from './freshness.js'

let db: DB
const NOW = Date.parse('2026-09-23T12:00:00.000Z')
beforeEach(() => { db = openDb(':memory:'); vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('ensureFresh', () => {
  it('skips sync when data is fresh', async () => {
    logFetch(db, 'observations', new Date(NOW - 60_000).toISOString())
    const sync = vi.fn()
    const meta = await ensureFresh(db, 'observations', sync, NOW)
    expect(sync).not.toHaveBeenCalled()
    expect(meta).toEqual({ updatedAt: '2026-09-23T11:59:00.000Z', stale: false })
  })

  it('syncs when expired', async () => {
    logFetch(db, 'observations', new Date(NOW - TTL.observations - 1).toISOString())
    const sync = vi.fn(async () => logFetch(db, 'observations', new Date(NOW).toISOString()))
    const meta = await ensureFresh(db, 'observations', sync, NOW)
    expect(sync).toHaveBeenCalledOnce()
    expect(meta).toEqual({ updatedAt: '2026-09-23T12:00:00.000Z', stale: false })
  })

  it('falls back to old data and marks stale when sync fails', async () => {
    logFetch(db, 'forecast', '2026-09-23T08:00:00.000Z')
    const meta = await ensureFresh(db, 'forecast', async () => { throw new Error('boom') }, NOW)
    expect(meta).toEqual({ updatedAt: '2026-09-23T08:00:00.000Z', stale: true })
  })

  it('reports null updatedAt when never fetched and sync fails', async () => {
    const meta = await ensureFresh(db, 'radar', async () => { throw new Error('boom') }, NOW)
    expect(meta).toEqual({ updatedAt: null, stale: true })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/freshness.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: Implement `server/freshness.ts`**

```ts
import type { DB } from './db.js'
import { getFetchedAt } from './repo.js'

const MIN = 60_000

export const TTL = {
  observations: 10 * MIN,
  forecast: 60 * MIN,
  radar: 10 * MIN,
  satellite: 10 * MIN,
} as const

export type DatasetKey = keyof typeof TTL

export interface Freshness { updatedAt: string | null; stale: boolean }

/** 過期才向 CWA 重抓；失敗時沿用 SQLite 內的舊資料並標示 stale。 */
export async function ensureFresh(db: DB, key: DatasetKey, sync: () => Promise<void>, now = Date.now()): Promise<Freshness> {
  const expired = (at: string | null) => at == null || now - Date.parse(at) > TTL[key]
  if (expired(getFetchedAt(db, key))) {
    try {
      await sync()
    } catch (e) {
      console.error(`sync ${key} failed`, e)
    }
  }
  const updatedAt = getFetchedAt(db, key)
  return { updatedAt, stale: expired(updatedAt) }
}
```

- [ ] **Step 4: Implement `server/service.ts`**

```ts
import type { ApiResponse, ForecastGrid, ImageKind, ImageOverlay, Observation, Town, TownForecast } from '../shared/types.js'
import { getDb } from './db.js'
import { ensureFresh } from './freshness.js'
import { getGrid, getImage, getTownForecast, listGridTimes, listObservations, listTowns } from './repo.js'
import { syncForecast, syncImage, syncObservations } from './sync.js'

export async function getObservations(): Promise<ApiResponse<Observation[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'observations', () => syncObservations(db))
  return { data: listObservations(db), ...meta }
}

const freshForecast = () => {
  const db = getDb()
  return ensureFresh(db, 'forecast', () => syncForecast(db)).then(meta => ({ db, meta }))
}

export async function getTowns(): Promise<ApiResponse<Town[]>> {
  const { db, meta } = await freshForecast()
  return { data: listTowns(db), ...meta }
}

export async function getForecast(townId: string): Promise<ApiResponse<TownForecast> | null> {
  const { db, meta } = await freshForecast()
  const data = getTownForecast(db, townId)
  return data ? { data, ...meta } : null
}

export async function getForecastGrid(time: string | null): Promise<ApiResponse<ForecastGrid>> {
  const { db, meta } = await freshForecast()
  return { data: { times: listGridTimes(db), time, cells: time ? getGrid(db, time) : [] }, ...meta }
}

export async function getImageOverlay(kind: ImageKind): Promise<ApiResponse<ImageOverlay> | null> {
  const db = getDb()
  const meta = await ensureFresh(db, kind, () => syncImage(db, kind))
  const data = getImage(db, kind)
  return data ? { data, ...meta } : null
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run server && npx tsc --noEmit -p tsconfig.json`
Expected: 全部 PASS、tsc 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add server/freshness.ts server/freshness.test.ts server/service.ts
git commit   # subject: "feat(server): add cache freshness and service layer"
```

---

### Task 6: API 端點、build-db script、vercel.json

**Files:**
- Create: `server/http.ts`, `api/observations.ts`, `api/towns.ts`, `api/forecast.ts`, `api/forecast-grid.ts`, `api/radar.ts`, `api/satellite.ts`, `scripts/build-db.ts`, `vercel.json`

- [ ] **Step 1: Create `server/http.ts`**

```ts
import { seedExists } from './db.js'

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': status === 200 ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store',
      'x-seed-db': seedExists() ? 'present' : 'missing',
    },
  })
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    console.error(e)
    return json({ error: 'Internal server error' }, 500)
  }
}
```

- [ ] **Step 2: Create the six endpoints**

`api/observations.ts`
```ts
import { handle, json } from '../server/http.js'
import { getObservations } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getObservations()))
}
```

`api/towns.ts`
```ts
import { handle, json } from '../server/http.js'
import { getTowns } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getTowns()))
}
```

`api/forecast.ts`
```ts
import { handle, json } from '../server/http.js'
import { getForecast } from '../server/service.js'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const town = new URL(request.url).searchParams.get('town')
    if (!town) return json({ error: 'Missing town parameter' }, 400)
    const result = await getForecast(town)
    return result ? json(result) : json({ error: 'Town not found' }, 404)
  })
}
```

`api/forecast-grid.ts`
```ts
import { handle, json } from '../server/http.js'
import { getForecastGrid } from '../server/service.js'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => json(await getForecastGrid(new URL(request.url).searchParams.get('time'))))
}
```

`api/radar.ts`
```ts
import { handle, json } from '../server/http.js'
import { getImageOverlay } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => {
    const result = await getImageOverlay('radar')
    return result ? json(result) : json({ error: 'Radar image unavailable' }, 503)
  })
}
```

`api/satellite.ts`
```ts
import { handle, json } from '../server/http.js'
import { getImageOverlay } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => {
    const result = await getImageOverlay('satellite')
    return result ? json(result) : json({ error: 'Satellite image unavailable' }, 503)
  })
}
```

- [ ] **Step 3: Create `scripts/build-db.ts`**

```ts
import fs from 'node:fs'
import { openDb } from '../server/db.js'
import { syncForecast, syncImage, syncObservations } from '../server/sync.js'

const FILE = 'data/weather.db'

if (!process.env.CWA_API_KEY) {
  console.error('CWA_API_KEY is not set')
  process.exit(1)
}

fs.mkdirSync('data', { recursive: true })
fs.rmSync(FILE, { force: true })
const db = openDb(FILE)

const steps: [string, () => Promise<void>][] = [
  ['observations', () => syncObservations(db)],
  ['forecast', () => syncForecast(db)],
  ['radar', () => syncImage(db, 'radar')],
  ['satellite', () => syncImage(db, 'satellite')],
]
// 單一資料集失敗不中斷 build：執行期會再向 CWA 補抓
for (const [name, run] of steps) {
  try {
    await run()
    console.log(`✓ ${name}`)
  } catch (e) {
    console.error(`✗ ${name}`, e)
  }
}

const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
console.log(Object.fromEntries(['stations', 'observations', 'towns', 'forecast_3h', 'forecast_week', 'images'].map(t => [t, count(t)])))
db.close()
```

- [ ] **Step 4: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "regions": ["hnd1"],
  "functions": {
    "api/*.ts": { "includeFiles": "data/weather.db", "maxDuration": 30 }
  },
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

- [ ] **Step 5: Verify build-db and endpoints locally**

Run: `npm run build:db && ls -la data/weather.db`
Expected: 四個 `✓`，計數約 `towns: 368`、`observations` > 1000、`images: 2`。

Run:
```bash
node --input-type=module --import tsx -e "
const eps = ['observations','towns','forecast-grid','radar','satellite']
for (const e of eps) { const { GET } = await import('./api/' + e + '.js'); const r = await GET(new Request('http://x/api/' + e)); const b = await r.json(); console.log(e, r.status, r.headers.get('x-seed-db'), Array.isArray(b.data) ? b.data.length : Object.keys(b.data)) }
const { GET } = await import('./api/forecast.js')
console.log('forecast', (await GET(new Request('http://x/api/forecast?town=10002010'))).status, (await GET(new Request('http://x/api/forecast'))).status, (await GET(new Request('http://x/api/forecast?town=nope'))).status)
"
```
Expected: 各端點 200、`x-seed-db: present`；forecast 依序 `200 400 404`。（此處 tmp DB 會由種子 DB 複製而來，不需授權碼。）

- [ ] **Step 6: Typecheck & commit**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: 無錯誤、測試全過。

```bash
git add server/http.ts api scripts vercel.json
git commit   # subject: "feat(api): add rest endpoints and build-time seed db"
```

---

### Task 7: 前端純函式庫（TDD）

**Files:**
- Create: `frontend/src/lib/{mercator,idw,colorScale,layers,geo,format,week,wx,wind,urlState,reproject}.ts`
- Test: `frontend/src/lib/lib.test.ts`

- [ ] **Step 1: Write the failing test `frontend/src/lib/lib.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { latToMercY, mercYToLat } from './mercator'
import { idwGrid } from './idw'
import { parseHex, colorAt, fillColorExpr } from './colorScale'
import { nearest, searchTowns } from './geo'
import { fmtHour, fmtSlot, weekdayOf } from './format'
import { groupWeekByDay } from './week'
import { wxIcon } from './wx'
import { windToUV, sampleField, type WindField } from './wind'
import { parseUrlState, toSearch } from './urlState'
import { sourceRowForMercRow } from './reproject'
import type { Town, WeekSlot } from '../../../shared/types'

describe('mercator', () => {
  it('round-trips latitude', () => {
    for (const lat of [0, 23.5, 50, -30]) expect(mercYToLat(latToMercY(lat))).toBeCloseTo(lat, 9)
  })
})

describe('idwGrid', () => {
  const pts = [{ lon: 120, lat: 23, v: 10 }, { lon: 121, lat: 23, v: 20 }]
  it('returns exact value on a station and average at midpoint', () => {
    const g = idwGrid(pts, [120, 120.5], [23], 2)
    expect(g[0]).toBe(10)
    expect(g[1]).toBeCloseTo(15, 6)
  })
  it('returns NaN beyond maxDist from every station', () => {
    expect(Number.isNaN(idwGrid(pts, [125], [23], 0.5)[0])).toBe(true)
  })
})

describe('colorScale', () => {
  const stops: [number, string][] = [[0, '#000000'], [10, '#ff000080']]
  it('parses hex with alpha', () => { expect(parseHex('#ff000080')).toEqual([255, 0, 0, 128]) })
  it('clamps and interpolates', () => {
    expect(colorAt(stops, -5)).toEqual([0, 0, 0, 255])
    expect(colorAt(stops, 99)).toEqual([255, 0, 0, 128])
    expect(colorAt(stops, 5)).toEqual([128, 0, 0, 192])
  })
  it('builds a maplibre interpolate expression', () => {
    expect(fillColorExpr(stops)).toEqual(['interpolate', ['linear'], ['get', 'value'], 0, 'rgba(0,0,0,1)', 10, 'rgba(255,0,0,0.502)'])
  })
})

const towns: Town[] = [
  { id: '1', name: '中區', county: '臺中市', lat: 24.14, lon: 120.68 },
  { id: '2', name: '宜蘭市', county: '宜蘭縣', lat: 24.75, lon: 121.75 },
]

describe('geo', () => {
  it('finds nearest item', () => { expect(nearest(towns, 121.7, 24.7)?.id).toBe('2') })
  it('returns null for empty list', () => { expect(nearest([], 0, 0)).toBeNull() })
  it('searches with 台/臺 equivalence', () => {
    expect(searchTowns(towns, '台中').map(t => t.id)).toEqual(['1'])
    expect(searchTowns(towns, '宜蘭').map(t => t.id)).toEqual(['2'])
    expect(searchTowns(towns, '  ')).toEqual([])
  })
})

describe('format', () => {
  it('formats slot labels from +08:00 strings', () => {
    expect(weekdayOf('2026-09-23')).toBe('三')
    expect(fmtHour('2026-09-23T18:00:00+08:00')).toBe('18時')
    expect(fmtSlot('2026-09-24T03:00:00+08:00')).toBe('週四 03:00')
  })
})

describe('groupWeekByDay', () => {
  const slot = (start: string, min: number, max: number, pop: number, wxCode: string): WeekSlot =>
    ({ start, end: start, minTemp: min, maxTemp: max, pop, wx: null, wxCode })
  it('merges day and night slots per date', () => {
    const days = groupWeekByDay([
      slot('2026-09-23T18:00:00+08:00', 23, 27, 20, '04'),
      slot('2026-09-24T06:00:00+08:00', 24, 30, 10, '02'),
      slot('2026-09-24T18:00:00+08:00', 22, 26, 40, '08'),
    ])
    expect(days).toEqual([
      { date: '2026-09-23', label: '今天', min: 23, max: 27, pop: 20, wxCode: '04' },
      { date: '2026-09-24', label: '週四', min: 22, max: 30, pop: 40, wxCode: '02' },
    ])
  })
})

describe('wxIcon', () => {
  it('maps CWA weather codes', () => {
    expect(wxIcon('01')).toBe('☀️')
    expect(wxIcon('04')).toBe('☁️')
    expect(wxIcon('15')).toBe('⛈️')
    expect(wxIcon('08')).toBe('🌧️')
    expect(wxIcon(null)).toBe('')
  })
})

describe('wind', () => {
  it('converts meteorological direction to u/v', () => {
    const [u1, v1] = windToUV(10, 0)
    expect(u1).toBeCloseTo(0, 9); expect(v1).toBeCloseTo(-10, 9)
    const [u2, v2] = windToUV(10, 90)
    expect(u2).toBeCloseTo(-10, 9); expect(v2).toBeCloseTo(0, 9)
  })
  it('samples a grid and returns null outside or on NaN', () => {
    const f: WindField = { west: 120, south: 23, step: 1, cols: 2, rows: 1, u: new Float32Array([1, NaN]), v: new Float32Array([2, NaN]) }
    expect(sampleField(f, 120.2, 23.1)).toEqual([1, 2])
    expect(sampleField(f, 121, 23)).toBeNull()
    expect(sampleField(f, 130, 23)).toBeNull()
  })
})

describe('urlState', () => {
  it('parses with defaults and rejects bad values', () => {
    expect(parseUrlState('')).toEqual({ layer: 'temp', t: 0, town: null })
    expect(parseUrlState('?layer=wind&t=6&town=10002010')).toEqual({ layer: 'wind', t: 6, town: '10002010' })
    expect(parseUrlState('?layer=bogus&t=-3')).toEqual({ layer: 'temp', t: 0, town: null })
  })
  it('serializes', () => {
    expect(toSearch({ layer: 'rain', t: 0, town: null })).toBe('?layer=rain')
    expect(toSearch({ layer: 'wind', t: 6, town: '1' })).toBe('?layer=wind&t=6&town=1')
  })
})

describe('sourceRowForMercRow', () => {
  it('maps edges to edges', () => {
    expect(sourceRowForMercRow(0, 100, 1000, 0, 50)).toBeLessThan(15)
    expect(sourceRowForMercRow(99, 100, 1000, 0, 50)).toBeGreaterThan(985)
  })
  it('stretches rows toward the pole', () => {
    // Mercator 中線對應的緯度高於 25°，所以來源列在上半部
    expect(sourceRowForMercRow(50, 100, 1000, 0, 50)).toBeLessThan(500)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run frontend/src/lib`
Expected: FAIL（找不到模組）

- [ ] **Step 3: Implement the modules**

`frontend/src/lib/mercator.ts`
```ts
const RAD = Math.PI / 180

export const latToMercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))
export const mercYToLat = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD
```

`frontend/src/lib/idw.ts`
```ts
export interface ValuePoint { lon: number; lat: number; v: number }

/** 反距離權重（power 2）內插；距離所有測站超過 maxDist（度）的格點為 NaN。回傳 row-major（lats × lons）。 */
export function idwGrid(points: ValuePoint[], lons: number[], lats: number[], maxDist: number): Float32Array {
  const out = new Float32Array(lons.length * lats.length)
  const max2 = maxDist * maxDist
  for (let j = 0; j < lats.length; j++) {
    const lat = lats[j]
    const k = Math.cos((lat * Math.PI) / 180)
    for (let i = 0; i < lons.length; i++) {
      let num = 0
      let den = 0
      let min2 = Infinity
      let exact: number | null = null
      for (const p of points) {
        const dx = (lons[i] - p.lon) * k
        const dy = lat - p.lat
        const d2 = dx * dx + dy * dy
        if (d2 < 1e-12) { exact = p.v; break }
        if (d2 < min2) min2 = d2
        num += p.v / d2
        den += 1 / d2
      }
      out[j * lons.length + i] = exact ?? (min2 > max2 ? NaN : num / den)
    }
  }
  return out
}
```

`frontend/src/lib/colorScale.ts`
```ts
export type ScaleId = 'temp' | 'wind' | 'rain1h' | 'pop' | 'humidity'
export type Stops = [number, string][]
export type RGBA = [number, number, number, number]

export const SCALES: Record<ScaleId, { unit: string; stops: Stops }> = {
  temp: { unit: '°C', stops: [[0, '#5e4fa2'], [8, '#3288bd'], [14, '#66c2a5'], [20, '#abdda4'], [24, '#e6f598'], [28, '#fee08b'], [32, '#fdae61'], [35, '#f46d43'], [38, '#d53e4f']] },
  wind: { unit: 'm/s', stops: [[0, '#3d4a8a'], [2, '#3288bd'], [4, '#66c2a5'], [6, '#abdda4'], [8, '#fee08b'], [11, '#fdae61'], [14, '#f46d43'], [18, '#d53e4f']] },
  rain1h: { unit: 'mm/h', stops: [[0, '#00000000'], [0.5, '#a5d8ff'], [2, '#4dabf7'], [5, '#1c7ed6'], [10, '#5f3dc4'], [20, '#c2255c'], [40, '#e8590c']] },
  pop: { unit: '% 降雨機率', stops: [[0, '#00000000'], [20, '#a5d8ff'], [50, '#4dabf7'], [80, '#1c7ed6'], [100, '#5f3dc4']] },
  humidity: { unit: '%', stops: [[30, '#e8590c'], [50, '#fcc419'], [70, '#69db7c'], [85, '#22b8cf'], [100, '#1864ab']] },
}

export function parseHex(hex: string): RGBA {
  const h = hex.slice(1)
  const at = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return [at(0), at(2), at(4), h.length === 8 ? at(6) : 255]
}

export function colorAt(stops: Stops, v: number): RGBA {
  if (v <= stops[0][0]) return parseHex(stops[0][1])
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i]
    if (v <= v1) {
      const [v0, c0] = stops[i - 1]
      const t = (v - v0) / (v1 - v0)
      const a = parseHex(c0)
      const b = parseHex(c1)
      return a.map((x, k) => Math.round(x + (b[k] - x) * t)) as RGBA
    }
  }
  return parseHex(stops[stops.length - 1][1])
}

export const toCss = ([r, g, b, a]: RGBA) => `rgba(${r},${g},${b},${+(a / 255).toFixed(3)})`

export function gradientCss(stops: Stops): string {
  const lo = stops[0][0]
  const hi = stops[stops.length - 1][0]
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `${toCss(parseHex(c))} ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`
}

export const fillColorExpr = (stops: Stops): unknown[] =>
  ['interpolate', ['linear'], ['get', 'value'], ...stops.flatMap(([v, c]) => [v, toCss(parseHex(c))])]
```

`frontend/src/lib/layers.ts`
```ts
import type { ScaleId } from './colorScale'

export type LayerId = 'temp' | 'wind' | 'rain' | 'humidity' | 'radar' | 'satellite'
export const LAYER_IDS: LayerId[] = ['temp', 'wind', 'rain', 'humidity', 'radar', 'satellite']

export interface LayerDef {
  label: string
  icon: string
  now?: { field: 'temp' | 'humidity' | 'windSpeed' | 'rain1h'; scale: ScaleId }
  future?: { field: 'temp' | 'humidity' | 'windSpeed' | 'pop'; scale: ScaleId }
}

export const LAYERS: Record<LayerId, LayerDef> = {
  temp: { label: '溫度', icon: '🌡️', now: { field: 'temp', scale: 'temp' }, future: { field: 'temp', scale: 'temp' } },
  wind: { label: '風', icon: '💨', now: { field: 'windSpeed', scale: 'wind' }, future: { field: 'windSpeed', scale: 'wind' } },
  rain: { label: '雨量', icon: '🌧️', now: { field: 'rain1h', scale: 'rain1h' }, future: { field: 'pop', scale: 'pop' } },
  humidity: { label: '濕度', icon: '💧', now: { field: 'humidity', scale: 'humidity' }, future: { field: 'humidity', scale: 'humidity' } },
  radar: { label: '雷達', icon: '📡' },
  satellite: { label: '衛星', icon: '🛰️' },
}

export const isLayerId = (s: unknown): s is LayerId => LAYER_IDS.includes(s as LayerId)
```

`frontend/src/lib/geo.ts`
```ts
import type { Town } from '../../../shared/types'

export function nearest<T extends { lon: number; lat: number }>(items: T[], lon: number, lat: number): T | null {
  const k = Math.cos((lat * Math.PI) / 180)
  let best: T | null = null
  let bestD = Infinity
  for (const it of items) {
    const dx = (it.lon - lon) * k
    const dy = it.lat - lat
    const d = dx * dx + dy * dy
    if (d < bestD) { bestD = d; best = it }
  }
  return best
}

const norm = (s: string) => s.trim().replaceAll('台', '臺')

export function searchTowns(towns: Town[], q: string, limit = 10): Town[] {
  const query = norm(q)
  if (!query) return []
  return towns.filter(t => norm(t.county + t.name).includes(query)).slice(0, limit)
}
```

`frontend/src/lib/format.ts`
```ts
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** date 為 YYYY-MM-DD（台灣日期） */
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

// CWA 時間字串固定為 +08:00，直接取字元避免受瀏覽器時區影響
export const fmtHour = (iso: string) => `${iso.slice(11, 13)}時`
export const fmtSlot = (iso: string) => `週${weekdayOf(iso.slice(0, 10))} ${iso.slice(11, 16)}`

const clock = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
export const fmtClock = (iso: string) => clock.format(new Date(iso))
```

`frontend/src/lib/week.ts`
```ts
import type { WeekSlot } from '../../../shared/types'
import { weekdayOf } from './format'

export interface DaySummary { date: string; label: string; min: number | null; max: number | null; pop: number | null; wxCode: string | null }

const pick = (xs: (number | null)[], f: (...n: number[]) => number) => {
  const vals = xs.filter((x): x is number => x != null)
  return vals.length ? f(...vals) : null
}

export function groupWeekByDay(week: WeekSlot[]): DaySummary[] {
  const byDate = new Map<string, WeekSlot[]>()
  for (const s of week) {
    const d = s.start.slice(0, 10)
    byDate.set(d, [...(byDate.get(d) ?? []), s])
  }
  return [...byDate].map(([date, slots], i) => ({
    date,
    label: i === 0 ? '今天' : `週${weekdayOf(date)}`,
    min: pick(slots.map(s => s.minTemp), Math.min),
    max: pick(slots.map(s => s.maxTemp), Math.max),
    pop: pick(slots.map(s => s.pop), Math.max),
    wxCode: (slots.find(s => s.start.slice(11, 13) === '06') ?? slots[0]).wxCode,
  }))
}
```

`frontend/src/lib/wx.ts`
```ts
/** CWA 天氣現象代碼 → 圖示 */
export function wxIcon(code: string | null | undefined): string {
  if (!code) return ''
  const n = Number(code)
  if (n === 1) return '☀️'
  if (n <= 3) return '🌤️'
  if (n <= 7) return '☁️'
  if ((n >= 15 && n <= 18) || n === 21 || n === 22 || (n >= 33 && n <= 36) || n === 41) return '⛈️'
  if (n >= 24 && n <= 28) return '🌫️'
  if (n === 42) return '🌨️'
  return '🌧️'
}
```

`frontend/src/lib/wind.ts`
```ts
import type { Bounds, Observation } from '../../../shared/types'
import { idwGrid } from './idw'

export interface WindField { west: number; south: number; step: number; cols: number; rows: number; u: Float32Array; v: Float32Array }

/** 氣象風向是「吹來的方向」，轉成往哪裡吹的 u（東）/ v（北）分量 */
export function windToUV(speed: number, dirDeg: number): [number, number] {
  const r = (dirDeg * Math.PI) / 180
  return [-speed * Math.sin(r), -speed * Math.cos(r)]
}

export function buildWindField(obs: Observation[], [west, south, east, north]: Bounds, step = 0.05): WindField {
  const us: { lon: number; lat: number; v: number }[] = []
  const vs: { lon: number; lat: number; v: number }[] = []
  for (const o of obs) {
    if (o.windSpeed == null || o.windDir == null) continue
    const [u, v] = windToUV(o.windSpeed, o.windDir)
    us.push({ lon: o.lon, lat: o.lat, v: u })
    vs.push({ lon: o.lon, lat: o.lat, v })
  }
  const cols = Math.round((east - west) / step) + 1
  const rows = Math.round((north - south) / step) + 1
  const lons = Array.from({ length: cols }, (_, i) => west + i * step)
  const lats = Array.from({ length: rows }, (_, j) => south + j * step)
  return { west, south, step, cols, rows, u: idwGrid(us, lons, lats, 0.35), v: idwGrid(vs, lons, lats, 0.35) }
}

export function sampleField(f: WindField, lon: number, lat: number): [number, number] | null {
  const i = Math.round((lon - f.west) / f.step)
  const j = Math.round((lat - f.south) / f.step)
  if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) return null
  const u = f.u[j * f.cols + i]
  const v = f.v[j * f.cols + i]
  return Number.isNaN(u) || Number.isNaN(v) ? null : [u, v]
}
```

`frontend/src/lib/urlState.ts`
```ts
import { isLayerId, type LayerId } from './layers'

export interface UrlState { layer: LayerId; t: number; town: string | null }

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search)
  const layer = p.get('layer')
  return {
    layer: isLayerId(layer) ? layer : 'temp',
    t: Math.max(0, parseInt(p.get('t') ?? '0', 10) || 0),
    town: p.get('town'),
  }
}

export function toSearch({ layer, t, town }: UrlState): string {
  const p = new URLSearchParams({ layer })
  if (t) p.set('t', String(t))
  if (town) p.set('town', town)
  return `?${p}`
}
```

`frontend/src/lib/reproject.ts`
```ts
import type { Bounds } from '../../../shared/types'
import { latToMercY, mercYToLat } from './mercator'

export interface CanvasOverlay { canvas: HTMLCanvasElement; bounds: Bounds }

/** 輸出（Mercator）第 j 列對應到來源（經緯度等距）影像的哪一列 */
export function sourceRowForMercRow(j: number, rowsOut: number, rowsIn: number, south: number, north: number): number {
  const yN = latToMercY(north)
  const yS = latToMercY(south)
  const lat = mercYToLat(yN + ((yS - yN) * (j + 0.5)) / rowsOut)
  return Math.min(rowsIn - 1, Math.max(0, Math.floor(((north - lat) / (north - south)) * rowsIn)))
}

export async function reprojectImage(url: string, bounds: Bounds, maxSize = 2048): Promise<CanvasOverlay> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')!
  const [, south, , north] = bounds
  for (let j = 0; j < canvas.height; j++) {
    const sr = sourceRowForMercRow(j, canvas.height, img.height, south, north)
    ctx.drawImage(img, 0, sr, img.width, 1, 0, j, canvas.width, 1)
  }
  return { canvas, bounds }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run frontend/src/lib`
Expected: 全部 PASS。若 `colorAt(stops, 5)` 的四捨五入差 1，確認實作用 `Math.round` 且預期值 `[128, 0, 0, 192]`（(0+255)/2=127.5→128；(255+128)/2=191.5→192）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib
git commit   # subject: "feat(web): add map math, color scales and state helpers"
```

---

### Task 8: 前端骨架、dev server 與底圖

**Files:**
- Create: `frontend/index.html`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/env.d.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/store.ts`, `frontend/src/api.ts`, `frontend/src/styles.css`, `frontend/src/components/MapView.tsx`

- [ ] **Step 1: `frontend/index.html`**

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0e17" />
    <meta name="description" content="以中央氣象署開放資料製作的台灣即時天氣地圖" />
    <title>台灣天氣地圖</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌀</text></svg>" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `frontend/vite.config.ts`（含本機 `/api/*` middleware）**

```ts
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/** 本機開發時直接執行 api/*.ts 的 GET(request)，行為與 Vercel Functions 一致 */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const file = path.join(repoRoot, 'api', `${url.pathname.slice('/api/'.length)}.ts`)
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        try {
          const mod = await server.ssrLoadModule(file)
          const response: Response = await mod.GET(new Request(url))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // 只給 server 端（api middleware）使用；前端的 envDir 是 frontend/，拿不到授權碼
  Object.assign(process.env, loadEnv(mode, repoRoot, ''))
  return {
    root: here,
    plugins: [react(), apiDev()],
    server: { fs: { allow: [repoRoot] } },
    build: { outDir: path.join(repoRoot, 'dist'), emptyOutDir: true },
  }
})
```

- [ ] **Step 3: `frontend/tsconfig.json` 與 `frontend/src/env.d.ts`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "../shared"]
}
```

```ts
// frontend/src/env.d.ts — 512KB 的 TopoJSON 不讓 tsc 推導型別
declare module 'taiwan-atlas/towns-10t.json' {
  const topology: unknown
  export default topology
}
```

- [ ] **Step 4: `frontend/src/store.ts`**

```ts
import { create } from 'zustand'
import { LAYERS, type LayerId } from './lib/layers'
import { parseUrlState, toSearch } from './lib/urlState'

interface State {
  layer: LayerId
  t: number
  town: string | null
  playing: boolean
  setLayer: (layer: LayerId) => void
  setT: (t: number) => void
  selectTown: (town: string | null) => void
  setPlaying: (playing: boolean) => void
}

export const useStore = create<State>(set => ({
  ...parseUrlState(window.location.search),
  playing: false,
  // 雷達/衛星沒有未來時段，切換時回到「現在」
  setLayer: layer => set(s => ({ layer, t: LAYERS[layer].future ? s.t : 0, playing: LAYERS[layer].future ? s.playing : false })),
  setT: t => set({ t }),
  selectTown: town => set({ town }),
  setPlaying: playing => set({ playing }),
}))

useStore.subscribe(({ layer, t, town }) => {
  window.history.replaceState(null, '', toSearch({ layer, t, town }))
})
```

- [ ] **Step 5: `frontend/src/api.ts`**

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import type { Topology } from 'topojson-specification'
import type { ApiResponse, ForecastGrid, ImageKind, ImageOverlay, Observation, Town, TownForecast } from '../../shared/types'
import { reprojectImage } from './lib/reproject'

const TEN_MIN = 10 * 60_000

async function get<T>(path: string): Promise<ApiResponse<T>> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

export const useObservations = () =>
  useQuery({ queryKey: ['observations'], queryFn: () => get<Observation[]>('/api/observations'), refetchInterval: TEN_MIN })

export const useTowns = () =>
  useQuery({ queryKey: ['towns'], queryFn: () => get<Town[]>('/api/towns'), staleTime: Infinity })

export const useTownForecast = (town: string | null) =>
  useQuery({ queryKey: ['forecast', town], queryFn: () => get<TownForecast>(`/api/forecast?town=${town}`), enabled: !!town })

export const useForecastGrid = (time: string | null) =>
  useQuery({
    queryKey: ['grid', time],
    queryFn: () => get<ForecastGrid>(`/api/forecast-grid${time ? `?time=${encodeURIComponent(time)}` : ''}`),
    placeholderData: keepPreviousData,
  })

/** 尚未結束的 3 小時時段，最多 24 格（72 小時） */
export function useFutureTimes(): string[] {
  const { data } = useForecastGrid(null)
  return useMemo(
    () => (data?.data.times ?? []).filter(t => Date.parse(t) + 3 * 3600_000 > Date.now()).slice(0, 24),
    [data],
  )
}

export const useOverlay = (kind: ImageKind | null) =>
  useQuery({ queryKey: ['overlay', kind], queryFn: () => get<ImageOverlay>(`/api/${kind}`), enabled: !!kind, refetchInterval: TEN_MIN })

export const useReprojected = (o: ImageOverlay | null) =>
  useQuery({
    queryKey: ['reprojected', o?.url, o?.obsTime],
    // 圖檔名固定，以觀測時間避開瀏覽器快取
    queryFn: () => reprojectImage(`${o!.url}?t=${encodeURIComponent(o!.obsTime)}`, o!.bounds),
    enabled: !!o,
    staleTime: Infinity,
  })

export type TownShapes = FeatureCollection<Geometry, { TOWNCODE: string }>

export const useTownShapes = () =>
  useQuery({
    queryKey: ['townShapes'],
    staleTime: Infinity,
    queryFn: async () => {
      const topo = (await import('taiwan-atlas/towns-10t.json')).default as Topology
      return feature(topo, topo.objects.towns) as unknown as TownShapes
    },
  })
```

- [ ] **Step 6: `frontend/src/components/MapView.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { Map as MlMap } from 'maplibre-gl'
import { useTowns } from '../api'
import { useStore } from '../store'
import { nearest } from '../lib/geo'
import type { Town } from '../../../shared/types'

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export default function MapView({ onReady }: { onReady: (map: MlMap | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const towns = useRef<Town[]>([])
  const { data } = useTowns()
  towns.current = data?.data ?? []

  useEffect(() => {
    const map = new MlMap({
      container: ref.current!,
      style: BASEMAP,
      center: [120.9, 23.7],
      zoom: 6.6,
      minZoom: 4,
      maxZoom: 12,
      attributionControl: { compact: true },
    })
    map.on('load', () => onReady(map))
    map.on('click', e => {
      const t = nearest(towns.current, e.lngLat.lng, e.lngLat.lat)
      if (t) useStore.getState().selectTown(t.id)
    })
    return () => {
      onReady(null)
      map.remove()
    }
  }, [onReady])

  return <div ref={ref} className="map" />
}
```

- [ ] **Step 7: `frontend/src/App.tsx`（先只有地圖）**

```tsx
import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'

export default function App() {
  const [, setMap] = useState<MlMap | null>(null)
  return <MapView onReady={setMap} />
}
```

- [ ] **Step 8: `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 2 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 9: `frontend/src/styles.css`（完整樣式，後續元件共用）**

```css
:root {
  --bg: #0b0e17;
  --glass: rgba(18, 22, 34, 0.72);
  --glass-border: rgba(255, 255, 255, 0.08);
  --text: #e8ecf3;
  --muted: #9aa4b2;
  --accent: #3b82f6;
  --warn: #fcc419;
  --radius: 12px;
  --gap: 16px;
  color-scheme: dark;
}

* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font: 14px/1.4 system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', sans-serif;
  overflow: hidden;
}
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: default; }

.map { position: fixed; inset: 0; }
.wind-canvas { position: fixed; inset: 0; pointer-events: none; z-index: 1; }

.glass {
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.muted { color: var(--muted); }

/* 左上：搜尋 + 狀態 */
.top-left { position: fixed; top: var(--gap); left: var(--gap); width: 320px; z-index: 3; display: flex; flex-direction: column; gap: 8px; }
.search-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
.search-row input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: var(--text); font: inherit; }
.results { list-style: none; margin: 0; padding: 4px; border-top: 1px solid var(--glass-border); max-height: 320px; overflow: auto; }
.results button { width: 100%; text-align: left; padding: 8px 10px; border-radius: 8px; }
.results button:hover { background: rgba(255, 255, 255, 0.08); }
.search-error { padding: 0 12px 10px; color: var(--warn); font-size: 12px; }
.badge { align-self: flex-start; padding: 4px 10px; font-size: 12px; color: var(--muted); }
.badge.warn { color: var(--warn); }

/* 右側：圖層 */
.layer-picker { position: fixed; top: var(--gap); right: var(--gap); z-index: 3; display: flex; flex-direction: column; padding: 6px; gap: 2px; }
.layer-toggle { display: none; font-size: 20px; padding: 6px; }
.layer-btn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; transition: background 0.15s; }
.layer-btn:hover { background: rgba(255, 255, 255, 0.08); }
.layer-btn.on { background: var(--accent); }

/* 底部：時間軸 + 圖例 */
.timeline { position: fixed; left: 50%; bottom: var(--gap); transform: translateX(-50%); width: min(760px, calc(100% - 2 * var(--gap))); z-index: 3; padding: 10px 14px; }
.timeline-row { display: flex; align-items: center; gap: 12px; }
.timeline-row input[type='range'] { flex: 1; accent-color: var(--accent); }
.play { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); }
.time-label { min-width: 84px; text-align: right; font-variant-numeric: tabular-nums; }
.legend { margin-top: 8px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--muted); }
.legend-bar { flex: 1; height: 8px; border-radius: 4px; }

/* 地點卡片 */
.card { position: fixed; top: 150px; left: var(--gap); width: 340px; max-height: calc(100% - 260px); overflow: auto; z-index: 4; padding: 16px; animation: slide-in 0.2s ease-out; }
.card header { display: flex; align-items: baseline; gap: 8px; }
.card h2 { margin: 0; font-size: 20px; }
.card .close { position: absolute; top: 10px; right: 10px; padding: 4px 8px; color: var(--muted); }
.now { display: flex; align-items: center; gap: 16px; margin: 12px 0; }
.big { font-size: 48px; font-weight: 300; line-height: 1; }
.week { list-style: none; padding: 0; margin: 12px 0 0; }
.week li { display: grid; grid-template-columns: 48px 32px 1fr auto; align-items: center; padding: 6px 0; border-top: 1px solid var(--glass-border); }
.skeleton { height: 220px; border-radius: 8px; background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.1), rgba(255,255,255,.04)); background-size: 200% 100%; animation: shimmer 1.2s infinite; }

@keyframes slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.maplibregl-ctrl-attrib { background: rgba(0, 0, 0, 0.4) !important; }

/* 手機 */
@media (max-width: 640px) {
  :root { --gap: 8px; }
  .top-left { right: 64px; width: auto; }
  .layer-toggle { display: block; }
  .layer-picker:not(.open) .layer-btn { display: none; }
  .timeline { bottom: calc(var(--gap) + env(safe-area-inset-bottom)); }
  .card { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 62%; border-radius: 16px 16px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
}
```

- [ ] **Step 10: Run dev server 並驗證**

Run（背景執行）：`npm run dev`
Then:
```bash
curl -s localhost:5173/api/towns | head -c 200; echo
curl -s -o /dev/null -w '%{http_code}\n' localhost:5173/
```
Expected: `/api/towns` 回傳 `{"data":[{"id":"...` 的 JSON；首頁 200。瀏覽器開 http://localhost:5173 看到深色底圖、台灣置中。

- [ ] **Step 11: Typecheck & commit**

Run: `npm run typecheck`
Expected: 無錯誤。

```bash
git add frontend
git commit   # subject: "feat(web): scaffold react app with maplibre basemap"
```

---

### Task 9: 疊圖機制、即時熱圖、雷達/衛星、狀態標籤

**Files:**
- Create: `frontend/src/map/helpers.ts`, `frontend/src/map/useImageOverlay.ts`, `frontend/src/lib/heat.ts`, `frontend/src/components/DataLayers.tsx`, `frontend/src/components/StatusBadge.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: `frontend/src/map/helpers.ts`**

```ts
import type { Map as MlMap } from 'maplibre-gl'

/** 資料圖層放在第一個文字圖層之下，地名標籤才不會被蓋住 */
export const firstSymbolLayer = (map: MlMap) => map.getStyle().layers.find(l => l.type === 'symbol')?.id

export function removeLayerAndSource(map: MlMap, id: string) {
  try {
    if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  } catch {
    // 地圖已被 remove（例如 StrictMode 重新掛載）
  }
}
```

- [ ] **Step 2: `frontend/src/map/useImageOverlay.ts`**

```ts
import { useEffect } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { CanvasOverlay } from '../lib/reproject'
import { firstSymbolLayer, removeLayerAndSource } from './helpers'

export function useImageOverlay(map: MlMap, id: string, src: CanvasOverlay | null, opacity: number) {
  useEffect(() => {
    if (!src) return
    const [w, s, e, n] = src.bounds
    map.addSource(id, { type: 'canvas', canvas: src.canvas, animate: false, coordinates: [[w, n], [e, n], [e, s], [w, s]] })
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } }, firstSymbolLayer(map))
    // 先以 0 加入再調整，利用 style 預設 300ms transition 淡入
    const raf = requestAnimationFrame(() => map.setPaintProperty(id, 'raster-opacity', opacity))
    return () => {
      cancelAnimationFrame(raf)
      removeLayerAndSource(map, id)
    }
  }, [map, id, src, opacity])
}
```

- [ ] **Step 3: `frontend/src/lib/heat.ts`**

```ts
import type { Bounds, Observation } from '../../../shared/types'
import { colorAt, type Stops } from './colorScale'
import { idwGrid } from './idw'
import { latToMercY, mercYToLat } from './mercator'
import type { CanvasOverlay } from './reproject'

/** 含澎湖、金門、馬祖 */
export const TAIWAN_BOUNDS: Bounds = [118.1, 21.8, 122.1, 26.4]

type Field = 'temp' | 'humidity' | 'windSpeed' | 'rain1h'

/** 測站 IDW 內插成熱圖；列以 Mercator 等距排列，疊到地圖上不會變形 */
export function renderHeat(obs: Observation[], field: Field, stops: Stops, cols = 200, rows = 240): CanvasOverlay {
  const points = obs.flatMap(o => (o[field] == null ? [] : [{ lon: o.lon, lat: o.lat, v: o[field] as number }]))
  const [w, s, e, n] = TAIWAN_BOUNDS
  const yN = latToMercY(n)
  const yS = latToMercY(s)
  const lons = Array.from({ length: cols }, (_, i) => w + ((e - w) * (i + 0.5)) / cols)
  const lats = Array.from({ length: rows }, (_, j) => mercYToLat(yN + ((yS - yN) * (j + 0.5)) / rows))
  const grid = idwGrid(points, lons, lats, 0.35)

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(cols, rows)
  grid.forEach((v, k) => {
    if (!Number.isNaN(v)) img.data.set(colorAt(stops, v), k * 4)
  })
  ctx.putImageData(img, 0, 0)
  return { canvas, bounds: TAIWAN_BOUNDS }
}
```

- [ ] **Step 4: `frontend/src/components/DataLayers.tsx`（此 Task 先處理「現在」與圖片圖層）**

```tsx
import { useMemo } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { useObservations, useOverlay, useReprojected } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { SCALES } from '../lib/colorScale'
import { renderHeat } from '../lib/heat'
import { useImageOverlay } from '../map/useImageOverlay'

export default function DataLayers({ map }: { map: MlMap }) {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const def = LAYERS[layer]
  const obs = useObservations()
  const imageKind = layer === 'radar' || layer === 'satellite' ? layer : null
  const overlay = useOverlay(imageKind)
  const image = useReprojected(imageKind ? overlay.data?.data ?? null : null)

  const heat = useMemo(() => {
    if (t > 0 || !def.now || !obs.data) return null
    return renderHeat(obs.data.data, def.now.field, SCALES[def.now.scale].stops)
  }, [t, def, obs.data])

  useImageOverlay(map, 'heat', heat, 0.7)
  useImageOverlay(map, 'image', image.data ?? null, layer === 'radar' ? 0.9 : 0.7)
  return null
}
```

- [ ] **Step 5: `frontend/src/components/StatusBadge.tsx`**

```tsx
import { useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected } from '../api'
import { useStore } from '../store'
import { fmtClock } from '../lib/format'

export default function StatusBadge() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const imageKind = layer === 'radar' || layer === 'satellite' ? layer : null
  const obs = useObservations()
  const overlay = useOverlay(imageKind)
  const image = useReprojected(imageKind ? overlay.data?.data ?? null : null)
  const times = useFutureTimes()
  const grid = useForecastGrid(t > 0 ? times[t - 1] ?? null : null)

  const q = imageKind ? overlay : t > 0 ? grid : obs
  if (q.isError || image.isError) return <div className="badge glass warn">暫時無法取得資料</div>
  if (!q.data) return <div className="badge glass">載入中…</div>

  const when = imageKind && overlay.data ? overlay.data.data.obsTime : q.data.updatedAt
  return (
    <div className={`badge glass ${q.data.stale ? 'warn' : ''}`}>
      {when ? `${imageKind ? '觀測' : '更新'}於 ${fmtClock(when)}` : '尚無資料'}
      {q.data.stale && ' · 資料可能非最新'}
    </div>
  )
}
```

- [ ] **Step 6: 更新 `frontend/src/App.tsx`**

```tsx
import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'
import DataLayers from './components/DataLayers'
import StatusBadge from './components/StatusBadge'

export default function App() {
  const [map, setMap] = useState<MlMap | null>(null)
  return (
    <>
      <MapView onReady={setMap} />
      {map && <DataLayers map={map} />}
      <div className="top-left">
        <StatusBadge />
      </div>
    </>
  )
}
```

- [ ] **Step 7: 瀏覽器驗證**

開 http://localhost:5173（dev server 仍在跑）：
- 預設看到台灣上的溫度熱圖，地名標籤在熱圖之上。
- 網址改 `?layer=radar` 重新整理：雷達回波疊在台灣附近，海岸線對齊。
- `?layer=satellite`：衛星雲圖疊加，台灣海岸與雲圖中的陸地輪廓大致對齊（若明顯南北偏移，代表該圖不是經緯度等距投影，記錄下來並回報，不要自行猜測修正）。
- 左上角顯示「更新於 HH:mm」。

- [ ] **Step 8: Typecheck & commit**

Run: `npm run typecheck && npm test`

```bash
git add frontend
git commit   # subject: "feat(web): render observation heatmap and radar overlays"
```

---

### Task 10: 未來時段分區色塊、時間軸與圖例

**Files:**
- Create: `frontend/src/map/useChoropleth.ts`, `frontend/src/components/Timeline.tsx`, `frontend/src/components/Legend.tsx`
- Modify: `frontend/src/components/DataLayers.tsx`, `frontend/src/App.tsx`

- [ ] **Step 1: `frontend/src/map/useChoropleth.ts`**

```ts
import { useEffect } from 'react'
import type { ExpressionSpecification, Map as MlMap } from 'maplibre-gl'
import { useTownShapes } from '../api'
import { fillColorExpr, type Stops } from '../lib/colorScale'
import { firstSymbolLayer, removeLayerAndSource } from './helpers'

const ID = 'choropleth'

export function useChoropleth(map: MlMap, values: Map<string, number | null> | null, stops: Stops | null) {
  const shapes = useTownShapes()
  useEffect(() => {
    if (!values || !stops || !shapes.data) return
    const data = {
      ...shapes.data,
      features: shapes.data.features.map(f => {
        const v = values.get(f.properties.TOWNCODE)
        return v == null ? f : { ...f, properties: { ...f.properties, value: v } }
      }),
    }
    map.addSource(ID, { type: 'geojson', data })
    map.addLayer({
      id: ID,
      type: 'fill',
      source: ID,
      paint: {
        'fill-color': ['case', ['has', 'value'], fillColorExpr(stops), 'rgba(0,0,0,0)'] as ExpressionSpecification,
        'fill-opacity': 0.8,
        'fill-outline-color': 'rgba(255,255,255,0.12)',
      },
    }, firstSymbolLayer(map))
    return () => removeLayerAndSource(map, ID)
  }, [map, values, stops, shapes.data])
}
```

- [ ] **Step 2: 更新 `frontend/src/components/DataLayers.tsx`（完整版，風粒子在 Task 11 加入）**

```tsx
import { useMemo } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { useForecastGrid, useFutureTimes, useObservations, useOverlay, useReprojected } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { SCALES } from '../lib/colorScale'
import { renderHeat } from '../lib/heat'
import { useImageOverlay } from '../map/useImageOverlay'
import { useChoropleth } from '../map/useChoropleth'

export default function DataLayers({ map }: { map: MlMap }) {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const def = LAYERS[layer]
  const times = useFutureTimes()
  const obs = useObservations()
  const grid = useForecastGrid(t > 0 ? times[t - 1] ?? null : null)
  const imageKind = layer === 'radar' || layer === 'satellite' ? layer : null
  const overlay = useOverlay(imageKind)
  const image = useReprojected(imageKind ? overlay.data?.data ?? null : null)

  const heat = useMemo(() => {
    if (t > 0 || !def.now || !obs.data) return null
    return renderHeat(obs.data.data, def.now.field, SCALES[def.now.scale].stops)
  }, [t, def, obs.data])

  const choropleth = useMemo(() => {
    if (t === 0 || !def.future || !grid.data) return null
    const field = def.future.field
    return new Map(grid.data.data.cells.map(c => [c.townId, c[field]] as const))
  }, [t, def, grid.data])

  useImageOverlay(map, 'heat', heat, 0.7)
  useImageOverlay(map, 'image', image.data ?? null, layer === 'radar' ? 0.9 : 0.7)
  useChoropleth(map, choropleth, t > 0 && def.future ? SCALES[def.future.scale].stops : null)
  return null
}
```

- [ ] **Step 3: `frontend/src/components/Legend.tsx`**

```tsx
import { SCALES, gradientCss, type ScaleId } from '../lib/colorScale'

export default function Legend({ scale }: { scale: ScaleId }) {
  const { unit, stops } = SCALES[scale]
  return (
    <div className="legend">
      <span>{stops[0][0]}</span>
      <div className="legend-bar" style={{ background: gradientCss(stops) }} />
      <span>{stops[stops.length - 1][0]}</span>
      <span>{unit}</span>
    </div>
  )
}
```

- [ ] **Step 4: `frontend/src/components/Timeline.tsx`**

```tsx
import { useEffect } from 'react'
import { useFutureTimes } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { fmtSlot } from '../lib/format'
import Legend from './Legend'

export default function Timeline() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const playing = useStore(s => s.playing)
  const setT = useStore(s => s.setT)
  const setPlaying = useStore(s => s.setPlaying)
  const times = useFutureTimes()
  const def = LAYERS[layer]
  const max = def.future ? times.length : 0

  useEffect(() => {
    if (!playing || max === 0) return
    const id = setInterval(() => {
      const cur = useStore.getState().t
      setT(cur >= max ? 0 : cur + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [playing, max, setT])

  // URL 帶入的 t 超出範圍（例如資料已更新）時回到現在
  useEffect(() => {
    if (times.length > 0 && t > max) setT(0)
  }, [t, max, times.length, setT])

  const scale = t > 0 ? def.future?.scale : def.now?.scale
  return (
    <div className="timeline glass">
      <div className="timeline-row">
        <button className="play" disabled={max === 0} onClick={() => setPlaying(!playing)} aria-label={playing ? '暫停' : '播放'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input type="range" min={0} max={max} value={Math.min(t, max)} disabled={max === 0}
          onChange={e => setT(Number(e.target.value))} aria-label="預報時間" />
        <span className="time-label">{t === 0 ? '現在' : times[t - 1] ? fmtSlot(times[t - 1]) : ''}</span>
      </div>
      {scale && <Legend scale={scale} />}
    </div>
  )
}
```

- [ ] **Step 5: 更新 `frontend/src/App.tsx`**

```tsx
import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'
import DataLayers from './components/DataLayers'
import StatusBadge from './components/StatusBadge'
import Timeline from './components/Timeline'

export default function App() {
  const [map, setMap] = useState<MlMap | null>(null)
  return (
    <>
      <MapView onReady={setMap} />
      {map && <DataLayers map={map} />}
      <div className="top-left">
        <StatusBadge />
      </div>
      <Timeline />
    </>
  )
}
```

- [ ] **Step 6: 瀏覽器驗證**

- 拖動時間軸到任一未來時段：熱圖換成鄉鎮色塊、標籤顯示「週X HH:00」、圖例不變（溫度）。
- `?layer=rain`：現在 = 時雨量（無雨時幾乎透明）；未來 = 降雨機率色塊，圖例單位變「% 降雨機率」。
- 按 ▶：每秒前進一格，到尾端回到現在。
- `?layer=radar`：滑桿與播放鍵 disabled。

- [ ] **Step 7: Typecheck & commit**

Run: `npm run typecheck`

```bash
git add frontend
git commit   # subject: "feat(web): add forecast timeline with town choropleth"
```

---

### Task 11: 風場粒子動畫

**Files:**
- Create: `frontend/src/components/WindParticles.tsx`
- Modify: `frontend/src/components/DataLayers.tsx`

- [ ] **Step 1: `frontend/src/components/WindParticles.tsx`**

```tsx
import { useEffect, useMemo, useRef } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { Observation } from '../../../shared/types'
import { buildWindField, sampleField } from '../lib/wind'
import { TAIWAN_BOUNDS } from '../lib/heat'

const COUNT = 3000
const MAX_AGE = 90
// zoom 6 時每 (m/s) 每幀移動的經緯度；10 m/s ≈ 2px/frame
const SPEED = 0.0022

interface Particle { lon: number; lat: number; age: number }

export default function WindParticles({ map, obs }: { map: MlMap; obs: Observation[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const field = useMemo(() => buildWindField(obs, TAIWAN_BOUNDS), [obs])

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const [w, s, e, n] = TAIWAN_BOUNDS
    const spawn = (p: Particle) => {
      p.lon = w + Math.random() * (e - w)
      p.lat = s + Math.random() * (n - s)
      p.age = Math.floor(Math.random() * MAX_AGE)
    }
    const particles = Array.from({ length: COUNT }, () => {
      const p = { lon: 0, lat: 0, age: 0 }
      spawn(p)
      return p
    })
    const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height)

    let raf = 0
    const frame = () => {
      // 讓舊軌跡逐漸淡出
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = 'rgba(0,0,0,0.92)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      const k = SPEED / Math.pow(2, map.getZoom() - 6)
      for (const p of particles) {
        const uv = sampleField(field, p.lon, p.lat)
        if (!uv || ++p.age > MAX_AGE) { spawn(p); continue }
        const a = map.project([p.lon, p.lat])
        p.lon += (uv[0] * k) / Math.cos((p.lat * Math.PI) / 180)
        p.lat += uv[1] * k
        const b = map.project([p.lon, p.lat])
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
      }
      ctx.stroke()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    map.on('movestart', clear)
    map.on('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      map.off('movestart', clear)
      map.off('resize', resize)
    }
  }, [map, field])

  return <canvas ref={ref} className="wind-canvas" />
}
```

- [ ] **Step 2: 在 `DataLayers.tsx` 加入粒子**

加 import：
```tsx
import WindParticles from './WindParticles'
```
把最後的 `return null` 換成：
```tsx
  if (layer === 'wind' && t === 0 && obs.data) return <WindParticles map={map} obs={obs.data.data} />
  return null
```

- [ ] **Step 3: 瀏覽器驗證**

`?layer=wind`：風速熱圖上有白色流線粒子流動，拖曳/縮放地圖時粒子跟著地圖走、不殘留舊軌跡；切到其他圖層粒子消失；時間軸拖到未來時粒子消失、改顯示風速色塊。用 DevTools Performance 確認動畫 ~60fps（桌機）。

- [ ] **Step 4: Typecheck & commit**

Run: `npm run typecheck`

```bash
git add frontend
git commit   # subject: "feat(web): animate wind particles from station data"
```

---

### Task 12: 圖層選單、搜尋定位、地點卡片

**Files:**
- Create: `frontend/src/components/LayerPicker.tsx`, `SearchBox.tsx`, `SelectionMarker.tsx`, `LocationCard.tsx`, `ForecastChart.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: `frontend/src/components/LayerPicker.tsx`**

```tsx
import { useState } from 'react'
import { useStore } from '../store'
import { LAYERS, LAYER_IDS } from '../lib/layers'

export default function LayerPicker() {
  const layer = useStore(s => s.layer)
  const setLayer = useStore(s => s.setLayer)
  const [open, setOpen] = useState(false)
  return (
    <nav className={`layer-picker glass ${open ? 'open' : ''}`} aria-label="圖層">
      <button className="layer-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="切換圖層">
        {LAYERS[layer].icon}
      </button>
      {LAYER_IDS.map(id => (
        <button key={id} className={`layer-btn ${id === layer ? 'on' : ''}`} aria-pressed={id === layer}
          onClick={() => { setLayer(id); setOpen(false) }}>
          <span>{LAYERS[id].icon}</span>
          <span>{LAYERS[id].label}</span>
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: `frontend/src/components/SearchBox.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import { useTowns } from '../api'
import { useStore } from '../store'
import { nearest, searchTowns } from '../lib/geo'
import type { Town } from '../../../shared/types'

export default function SearchBox({ map }: { map: MlMap | null }) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data } = useTowns()
  const towns = data?.data ?? []
  const results = useMemo(() => searchTowns(towns, q), [towns, q])
  const selectTown = useStore(s => s.selectTown)

  const pick = (t: Town) => {
    selectTown(t.id)
    setQ('')
    map?.flyTo({ center: [t.lon, t.lat], zoom: 10 })
  }

  const locate = () => {
    setError(null)
    if (!navigator.geolocation) return setError('此瀏覽器不支援定位')
    navigator.geolocation.getCurrentPosition(
      p => {
        const t = nearest(towns, p.coords.longitude, p.coords.latitude)
        if (t) pick(t)
      },
      () => setError('無法取得目前位置'),
      { timeout: 10_000 },
    )
  }

  return (
    <div className="glass">
      <div className="search-row">
        <span aria-hidden>🔍</span>
        <input value={q} placeholder="搜尋鄉鎮市區…" aria-label="搜尋鄉鎮市區"
          onChange={e => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) pick(results[0]) }} />
        <button onClick={locate} title="目前位置" aria-label="目前位置">📍</button>
      </div>
      {focused && results.length > 0 && (
        <ul className="results">
          {results.map(t => (
            <li key={t.id}><button onMouseDown={() => pick(t)}>{t.county} {t.name}</button></li>
          ))}
        </ul>
      )}
      {error && <div className="search-error">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 3: `frontend/src/components/SelectionMarker.tsx`**

```tsx
import { useEffect } from 'react'
import { Marker, type Map as MlMap } from 'maplibre-gl'
import { useTowns } from '../api'
import { useStore } from '../store'

export default function SelectionMarker({ map }: { map: MlMap }) {
  const town = useStore(s => s.town)
  const { data } = useTowns()
  useEffect(() => {
    const t = data?.data.find(x => x.id === town)
    if (!t) return
    const marker = new Marker({ color: '#3b82f6' }).setLngLat([t.lon, t.lat]).addTo(map)
    return () => { marker.remove() }
  }, [map, town, data])
  return null
}
```

- [ ] **Step 4: `frontend/src/components/ForecastChart.tsx`**

```tsx
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ForecastSlot } from '../../../shared/types'
import { fmtHour } from '../lib/format'

const tick = { fill: '#9aa4b2', fontSize: 10 }

export default function ForecastChart({ slots }: { slots: ForecastSlot[] }) {
  const data = slots.map(s => ({ label: fmtHour(s.start), temp: s.temp, pop: s.pop }))
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <XAxis dataKey="label" tick={tick} interval={1} axisLine={false} tickLine={false} />
        <YAxis yAxisId="t" tick={tick} domain={['dataMin - 2', 'dataMax + 2']} axisLine={false} tickLine={false} />
        <YAxis yAxisId="p" hide domain={[0, 100]} />
        <Tooltip contentStyle={{ background: '#141824', border: 'none', borderRadius: 8 }} />
        <Bar yAxisId="p" dataKey="pop" name="降雨機率 %" fill="#4dabf7" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
        <Line yAxisId="t" dataKey="temp" name="溫度 °C" stroke="#fdae61" strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 5: `frontend/src/components/LocationCard.tsx`**

```tsx
import { useObservations, useTownForecast } from '../api'
import { useStore } from '../store'
import { nearest } from '../lib/geo'
import { groupWeekByDay } from '../lib/week'
import { wxIcon } from '../lib/wx'
import ForecastChart from './ForecastChart'

export default function LocationCard() {
  const town = useStore(s => s.town)
  const selectTown = useStore(s => s.selectTown)
  const forecast = useTownForecast(town)
  const obs = useObservations()
  if (!town) return null

  const f = forecast.data?.data
  const now = f && obs.data ? nearest(obs.data.data.filter(o => o.temp != null), f.town.lon, f.town.lat) : null
  const upcoming = f ? f.hourly3.filter(s => Date.parse(s.start) + 3 * 3600_000 > Date.now()).slice(0, 16) : []
  const days = f ? groupWeekByDay(f.week) : []

  return (
    <aside className="card glass" aria-label="地點預報">
      <button className="close" onClick={() => selectTown(null)} aria-label="關閉">✕</button>
      {forecast.isLoading && <div className="skeleton" />}
      {forecast.isError && <p>無法載入預報，請稍後再試。</p>}
      {f && (
        <>
          <header>
            <h2>{f.town.name}</h2>
            <span className="muted">{f.town.county}</span>
          </header>
          <div className="now">
            <span className="big">{now?.temp != null ? `${Math.round(now.temp)}°` : '--'}</span>
            <div>
              <div>{wxIcon(upcoming[0]?.wxCode)} {upcoming[0]?.wx ?? ''}</div>
              <div className="muted">濕度 {now?.humidity ?? '--'}% · 風 {now?.windSpeed ?? '--'} m/s</div>
              {now && <div className="muted">最近測站：{now.name}</div>}
            </div>
          </div>
          <ForecastChart slots={upcoming} />
          <ul className="week">
            {days.map(d => (
              <li key={d.date}>
                <span>{d.label}</span>
                <span>{wxIcon(d.wxCode)}</span>
                <span className="muted">{d.pop != null ? `☂ ${d.pop}%` : ''}</span>
                <span>{d.min ?? '--'}° / {d.max ?? '--'}°</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
```

- [ ] **Step 6: 最終 `frontend/src/App.tsx`**

```tsx
import { useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView from './components/MapView'
import DataLayers from './components/DataLayers'
import SelectionMarker from './components/SelectionMarker'
import SearchBox from './components/SearchBox'
import StatusBadge from './components/StatusBadge'
import LayerPicker from './components/LayerPicker'
import Timeline from './components/Timeline'
import LocationCard from './components/LocationCard'

export default function App() {
  const [map, setMap] = useState<MlMap | null>(null)
  return (
    <>
      <MapView onReady={setMap} />
      {map && <DataLayers map={map} />}
      {map && <SelectionMarker map={map} />}
      <div className="top-left">
        <SearchBox map={map} />
        <StatusBadge />
      </div>
      <LayerPicker />
      <Timeline />
      <LocationCard />
    </>
  )
}
```

- [ ] **Step 7: 瀏覽器驗證**

- 右側圖層選單切換 6 種圖層，當前項目為藍底，網址 `layer=` 同步更新。
- 搜尋「台中」→ 出現臺中市各區；點選後地圖飛過去、藍色標記、左側卡片顯示：目前溫度、天氣、濕度、風、最近測站、48 小時溫度/降雨機率圖、一週預報。
- 直接點地圖任意位置 → 卡片切換為最近鄉鎮。✕ 關閉卡片、`town=` 從網址移除。
- 重新整理帶 `?layer=wind&t=3&town=10002010` 的網址 → 狀態完整還原。
- 📍 定位：允許後跳到所在鄉鎮；拒絕後顯示「無法取得目前位置」。

- [ ] **Step 8: Typecheck & commit**

Run: `npm run typecheck && npm test`

```bash
git add frontend
git commit   # subject: "feat(web): add layer picker, search and location card"
```

---

### Task 13: 行動版與整體 QA

**Files:**
- Modify: `frontend/src/styles.css`（只在驗證發現問題時）

- [ ] **Step 1: 截圖檢查（桌機 + 手機）**

```bash
npx -y playwright@latest install chromium
npx -y playwright@latest screenshot --wait-for-timeout 6000 --viewport-size "1440,900" "http://localhost:5173/?layer=temp&town=10002010" /tmp/aiot03-desktop.png
npx -y playwright@latest screenshot --wait-for-timeout 6000 --viewport-size "390,844" "http://localhost:5173/?layer=wind&town=10002010" /tmp/aiot03-mobile.png
```
用 Read 工具開兩張圖檢查：
- 桌機：搜尋/狀態在左上、卡片在其下、圖層在右、時間軸在底部置中，彼此不重疊。
- 手機：圖層收合成單一按鈕、卡片為底部抽屜（最高 62% 高度）、搜尋框不被圖層按鈕蓋住、沒有水平捲軸。

- [ ] **Step 2: 修正發現的版面問題**（若無問題則跳過）。每個修正只改 `styles.css` 對應選擇器。

- [ ] **Step 3: Production build 驗證**

Run: `npm run build && ls dist && du -sh dist`
Expected: build 成功、`dist/index.html` 存在；`taiwan-atlas` 的 TopoJSON 應被拆成獨立 chunk（`dist/assets/towns-10t-*.js`）。

- [ ] **Step 4: Commit（若有修改）**

```bash
git add frontend/src/styles.css
git commit   # subject: "style(web): polish mobile layout"
```

---

### Task 14: GitHub、Vercel 部署、定時更新

**Files:**
- Create: `.github/workflows/refresh.yml`, `README.md`

- [ ] **Step 1: `.github/workflows/refresh.yml`**

```yaml
name: Refresh weather seed DB

on:
  schedule:
    - cron: '0 */3 * * *'
  workflow_dispatch:

jobs:
  redeploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Vercel deploy hook
        run: curl -fsS -X POST "${{ secrets.VERCEL_DEPLOY_HOOK }}"
```

- [ ] **Step 2: `README.md`**

```markdown
# 台灣天氣地圖（CWA Open Data）

類 Windy 的全螢幕互動天氣地圖：即時測站熱圖、風場粒子動畫、鄉鎮 72 小時／一週預報、雷達回波與衛星雲圖。

- 前端：React + Vite + MapLibre GL（`frontend/`）
- 後端：Vercel Functions（`api/`、`server/`）
- 資料庫：SQLite（better-sqlite3）。Build 時產生 `data/weather.db` 種子資料並隨 function 打包；執行期複製到 `/tmp` 作為快取，過期時向 CWA 重抓。
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
| `GET /api/radar`、`/api/satellite` | 最新雷達／衛星圖片資訊 |
```

- [ ] **Step 3: Commit 並建立 GitHub repo**

```bash
git add .github README.md
git commit   # subject: "ci: add scheduled seed refresh and readme"
gh repo create anjyuelee/aiot03 --public --source=. --remote=origin --push
```
Expected: repo 建立並推上 `main`。確認 `.env`、`data/*.db`、`.superpowers/` 沒有被推上去：`git ls-files | grep -E '\.env|\.db$|superpowers'` 應無輸出。

- [ ] **Step 4: 安裝 Vercel CLI 並登入（需要使用者操作）**

```bash
npm install -g vercel
```
請使用者在提示列執行 `! vercel login` 完成登入，完成後以 `vercel whoami` 確認。

- [ ] **Step 5: 連結專案、設定環境變數**

```bash
vercel project add aiot03 || true
vercel link --yes --project aiot03
for env in production preview development; do
  node -e "process.stdout.write(require('fs').readFileSync('.env','utf8').match(/^CWA_API_KEY=(.*)$/m)[1].trim())" | vercel env add CWA_API_KEY $env
done
vercel env ls
vercel git connect --yes
```
若 `preview` 互動詢問 Git branch 導致 pipe 失敗，改請使用者執行 `! vercel env add CWA_API_KEY preview` 手動貼上（branch 留空＝全部）。若 `vercel git connect --yes` 不接受 `--yes`，去掉該旗標重跑。

Expected: `vercel env ls` 列出三個環境的 `CWA_API_KEY`（值加密顯示）；Git 連結到 `anjyuelee/aiot03`。

- [ ] **Step 6: Production 部署與驗證**

```bash
vercel --prod
```
取得網址（例如 `https://aiot03.vercel.app`）後：
```bash
URL=https://aiot03.vercel.app
curl -s -D - -o /dev/null $URL/api/observations | grep -iE 'HTTP/|x-seed-db|cache-control'
curl -s $URL/api/towns | head -c 150; echo
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/forecast?town=10002010"
curl -s -o /dev/null -w '%{http_code}\n' "$URL/some/spa/path"
```
Expected: 200、`x-seed-db: present`（若為 `missing`，代表 build 產物沒被 `includeFiles` 帶入，需檢查 Vercel build log 的 build-db 輸出）、towns 有資料、forecast 200、SPA 路徑 200。再用瀏覽器開正式網址完整走一次 Task 12 Step 7 的驗證清單。

- [ ] **Step 7: 建立 Deploy Hook 與 GitHub secret（需要使用者操作）**

請使用者到 Vercel Dashboard → aiot03 → Settings → Git → Deploy Hooks，建立名稱 `refresh`、branch `main` 的 hook，複製 URL 後在提示列執行：
```
! gh secret set VERCEL_DEPLOY_HOOK --repo anjyuelee/aiot03
```
（貼上 URL）。完成後：
```bash
gh workflow run refresh.yml --repo anjyuelee/aiot03
sleep 5; gh run list --workflow refresh.yml --repo anjyuelee/aiot03 --limit 1
```
Expected: run 狀態為 success，Vercel 上出現一個新的 deployment。
