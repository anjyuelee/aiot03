import { describe, it, expect } from 'vitest'
import { fixture } from '../__fixtures__/load.js'
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseRadarTimes, parseTyphoons, parseWarnings,
  parseEarthquakes,
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
  it('parses satellite metadata', () => {
    expect(parseImage(fixture('O-B0033-003.json'), 'satellite')).toEqual({
      kind: 'satellite',
      url: 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-B0033-003.kmz',
      obsTime: '2026-09-23T19:50:00+08:00',
      bounds: [102, 0, 152, 50],
    })
  })
})

describe('parseRadarTimes', () => {
  const json = fixture('O-A0059-001-metadata.json')
  it('keeps the latest 19 frames, oldest first', () => {
    const times = parseRadarTimes(json)
    expect(times).toHaveLength(19)
    expect(times[0]).toBe('2026-09-26T08:50:00+08:00')
    expect(times[18]).toBe('2026-09-26T11:50:00+08:00')
  })
  it('sorts frames that arrive out of order', () => {
    const list = json.dataset.resources.resource.data.time
    const shuffled = { dataset: { resources: { resource: { data: { time: [...list].reverse() } } } } }
    expect(parseRadarTimes(shuffled)).toEqual(parseRadarTimes(json))
  })
  it('returns nothing for a response without frames', () => {
    expect(parseRadarTimes({ dataset: { resources: { resource: { data: {} } } } })).toEqual([])
    expect(parseRadarTimes({})).toEqual([])
  })
})

describe('parseTyphoons', () => {
  const list = parseTyphoons(fixture('W-C0034-005.json'))

  it('parses names, id and track lengths', () => {
    expect(list).toHaveLength(1)
    const t = list[0]
    expect(t.id).toBe('2026-29')
    expect(t.name).toBe('舒力基')
    expect(t.nameEn).toBe('SURIGAE')
    expect(t.past).toHaveLength(8)
    expect(t.forecast).toHaveLength(9)
  })

  it('converts the latest past fix and takes the max quadrant radius', () => {
    expect(list[0].past.at(-1)).toEqual({
      time: '2026-09-24T02:00:00+08:00', forecastHour: null, lat: 17.4, lon: 135.6,
      pressure: 998, maxWind: 20, maxGust: 28, moveDir: 'WNW', moveSpeed: 34,
      radius15ms: 120, radius70: null,
    })
    expect(list[0].past[0].radius15ms).toBeNull()
  })

  it('computes forecast times from InitialTime + ForecastHour', () => {
    const f = list[0].forecast[0]
    expect(f.time).toBe('2026-09-24T08:00:00+08:00')
    expect(f.forecastHour).toBe(6)
    expect([f.lon, f.lat]).toEqual([134.6, 17.7])
    expect(f.radius15ms).toBe(120)
    expect(f.radius70).toBe(40)
    expect(list[0].forecast.at(-1)!.time).toBe('2026-09-29T02:00:00+08:00')
  })

  it('names unnamed depressions by TD number and tolerates missing data', () => {
    const td = { Year: '2026', TyphoonName: '', CwaTyphoonName: '', CwaTdNo: '30', CwaTyNo: '',
      AnalysisData: { Fix: [{ DateTime: '2026-09-24T02:00:00+08:00', CoordinateLongitude: '120', CoordinateLatitude: '15' }] } }
    const [t] = parseTyphoons({ records: { TropicalCyclones: { TropicalCyclone: [td] } } })
    expect(t.name).toBe('熱帶性低氣壓 TD30')
    expect(t.nameEn).toBeNull()
    expect(t.forecast).toEqual([])
    expect(parseTyphoons({ records: {} })).toEqual([])
  })

  it('drops forecast fixes without a usable ForecastHour instead of failing', () => {
    const fix = { InitialTime: '2026-09-24T02:00:00+08:00', CoordinateLongitude: '120', CoordinateLatitude: '15' }
    const ty = { Year: '2026', CwaTdNo: '30', ForecastData: { Fix: [{ ...fix, ForecastHour: '6' }, fix] } }
    const [t] = parseTyphoons({ records: { TropicalCyclones: { TropicalCyclone: [ty] } } })
    expect(t.forecast.map(f => f.forecastHour)).toEqual([6])
  })
})

