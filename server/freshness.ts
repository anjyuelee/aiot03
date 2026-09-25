import type { DB } from './db.js'
import { getFetchedAt } from './repo.js'

const MIN = 60_000

export const TTL = {
  observations: 5 * MIN,
  forecast: 60 * MIN,
  radar: 10 * MIN,
  satellite: 10 * MIN,
  typhoon: 30 * MIN,
  warnings: 10 * MIN,
} as const

export type DatasetKey = keyof typeof TTL

export interface Freshness { updatedAt: string | null; stale: boolean }

const BACKOFF_MS = 60_000

// key 對應進行中的 sync,讓同時到來的請求共用同一次抓取
const inflight = new Map<DatasetKey, Promise<void>>()
// key 對應上次失敗時間,失敗後暫停重抓一段時間避免打爆 CWA
const lastFailure = new Map<DatasetKey, number>()

/** 過期才向 CWA 重抓;失敗時沿用 SQLite 內的舊資料並標示 stale。 */
export async function ensureFresh(db: DB, key: DatasetKey, sync: () => Promise<void>, now = Date.now()): Promise<Freshness> {
  const expired = (at: string | null) => at == null || now - Date.parse(at) > TTL[key]
  const failedAt = lastFailure.get(key)
  const backingOff = failedAt != null && now - failedAt < BACKOFF_MS
  if (expired(getFetchedAt(db, key)) && !backingOff) {
    let p = inflight.get(key)
    if (!p) {
      p = sync()
        .then(() => { lastFailure.delete(key) })
        .catch(e => { console.error(`sync ${key} failed`, e); lastFailure.set(key, now) })
        .finally(() => { inflight.delete(key) })
      inflight.set(key, p)
    }
    await p
  }
  const updatedAt = getFetchedAt(db, key)
  return { updatedAt, stale: expired(updatedAt) }
}
