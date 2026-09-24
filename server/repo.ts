import type { DB } from './db.js'
import type { Bounds, ForecastSlot, GridCell, ImageKind, ImageOverlay, Observation, Town, TownForecast, Typhoon, WeekSlot } from '../shared/types.js'
import type { RainObsRow, Slot3hRow, StationRow, WeatherObsRow, WeekRow } from './cwa/parse.js'
import type { SatelliteTileRow } from './cwa/kmz.js'

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

export function replaceSatelliteTiles(db: DB, tiles: SatelliteTileRow[]): void {
  const insert = db.prepare('INSERT INTO satellite_tiles (id, png, west, south, east, north) VALUES (?, ?, ?, ?, ?, ?)')
  db.transaction(() => {
    db.prepare('DELETE FROM satellite_tiles').run()
    for (const t of tiles) insert.run(t.id, t.png, ...t.bounds)
  })()
}

export function listSatelliteTiles(db: DB): { id: string; bounds: Bounds }[] {
  const rows = db.prepare('SELECT id, west, south, east, north FROM satellite_tiles ORDER BY id').all() as
    { id: string; west: number; south: number; east: number; north: number }[]
  return rows.map(r => ({ id: r.id, bounds: [r.west, r.south, r.east, r.north] }))
}

export function getSatelliteTile(db: DB, id: string): Uint8Array | null {
  const r = db.prepare('SELECT png FROM satellite_tiles WHERE id = ?').get(id) as { png: Uint8Array } | undefined
  return r?.png ?? null
}

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

export function logFetch(db: DB, dataset: string, at: string): void {
  db.prepare('INSERT OR REPLACE INTO fetch_log (dataset, fetched_at) VALUES (?, ?)').run(dataset, at)
}

export function getFetchedAt(db: DB, dataset: string): string | null {
  const r = db.prepare('SELECT fetched_at AS at FROM fetch_log WHERE dataset = ?').get(dataset) as { at: string } | undefined
  return r?.at ?? null
}
