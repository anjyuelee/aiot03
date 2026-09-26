import { describe, it, expect, beforeEach } from 'vitest'
import { zipSync } from 'fflate'
import { fixture } from './__fixtures__/load.js'
import { sampleKmz } from './__fixtures__/kmz.js'
import { openDb, type DB } from './db.js'
import type { Fetcher } from './cwa/client.js'
import { syncObservations, syncForecast, syncImage, syncRadar, syncTyphoons, syncWarnings, syncEarthquakes } from './sync.js'
import {
  listObservations, listTowns, getTownForecast, getImage, getFetchedAt, listSatelliteTiles, listTyphoons, listWarnings, listEarthquakes,
  listRadarFrames,
} from './repo.js'

const empty = { success: 'true', records: { Station: [], Locations: [] } }
const noHistory = {
  historyMetadata: async () => { throw new Error('unexpected historyMetadata') },
  historyData: async () => { throw new Error('unexpected historyData') },
}

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
    async bytes(url) {
      if (url.endsWith('/O-B0033-003.kmz')) return sampleKmz()
      throw new Error(`unexpected url ${url}`)
    },
    ...noHistory,
  }
}

const noBytes = async () => new Uint8Array()

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('syncObservations', () => {
  it('stores observations and logs the fetch', async () => {
    await syncObservations(db, fakeFetcher())
    expect(listObservations(db)).toHaveLength(5)
    expect(getFetchedAt(db, 'observations')).not.toBeNull()
  })
  it('refuses to wipe data with an empty response', async () => {
    const f: Fetcher = { dataset: async () => empty, file: async () => ({}), bytes: noBytes, ...noHistory }
    await expect(syncObservations(db, f)).rejects.toThrow('no observations')
    expect(getFetchedAt(db, 'observations')).toBeNull()
  })
  it('refuses to wipe data when weather stations are empty even if rain has data', async () => {
    const f: Fetcher = {
      async dataset(id) { return id === 'O-A0002-001' ? fixture('O-A0002-001.json') : empty },
      async file() { return {} },
      bytes: noBytes,
      ...noHistory,
    }
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
  it('refuses to wipe data when the week forecast yields zero slots', async () => {
    const f: Fetcher = {
      async dataset(id, params) {
        if (id !== 'F-D0047-093') throw new Error(`unexpected dataset ${id}`)
        const ids = params!.locationId
        return ids.startsWith('F-D0047-001,') ? fixture('F-D0047-093-3d.json') : empty
      },
      async file() { return {} },
      bytes: noBytes,
      ...noHistory,
    }
    await expect(syncForecast(db, f)).rejects.toThrow('no week forecast')
    expect(getFetchedAt(db, 'forecast')).toBeNull()
  })
})

describe('syncImage', () => {
  it('stores satellite metadata and level-2 tiles from the kmz', async () => {
    await syncImage(db, 'satellite', fakeFetcher())
    expect(getImage(db, 'satellite')?.obsTime).toBe('2026-09-23T19:50:00+08:00')
    expect(listSatelliteTiles(db).map(t => t.id)).toEqual(['2/0/3', '2/1/2'])
    expect(getFetchedAt(db, 'satellite')).not.toBeNull()
  })
  it('refuses to wipe satellite tiles when the kmz has none', async () => {
    const f = { ...fakeFetcher(), bytes: async () => zipSync({ 'doc.kml': new Uint8Array() }) }
    await expect(syncImage(db, 'satellite', f)).rejects.toThrow('no satellite tiles')
    expect(getImage(db, 'satellite')).toBeNull()
    expect(getFetchedAt(db, 'satellite')).toBeNull()
  })
})

describe('syncRadar', () => {
  const withRadar = (json: unknown, calls: Record<string, string>[] = []): Fetcher => ({
    dataset: async () => { throw new Error('unexpected dataset') },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
    async historyMetadata(id, params) {
      if (id !== 'O-A0059-001') throw new Error(`unexpected history ${id}`)
      calls.push(params)
      return json
    },
    historyData: async () => { throw new Error('unexpected historyData') },
  })

  it('asks for four hours back in Taipei time and stores the latest 19 frames', async () => {
    const calls: Record<string, string>[] = []
    await syncRadar(db, withRadar(fixture('O-A0059-001-metadata.json'), calls), Date.parse('2026-09-26T04:00:00Z'))
    expect(calls).toEqual([{ timeFrom: '2026-09-26T08:00:00' }])
    const times = listRadarFrames(db)
    expect(times).toHaveLength(19)
    expect(times[18]).toBe('2026-09-26T11:50:00+08:00')
    expect(getFetchedAt(db, 'radar')).not.toBeNull()
  })
  it('keeps the old list when CWA returns no frames', async () => {
    await syncRadar(db, withRadar(fixture('O-A0059-001-metadata.json')))
    const empty = { dataset: { success: 'true', resources: { resource: { data: { time: [] } } } } }
    await expect(syncRadar(db, withRadar(empty))).rejects.toThrow('no radar frames')
    expect(listRadarFrames(db)).toHaveLength(19)
  })
})

describe('syncTyphoons', () => {
  const withTyphoons = (json: unknown): Fetcher => ({
    async dataset(id) {
      if (id === 'W-C0034-005') return json
      throw new Error(`unexpected dataset ${id}`)
    },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
    ...noHistory,
  })

  it('stores typhoons and logs the fetch', async () => {
    await syncTyphoons(db, withTyphoons(fixture('W-C0034-005.json')))
    const list = listTyphoons(db)
    expect(list.map(t => t.name)).toEqual(['舒力基'])
    expect(list[0].forecast).toHaveLength(9)
    expect(getFetchedAt(db, 'typhoon')).not.toBeNull()
  })

  it('clears old typhoons when none are active', async () => {
    await syncTyphoons(db, withTyphoons(fixture('W-C0034-005.json')))
    await syncTyphoons(db, withTyphoons({ success: 'true', records: {} }))
    expect(listTyphoons(db)).toEqual([])
  })
})

describe('syncWarnings', () => {
  const withWarnings = (json: unknown): Fetcher => ({
    async dataset(id) {
      if (id === 'W-C0033-001') return json
      throw new Error(`unexpected dataset ${id}`)
    },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
    ...noHistory,
  })

  it('stores warnings and logs the fetch', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    expect(listWarnings(db)).toHaveLength(5)
    expect(getFetchedAt(db, 'warnings')).not.toBeNull()
  })

  it('clears old warnings when none are active', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    const quiet = fixture('W-C0033-001.json')
    for (const loc of quiet.records.location) loc.hazardConditions.hazards = []
    await syncWarnings(db, withWarnings(quiet))
    expect(listWarnings(db)).toEqual([])
  })

  it('refuses to wipe warnings when the response has no locations', async () => {
    await syncWarnings(db, withWarnings(fixture('W-C0033-001.json')))
    const fetchedAt = getFetchedAt(db, 'warnings')
    await expect(syncWarnings(db, withWarnings({ success: 'true', records: { location: [] } }))).rejects.toThrow('no warning locations')
    expect(listWarnings(db)).toHaveLength(5)
    expect(getFetchedAt(db, 'warnings')).toBe(fetchedAt)
  })
})