describe('parseWarnings', () => {
  const list = parseWarnings(fixture('W-C0033-001.json'))

  it('emits one row per hazard and skips counties without hazards', () => {
    expect(list).toHaveLength(5)
    expect(list.filter(w => w.county === '宜蘭縣').map(w => w.phenomena)).toEqual(['大雨', '陸上強風'])
  })

  it('pads geocodes to 5-digit county codes', () => {
    expect(list.find(w => w.county === '臺北市')!.countyCode).toBe('63000')
    expect(list.find(w => w.county === '連江縣')!.countyCode).toBe('09007')
    expect(list.find(w => w.county === '宜蘭縣')!.countyCode).toBe('10002')
  })

  it('normalises both time formats to +08:00 ISO and keeps a missing end null', () => {
    const [rain, wind] = list.filter(w => w.county === '宜蘭縣')
    expect(rain).toEqual({
      countyCode: '10002', county: '宜蘭縣', phenomena: '大雨', significance: '特報',
      start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00',
    })
    expect(wind.start).toBe('2026-09-25T00:00:00+08:00')
    expect(wind.end).toBe('2026-09-26T06:00:00+08:00')
    expect(list.find(w => w.county === '連江縣')!.end).toBeNull()
  })

  it('returns an empty list when no county has hazards', () => {
    const quiet = { records: { location: [{ locationName: '宜蘭縣', geocode: 10002, hazardConditions: { hazards: [] } }] } }
    expect(parseWarnings(quiet)).toEqual([])
    expect(parseWarnings({ records: {} })).toEqual([])
  })
})

describe('parseEarthquakes', () => {
  const significant = parseEarthquakes(fixture('E-A0015-001.json'), true)
  const local = parseEarthquakes(fixture('E-A0016-001.json'), false)

  it('keeps report numbers only for significant quakes', () => {
    expect(significant.map(q => q.no)).toEqual([115064, 115063])
    expect(local.map(q => q.no)).toEqual([null, null])
  })

  it('maps the epicentre, time and short location', () => {
    expect(significant[0]).toMatchObject({
      id: '2026-09-22T05:16:13+08:00', time: '2026-09-22T05:16:13+08:00',
      lat: 23.21, lon: 120.54, depth: 7.5, magnitude: 4.2, location: '臺南市楠西區',
      web: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026064',
    })
    expect(significant[1].location).toBe('臺灣東南部海域')
    expect(local.map(q => q.location)).toEqual(['新竹市香山區', '嘉義市東區'])
  })

  it('keeps per-county areas with their stations and skips the summary areas', () => {
    expect(significant[0].counties.map(c => `${c.county} ${c.intensity}`)).toEqual(['臺南市 4級', '嘉義縣 3級', '高雄市 1級'])
    expect(significant[0].counties[0].stations[0]).toEqual({ id: 'SNS', name: '曾文', lat: 23.22, lon: 120.497, intensity: '4級' })
    // 民雄站沒有 InfoStatus，照樣保留
    expect(significant[0].counties[1].stations.map(s => s.name)).toEqual(['大埔', '番路', '民雄'])
  })

  it('falls back to the whole location text and skips unusable reports and stations', () => {
    const json = fixture('E-A0015-001.json')
    const [a, b] = json.records.Earthquake
    a.EarthquakeInfo.Epicenter.Location = '臺灣東部海域   外海'
    a.Intensity.ShakingArea[0].EqStation[0].StationLatitude = ''
    b.EarthquakeInfo.OriginTime = ''
    const list = parseEarthquakes(json, true)
    expect(list).toHaveLength(1)
    expect(list[0].location).toBe('臺灣東部海域 外海')
    expect(list[0].counties[0].stations.map(s => s.name)).toEqual(['楠西', '白河'])
  })

  it('returns an empty list without reports', () => {
    expect(parseEarthquakes({ records: {} }, true)).toEqual([])
    expect(parseEarthquakes({ records: { Earthquake: [] } }, false)).toEqual([])
  })

  it('turns missing string fields into empty strings', () => {
    const json = fixture('E-A0015-001.json')
    const area = json.records.Earthquake[0].Intensity.ShakingArea[0]
    delete area.AreaIntensity
    delete area.EqStation[0].SeismicIntensity
    delete json.records.Earthquake[0].Web
    const [q] = parseEarthquakes(json, true)
    expect(q.counties[0].intensity).toBe('')
    expect(q.counties[0].stations[0].intensity).toBe('')
    expect(q.web).toBe('')
  })
})
