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

export async function getImageOverlay(kind: 'radar'): Promise<ApiResponse<ImageOverlay> | null> {
  const db = getDb()
  const meta = await ensureFresh(db, kind, () => syncImage(db, kind))
  const data = getImage(db, kind)
  return data ? { data, ...meta } : null
}

export async function getSatellite(): Promise<ApiResponse<SatelliteOverlay> | null> {
  const db = getDb()
  const meta = await ensureFresh(db, 'satellite', () => syncImage(db, 'satellite'))
  const image = getImage(db, 'satellite')
  const tiles = listSatelliteTiles(db)
  if (!image || tiles.length === 0) return null
  // 以觀測時間當版本參數，讓新一批圖塊繞過快取
  const t = encodeURIComponent(image.obsTime)
  return {
    data: {
      obsTime: image.obsTime,
      tiles: tiles.map(({ id, bounds }) => ({ url: `/api/satellite-tile?id=${encodeURIComponent(id)}&t=${t}`, bounds })),
    },
    ...meta,
  }
}

export const getSatelliteTilePng = (id: string) => getSatelliteTile(getDb(), id)

export async function getTyphoons(): Promise<ApiResponse<Typhoon[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'typhoon', () => syncTyphoons(db))
  return { data: listTyphoons(db), ...meta }
}

export async function getWarnings(): Promise<ApiResponse<Warning[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'warnings', () => syncWarnings(db))
  return { data: listWarnings(db), ...meta }
}

export async function getEarthquakes(): Promise<ApiResponse<Earthquake[]>> {
  const db = getDb()
  const meta = await ensureFresh(db, 'earthquakes', () => syncEarthquakes(db))
  return { data: listEarthquakes(db), ...meta }
}