describe('syncEarthquakes', () => {
  const withQuakes = (significant: unknown, local: unknown): Fetcher => ({
    async dataset(id) {
      if (id === 'E-A0015-001') return significant
      if (id === 'E-A0016-001') return local
      throw new Error(`unexpected dataset ${id}`)
    },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
    ...noHistory,
  })

  it('merges both datasets newest first and logs the fetch', async () => {
    await syncEarthquakes(db, withQuakes(fixture('E-A0015-001.json'), fixture('E-A0016-001.json')))
    expect(listEarthquakes(db).map(q => q.no)).toEqual([null, null, 115064, 115063])
    expect(getFetchedAt(db, 'earthquakes')).not.toBeNull()
  })

  it('keeps the old list when either dataset comes back without reports', async () => {
    await syncEarthquakes(db, withQuakes(fixture('E-A0015-001.json'), fixture('E-A0016-001.json')))
    const fetchedAt = getFetchedAt(db, 'earthquakes')
    const none = { success: 'true', records: { Earthquake: [] } }
    await expect(syncEarthquakes(db, withQuakes(fixture('E-A0015-001.json'), none))).rejects.toThrow('no earthquake reports')
    await expect(syncEarthquakes(db, withQuakes({ success: 'true', records: {} }, fixture('E-A0016-001.json')))).rejects.toThrow('no earthquake reports')
    expect(listEarthquakes(db)).toHaveLength(4)
    expect(getFetchedAt(db, 'earthquakes')).toBe(fetchedAt)
  })

  it('keeps the report number when both datasets report the same origin time', async () => {
    const local = fixture('E-A0016-001.json')
    local.records.Earthquake[0].EarthquakeInfo.OriginTime = '2026-09-22T05:16:13+08:00'
    await syncEarthquakes(db, withQuakes(fixture('E-A0015-001.json'), local))
    const list = listEarthquakes(db)
    expect(list).toHaveLength(3)
    expect(list.find(q => q.id === '2026-09-22T05:16:13+08:00')!.no).toBe(115064)
  })
})
