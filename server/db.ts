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
CREATE TABLE IF NOT EXISTS satellite_tiles (id TEXT PRIMARY KEY, png BLOB, west REAL, south REAL, east REAL, north REAL);
CREATE TABLE IF NOT EXISTS typhoons (id TEXT PRIMARY KEY, json TEXT);
CREATE TABLE IF NOT EXISTS warnings (
  county_code TEXT, county TEXT, phenomena TEXT, significance TEXT, start_time TEXT, end_time TEXT,
  PRIMARY KEY (county_code, phenomena, significance));
CREATE TABLE IF NOT EXISTS earthquakes (id TEXT PRIMARY KEY, json TEXT);
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
  const stale = seedExists() && (!fs.existsSync(file) || fs.statSync(SEED).mtimeMs > fs.statSync(file).mtimeMs)
  if (stale) fs.copyFileSync(SEED, file)
  shared = openDb(file)
  return shared
}
