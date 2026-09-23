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
