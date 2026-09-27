import { describe, it, expect } from 'vitest'
import { canProbe, dbzOfPixel, formatProbe, obsValueAt, probeAnchor, probeMaxWidth, probePan, radarPixel, townValue } from './probe'
import { LAYER_IDS } from './layers'
import { latToMercY, mercYToLat } from './mercator'
import { sourceRowForMercRow } from './reproject'
import { RADAR_BOUNDS, RADAR_COLORS, RADAR_GRID, radarColor } from '../../../shared/radar'
import type { GridCell, Observation } from '../../../shared/types'

const station = (lon: number, lat: number, extra: Partial<Observation> = {}): Observation => ({
  stationId: `${lon},${lat}`, name: '測站', lon, lat, obsTime: '2026-09-27T14:00:00+08:00',
  temp: null, humidity: null, windSpeed: null, windDir: null, rain1h: null, rain24h: null, ...extra,
})

describe('canProbe', () => {
  it('covers the four weather layers and the radar', () => {
    expect(LAYER_IDS.filter(canProbe)).toEqual(['temp', 'wind', 'rain', 'humidity', 'radar'])
  })
})

describe('obsValueAt', () => {
  const obs = [station(121, 24, { temp: 20 }), station(121.2, 24, { temp: 30 }), station(121.1, 24, { humidity: 90 })]
  it('interpolates between stations with inverse-square weights', () => {
    // 距離 1:3，權重 9:1
    expect(obsValueAt(obs, 'temp', 121.05, 24)).toBeCloseTo(21, 4)
  })
  it('returns the station value on a station', () => {
    expect(obsValueAt(obs, 'temp', 121, 24)).toBe(20)
  })
  it('skips stations without the field', () => {
    // 121.1 的測站只有濕度；算進溫度的話這裡會直接拿到它的 null
    expect(obsValueAt(obs, 'temp', 121.1, 24)).toBeCloseTo(25, 4)
    expect(obsValueAt(obs, 'humidity', 121.3, 24)).toBe(90)
  })
  it('is null where the heat map has faded out', () => {
    expect(obsValueAt(obs, 'temp', 121, 24.5)).toBeNull()
    expect(obsValueAt([], 'temp', 121, 24)).toBeNull()
  })
})

describe('townValue', () => {
  const cells: GridCell[] = [
    { townId: '6300100', temp: 28, pop: 40, humidity: null, windSpeed: 3 },
    { townId: '6300200', temp: 27, pop: 10, humidity: 70, windSpeed: 2 },
  ]
  it('reads the field of the tapped town', () => {
    expect(townValue(cells, '6300100', 'pop')).toBe(40)
    expect(townValue(cells, '6300200', 'temp')).toBe(27)
  })
  it('is null at sea, for an unknown town or a missing value', () => {
    expect(townValue(cells, null, 'temp')).toBeNull()
    expect(townValue(cells, '1000401', 'temp')).toBeNull()
    expect(townValue(cells, '6300100', 'humidity')).toBeNull()
  })
})

describe('radarPixel', () => {
  const { nx, ny, west, south, step } = RADAR_GRID
  const [w, s, e, n] = RADAR_BOUNDS
  it('maps the corners to the corner pixels', () => {
    expect(radarPixel(RADAR_BOUNDS, nx, ny, w + 1e-6, n - 1e-6)).toEqual([0, 0])
    expect(radarPixel(RADAR_BOUNDS, nx, ny, e - 1e-6, s + 1e-6)).toEqual([nx - 1, ny - 1])
  })
  it('is null outside the radar bounds', () => {
    expect(radarPixel(RADAR_BOUNDS, nx, ny, w - 0.01, 23)).toBeNull()
    expect(radarPixel(RADAR_BOUNDS, nx, ny, 121, n + 0.01)).toBeNull()
    expect(radarPixel(RADAR_BOUNDS, nx, ny, e, 23)).toBeNull()
  })
  it('finds the Mercator row that reprojectImage drew at that latitude', () => {
    const yN = latToMercY(n)
    const yS = latToMercY(s)
    for (const j of [0, 1, 200, 440, 879, 880]) {
      const lat = mercYToLat(yN + ((yS - yN) * (j + 0.5)) / ny)
      expect(radarPixel(RADAR_BOUNDS, nx, ny, 121, lat)![1]).toBe(j)
    }
  })
  it('lands on the grid cell of a grid point', () => {
    // PNG 第 0 列是最北一列；格點 (i, k) 在 PNG 的第 ny − 1 − k 列
    for (const [i, k] of [[0, 0], [480, 440], [520, 480], [920, 880]]) {
      const [x, y] = radarPixel(RADAR_BOUNDS, nx, ny, west + i * step, south + k * step)!
      expect(x).toBe(i)
      expect(Math.abs(sourceRowForMercRow(y, ny, ny, s, n) - (ny - 1 - k))).toBeLessThanOrEqual(1)
    }
  })
})

