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

  it('dedupes concurrent syncs for the same key', async () => {
    logFetch(db, 'satellite', new Date(NOW - TTL.satellite - 1).toISOString())
    const sync = vi.fn(async () => logFetch(db, 'satellite', new Date(NOW).toISOString()))
    const [a, b] = await Promise.all([
      ensureFresh(db, 'satellite', sync, NOW),
      ensureFresh(db, 'satellite', sync, NOW),
    ])
    expect(sync).toHaveBeenCalledOnce()
    expect(a).toEqual(b)
  })

  it('backs off from re-syncing for 60s after a failure', async () => {
    logFetch(db, 'observations', new Date(NOW - TTL.observations - 1).toISOString())
    const sync = vi.fn(async () => { throw new Error('boom') })

    await ensureFresh(db, 'observations', sync, NOW)
    expect(sync).toHaveBeenCalledOnce()

    await ensureFresh(db, 'observations', sync, NOW + 30_000)
    expect(sync).toHaveBeenCalledOnce()

    await ensureFresh(db, 'observations', sync, NOW + 60_001)
    expect(sync).toHaveBeenCalledTimes(2)
  })
})
