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
