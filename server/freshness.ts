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
