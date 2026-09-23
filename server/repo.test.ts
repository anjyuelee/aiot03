import { describe, it, expect, beforeEach } from 'vitest'
import { fixture } from './__fixtures__/load.js'
import { openDb, type DB } from './db.js'
import {
  replaceObservations, listObservations, replaceForecasts, listTowns, getTownForecast,
  listGridTimes, getGrid, upsertImage, getImage, logFetch, getFetchedAt,
} from './repo.js'
import { parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage } from './cwa/parse.js'

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
