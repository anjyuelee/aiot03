import type { DB } from './db.js'
import type { ImageKind } from '../shared/types.js'
import { cwa, type Fetcher } from './cwa/client.js'
import { parseSatelliteKmz } from './cwa/kmz.js'
import { parseForecast3h, parseForecastWeek, parseImage, parseRainStations, parseTyphoons, parseWeatherStations } from './cwa/parse.js'
import { logFetch, replaceForecasts, replaceObservations, replaceSatelliteTiles, replaceTyphoons, upsertImage } from './repo.js'

// F-D0047-001 起每 4 號一個縣市：+0 為 3 天預報、+2 為一週預報
const countyIds = (offset: number) =>
  Array.from({ length: 22 }, (_, i) => `F-D0047-${String(1 + offset + 4 * i).padStart(3, '0')}`)

// F-D0047-093 每次最多回傳 5 個縣市
const CHUNK = 5

const IMAGE_IDS: Record<ImageKind, string> = { radar: 'O-A0058-005', satellite: 'O-B0033-003' }

const now = () => new Date().toISOString()

export async function syncObservations(db: DB, f: Fetcher = cwa): Promise<void> {
  const [auto, manned, rainJson] = await Promise.all([
    f.dataset('O-A0001-001'), f.dataset('O-A0003-001'), f.dataset('O-A0002-001'),
  ])
  const a = parseWeatherStations(auto)
  const b = parseWeatherStations(manned)
  const rain = parseRainStations(rainJson)
  if (a.obs.length + b.obs.length === 0) throw new Error('CWA returned no observations')
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
  const fWeek = parseForecastWeek(week)
  if (f3h.towns.length === 0) throw new Error('CWA returned no town forecasts')
  if (fWeek.slots.length === 0) throw new Error('CWA returned no week forecasts')
  replaceForecasts(db, f3h, fWeek)
  logFetch(db, 'forecast', now())
}

export async function syncImage(db: DB, kind: ImageKind, f: Fetcher = cwa): Promise<void> {
  const meta = parseImage(await f.file(IMAGE_IDS[kind]), kind)
  if (kind === 'radar') {
    upsertImage(db, meta)
  } else {
    const tiles = parseSatelliteKmz(await f.bytes(meta.url))
    if (tiles.length === 0) throw new Error('CWA returned no satellite tiles')
    db.transaction(() => {
      upsertImage(db, meta)
      replaceSatelliteTiles(db, tiles)
    })()
  }
  logFetch(db, kind, now())
}

// 無活動中颱風時 CWA 回傳空清單，照樣清空舊資料
export async function syncTyphoons(db: DB, f: Fetcher = cwa): Promise<void> {
  replaceTyphoons(db, parseTyphoons(await f.dataset('W-C0034-005')))
  logFetch(db, 'typhoon', now())
}
