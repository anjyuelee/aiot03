import { describe, it, expect } from 'vitest'
import { fixture } from '../__fixtures__/load.js'
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage,
} from './parse.js'

describe('num', () => {
  it('parses numbers and maps missing markers to null', () => {
    expect(num('29.8')).toBe(29.8)
    expect(num('0.0')).toBe(0)
    expect(num('-99')).toBeNull()
    expect(num('-999')).toBeNull()
    expect(num(' ')).toBeNull()
    expect(num('X')).toBeNull()
    expect(num(undefined)).toBeNull()
  })
})

describe('parseWeatherStations', () => {
  const { stations, obs } = parseWeatherStations(fixture('O-A0001-001.json'))
  it('uses WGS84 coordinates', () => {
    expect(stations[0]).toEqual({ id: 'C0X110', name: '臺南市南區', county: '臺南市', town: '南區', lat: 22.961189, lon: 120.188378 })
  })
  it('maps weather values and -99 to null', () => {
    expect(obs[0]).toEqual({ stationId: 'C0X110', obsTime: '2026-09-23T19:00:00+08:00', temp: 29.8, humidity: 69, windSpeed: 1.8, windDir: 335 })
    expect(obs.find(o => o.stationId === 'C0V360')).toMatchObject({ temp: null, humidity: null, windSpeed: null, windDir: null })
  })
})

describe('parseRainStations', () => {
  it('reads 1h and 24h rainfall', () => {
    const { stations, obs } = parseRainStations(fixture('O-A0002-001.json'))
    expect(stations[0]).toMatchObject({ id: 'C1I230', name: '九份二山', lat: 23.962025, lon: 120.845272 })
    expect(obs[0]).toEqual({ stationId: 'C1I230', obsTime: '2026-09-23T19:20:00+08:00', rain1h: 0, rain24h: 0 })
  })
})

describe('parseForecast3h', () => {
  const { towns, slots } = parseForecast3h(fixture('F-D0047-093-3d.json'))
  it('reads towns with centroid', () => {
    expect(towns).toHaveLength(2)
    expect(towns[0]).toEqual({ id: '10002010', name: '宜蘭市', county: '宜蘭縣', lat: 24.753707, lon: 121.745083 })
  })
  it('builds one slot per 3h period', () => {
    expect(slots.filter(s => s.townId === '10002010')).toHaveLength(32)
    expect(slots[0]).toEqual({
      townId: '10002010', start: '2026-09-23T18:00:00+08:00', temp: 27, pop: 20, humidity: 77,
      windSpeed: 3, windDir: '偏東風', wx: '多雲', wxCode: '04',
    })
  })
})

describe('parseForecastWeek', () => {
  it('builds 12h slots', () => {
    const { slots } = parseForecastWeek(fixture('F-D0047-093-week.json'))
    expect(slots.filter(s => s.townId === '10002010')).toHaveLength(15)
    expect(slots[0]).toEqual({
      townId: '10002010', start: '2026-09-23T18:00:00+08:00', end: '2026-09-24T06:00:00+08:00',
      minTemp: 23, maxTemp: 27, pop: 20, wx: '多雲', wxCode: '04',
    })
  })
})

describe('parseImage', () => {
  it('parses radar metadata', () => {
    expect(parseImage(fixture('O-A0058-005.json'), 'radar')).toEqual({
      kind: 'radar',
      url: 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-A0058-005.png',
      obsTime: '2026-09-23T19:20:00+08:00',
      bounds: [115, 17.75, 126.5, 29.25],
    })
  })
  it('parses satellite metadata', () => {
    expect(parseImage(fixture('O-B0033-003.json'), 'satellite')).toEqual({
      kind: 'satellite',
      url: 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-B0033-003.kmz',
      obsTime: '2026-09-23T19:50:00+08:00',
      bounds: [102, 0, 152, 50],
    })
  })
})
