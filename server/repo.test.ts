import { describe, it, expect, beforeEach } from 'vitest'
import { fixture } from './__fixtures__/load.js'
import { openDb, type DB } from './db.js'
import {
  replaceObservations, listObservations, replaceForecasts, listTowns, getTownForecast,
  listGridTimes, getGrid, upsertImage, getImage, logFetch, getFetchedAt,
  replaceSatelliteTiles, listSatelliteTiles, getSatelliteTile, replaceWarnings, listWarnings, replaceEarthquakes, listEarthquakes,
} from './repo.js'
import type { Bounds } from '../shared/types.js'
import {
  parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseWarnings, parseEarthquakes,
} from './cwa/parse.js'

let db: DB
beforeEach(() => { db = openDb(':memory:') })

describe('observations', () => {
  it('merges weather and rain stations and replaces on re-sync', () => {
    const weather = parseWeatherStations(fixture('O-A0001-001.json'))
    const rain = parseRainStations(fixture('O-A0002-001.json'))
    replaceObservations(db, weather, rain)
    replaceObservations(db, weather, rain)
    const rows = listObservations(db)
    expect(rows).toHaveLength(5)
    expect(rows.find(r => r.stationId === 'C0X110')).toEqual({
      stationId: 'C0X110', name: '臺南市南區', lat: 22.961189, lon: 120.188378, obsTime: '2026-09-23T19:00:00+08:00',
      temp: 29.8, humidity: 69, windSpeed: 1.8, windDir: 335, rain1h: null, rain24h: null,
    })
    expect(rows.find(r => r.stationId === 'C1I230')).toMatchObject({ temp: null, rain1h: 0, rain24h: 0 })
  })
})

describe('forecasts', () => {
  beforeEach(() => {
    replaceForecasts(db, parseForecast3h(fixture('F-D0047-093-3d.json')), parseForecastWeek(fixture('F-D0047-093-week.json')))
  })
  it('lists towns', () => {
    expect(listTowns(db).map(t => t.id)).toEqual(['10002010', '10002020'])
  })
  it('returns a town forecast', () => {
    const f = getTownForecast(db, '10002010')!
    expect(f.town.name).toBe('宜蘭市')
    expect(f.hourly3).toHaveLength(32)
    expect(f.hourly3[0]).toEqual({
      start: '2026-09-23T18:00:00+08:00', temp: 27, pop: 20, humidity: 77, windSpeed: 3, windDir: '偏東風', wx: '多雲', wxCode: '04',
    })
    expect(f.week).toHaveLength(15)
    expect(getTownForecast(db, 'nope')).toBeNull()
  })
  it('returns grid times and cells', () => {
    const times = listGridTimes(db)
    expect(times[0]).toBe('2026-09-23T18:00:00+08:00')
    expect(times).toHaveLength(32)
    expect(getGrid(db, times[0])).toContainEqual({ townId: '10002010', temp: 27, pop: 20, humidity: 77, windSpeed: 3 })
  })
})

describe('satellite tiles', () => {
  const bounds: Bounds = [114.48, 24.96, 126.96, 37.44]
  const tile = (id: string, png: number[]) => ({ id, png: new Uint8Array(png), bounds })
  it('replaces all tiles and reads them back', () => {
    replaceSatelliteTiles(db, [tile('2/3/0', [9]), tile('2/0/0', [8])])
    replaceSatelliteTiles(db, [tile('2/1/2', [1, 2, 3]), tile('2/0/3', [4])])
    expect(listSatelliteTiles(db)).toEqual([
      { id: '2/0/3', bounds },
      { id: '2/1/2', bounds },
    ])
    expect(Array.from(getSatelliteTile(db, '2/1/2')!)).toEqual([1, 2, 3])
    expect(getSatelliteTile(db, '2/3/0')).toBeNull()
  })
})

describe('images & fetch log', () => {
  it('stores image overlays', () => {
    const radar = parseImage(fixture('O-A0058-005.json'), 'radar')
    upsertImage(db, radar)
    expect(getImage(db, 'radar')).toEqual(radar)
    expect(getImage(db, 'satellite')).toBeNull()
  })
  it('records fetch times', () => {
    expect(getFetchedAt(db, 'observations')).toBeNull()
    logFetch(db, 'observations', '2026-09-23T11:00:00.000Z')
    expect(getFetchedAt(db, 'observations')).toBe('2026-09-23T11:00:00.000Z')
  })
})

describe('warnings', () => {
  it('replaces the whole list and reads it back sorted by county then phenomena', () => {
    const list = parseWarnings(fixture('W-C0033-001.json'))
    replaceWarnings(db, [list[0]])
    replaceWarnings(db, list)
    const rows = listWarnings(db)
    expect(rows.map(w => `${w.countyCode} ${w.phenomena}`)).toEqual(['09007 濃霧', '10002 大雨', '10002 陸上強風', '10015 豪雨', '63000 大雨'])
    expect(rows[1]).toEqual({
      countyCode: '10002', county: '宜蘭縣', phenomena: '大雨', significance: '特報',
      start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00',
    })
    expect(rows[0].end).toBeNull()
  })
})

describe('earthquakes', () => {
  it('replaces the whole list and reads it back newest first', () => {
    const significant = parseEarthquakes(fixture('E-A0015-001.json'), true)
    const local = parseEarthquakes(fixture('E-A0016-001.json'), false)
    replaceEarthquakes(db, significant)
    replaceEarthquakes(db, [...significant, ...local])
    const rows = listEarthquakes(db)
    expect(rows.map(q => q.id)).toEqual([
      '2026-09-25T01:01:23+08:00', '2026-09-24T05:57:05+08:00', '2026-09-22T05:16:13+08:00', '2026-09-14T06:44:41+08:00',
    ])
    expect(rows[2]).toEqual(significant[0])
    replaceEarthquakes(db, local)
    expect(listEarthquakes(db).map(q => q.no)).toEqual([null, null])
  })

  it('keeps one row when both datasets report the same origin time', () => {
    const [q] = parseEarthquakes(fixture('E-A0015-001.json'), true)
    replaceEarthquakes(db, [q, { ...q, no: null }])
    expect(listEarthquakes(db)).toEqual([{ ...q, no: null }])
  })
})