describe('dbzOfPixel', () => {
  it('reads back every colour of the CWA scale', () => {
    RADAR_COLORS.forEach((_, dbz) => expect(dbzOfPixel([...radarColor(dbz)!, 255])).toBe(dbz))
  })
  it('tolerates small colour shifts', () => {
    expect(dbzOfPixel([2, 253, 253, 255])).toBe(0)
    expect(dbzOfPixel([253, 2, 2, 255])).toBe(45)
    expect(dbzOfPixel([0, 198, 2, 255])).toBe(20)
  })
  it('is null for a transparent pixel (no echo)', () => {
    expect(dbzOfPixel([0, 0, 0, 0])).toBeNull()
  })
})

describe('formatProbe', () => {
  it('formats each field with its unit', () => {
    expect(formatProbe('temp', 27.4)).toBe('27°C')
    expect(formatProbe('temp', -0.4)).toBe('0°C')
    expect(formatProbe('humidity', 83.6)).toBe('84%')
    expect(formatProbe('windSpeed', 3.24)).toBe('3.2 m/s')
    expect(formatProbe('rain1h', 1.5)).toBe('1.5 mm/h')
    expect(formatProbe('rain1h', 0)).toBe('0.0 mm/h')
    expect(formatProbe('pop', 40)).toBe('降雨機率 40%')
    expect(formatProbe('dbz', 35)).toBe('35 dBZ')
  })
})

describe('probeAnchor', () => {
  it('puts the bubble above the point on desktop', () => {
    expect(probeAnchor(100, 400, 1440, false)).toBe('bottom')
    expect(probeAnchor(1300, 91, 1440, false)).toBe('bottom')
  })
  it('puts the bubble below a point near the top on desktop', () => {
    // 縮放到縣市後縣市最北端在 y = 40，上方放不下兩行泡泡
    expect(probeAnchor(700, 40, 1440, false)).toBe('top')
    expect(probeAnchor(700, 90, 1440, false)).toBe('top')
  })
  it('puts the bubble beside the point towards the middle on a phone', () => {
    expect(probeAnchor(100, 40, 390, true)).toBe('left')
    expect(probeAnchor(300, 400, 390, true)).toBe('right')
  })
})

describe('probeMaxWidth', () => {
  it('fits the phone bubble in the room left on its side of the point', () => {
    // 扣掉 offset 與尖角 18px、畫面邊距 6px、泡泡內距與邊框 40px
    expect(probeMaxWidth(100, 390, 'left')).toBe(390 - 100 - 64)
    expect(probeMaxWidth(300, 390, 'right')).toBe(300 - 64)
  })
  it('still leaves room for the longest value at the middle of a 360px phone', () => {
    // 「降雨機率 100%」以 16px 粗體約 106px
    expect(probeMaxWidth(180, 360, 'right')).toBeGreaterThanOrEqual(110)
  })
})

describe('probePan', () => {
  it('leaves the phone map alone when the point is above the card', () => {
    expect(probePan(200, 200, 844, true)).toEqual([0, 0])
  })
  it('lifts a point under the phone card to just above it', () => {
    const [dx, dy] = probePan(200, 600, 844, true)
    expect(dx).toBe(0)
    expect(600 - dy).toBeCloseTo(844 * 0.38 - 18 - 8, 6)
  })
  it('leaves the desktop map alone right of the card or above it', () => {
    expect(probePan(700, 500, 900, false)).toEqual([0, 0])
    expect(probePan(200, 120, 900, false)).toEqual([0, 0])
  })
  it('moves a point under the desktop card to the right of it', () => {
    const [dx, dy] = probePan(200, 500, 900, false)
    expect(200 - dx).toBe(16 + 340 + 70 + 16)
    expect(dy).toBe(0)
  })
})
