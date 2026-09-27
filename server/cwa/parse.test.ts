import { describe, it, expect } from 'vitest'
import { fixture } from '../__fixtures__/load.js'
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseRadarTimes, parseTyphoons, parseWarnings,
  parseEarthquakes, parseHeat, parseHeatText, parseWarningTexts, townCountyCode,
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
  it('drops a repeated frame instead of storing it twice', () => {
    const list = json.dataset.resources.resource.data.time
    const repeated = { dataset: { resources: { resource: { data: { time: [...list, list[list.length - 1]] } } } } }
    const times = parseRadarTimes(repeated)
    expect(new Set(times).size).toBe(times.length)
    expect(times).toEqual(parseRadarTimes(json))
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
      countyCode: '10002', county: '宜蘭縣', phenomena: '大雨', significance: '特報', level: null, towns: null,
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

describe('townCountyCode', () => {
  it('maps municipality towns by their first two digits and other towns by their first five', () => {
    expect(['6300800', '6500100', '6702400', '1000404', '1000715', '0902006'].map(townCountyCode))
      .toEqual(['63000', '65000', '67000', '10004', '10007', '09020'])
  })
})

describe('parseHeat', () => {
  const json = fixture('W-C0033-005.json')
  const BEFORE = '2026-09-27T04:00:00.000Z' // 12:00 台灣時間，有效期間內
  const AFTER = '2026-09-27T09:00:00.000Z' // 17:00 台灣時間，剛好到期
  const list = parseHeat(json, BEFORE)

  it('groups towns into one row per county', () => {
    expect(list.map(w => w.countyCode)).toEqual(['63000', '65000', '68000', '10007', '10008', '67000', '10013'])
    expect(list[0]).toEqual({
      countyCode: '63000', county: '臺北市', phenomena: '高溫', significance: '資訊', level: '黃色燈號',
      towns: ['文山區', '大安區', '中正區', '萬華區'],
      start: '2026-09-27T08:00:00+08:00', end: '2026-09-27T17:00:00+08:00',
    })
    expect(list.find(w => w.county === '彰化縣')!.towns).toEqual(['埔心鄉', '永靖鄉'])
  })

  it('drops expired, past and lifted messages', () => {
    expect(parseHeat(json, AFTER)).toEqual([])
    const info = json.records.info[0]
    expect(parseHeat({ records: { info: [{ ...info, urgency: 'Past' }] } }, BEFORE)).toEqual([])
    expect(parseHeat({ records: { info: [{ ...info, headline: '解除高溫資訊' }] } }, BEFORE)).toEqual([])
    expect(parseHeat({ records: {} }, BEFORE)).toEqual([])
  })

  it('keeps one row per level and lists no towns for county-wide areas', () => {
    const info = json.records.info[0]
    const orange = {
      ...info,
      parameter: [{ valueName: 'severity_level', value: '高溫橙色燈號' }],
      area: [
        { areaDesc: '臺北市士林區', geocode: { value: '6301100' } },
        { areaDesc: '臺東縣', geocode: { value: '10014' } },
      ],
    }
    const rows = parseHeat({ records: { info: [orange, info] } }, BEFORE)
    expect(rows.filter(w => w.countyCode === '63000').map(w => [w.level, w.towns])).toEqual([
      ['橙色燈號', ['士林區']],
      ['黃色燈號', ['文山區', '大安區', '中正區', '萬華區']],
    ])
    expect(rows.find(w => w.countyCode === '10014')).toMatchObject({ county: '臺東縣', level: '橙色燈號', towns: null })
  })
})

describe('parseHeatText', () => {
  const json = fixture('W-C0033-005.json')

  it('joins the description and the instruction', () => {
    const [t] = parseHeatText(json, '2026-09-27T04:00:00.000Z')
    expect(t.kind).toBe('高溫資訊')
    expect(t.issued).toBe('2026-09-27T07:30:00+08:00')
    expect(t.text.startsWith('各地天氣高溫炎熱')).toBe(true)
    expect(t.text).toContain('請注意。\n\n減少戶外活動')
  })

  it('is empty once the message expires', () => {
    expect(parseHeatText(json, '2026-09-27T09:00:00.000Z')).toEqual([])
  })
})

describe('parseWarningTexts', () => {
  const texts = parseWarningTexts(fixture('W-C0033-002.json'))

  it('maps every kind in a record to its trimmed text', () => {
    expect(texts.map(t => t.kind).sort()).toEqual(['大雨特報', '颱風警報'])
    expect(texts.find(t => t.kind === '颱風警報')!.text).toBe('海上陸上颱風警報第5報。\n颱風外圍環流影響，今（25）日臺北市有局部大雨發生的機率。')
  })

  it('takes the latest issued text when a kind appears in several records', () => {
    expect(texts.find(t => t.kind === '大雨特報')).toMatchObject({ issued: '2026-09-25T08:30:00+08:00', text: expect.stringContaining('颱風警報第5報') })
  })

  it('accepts single objects in place of arrays and skips empty text', () => {
    const one = {
      records: {
        record: [
          {
            datasetInfo: { issueTime: '2026-09-25 05:30:00' },
            contents: { content: { contentText: '濃霧' } },
            hazardConditions: { hazards: { hazard: { info: { phenomena: '濃霧', significance: '特報' } } } },
          },
          {
            datasetInfo: { issueTime: '2026-09-25 06:30:00' },
            contents: { content: { contentText: '  ' } },
            hazardConditions: { hazards: { hazard: { info: { phenomena: '低溫', significance: '特報' } } } },
          },
        ],
      },
    }
    expect(parseWarningTexts(one)).toEqual([{ kind: '濃霧特報', issued: '2026-09-25T05:30:00+08:00', text: '濃霧' }])
    expect(parseWarningTexts({ records: { record: [] } })).toEqual([])
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
