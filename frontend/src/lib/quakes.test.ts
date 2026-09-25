import { describe, it, expect } from 'vitest'
import type { Point } from 'geojson'
import type { Earthquake, QuakeStation } from '../../../shared/types'
import {
  INTENSITY_LEGEND, fmtMagnitude, fmtQuakeTime, intensityColor, intensityRank, maxIntensity, pickQuake, quakeBadge, quakeBounds, toGeoJSON,
} from './quakes'

const st = (name: string, lon: number, lat: number, intensity: string): QuakeStation => ({ id: name, name, lat, lon, intensity })
const quake = (time: string, extra: Partial<Earthquake> = {}): Earthquake => ({
  id: time, no: 115064, time, lat: 23.21, lon: 120.54, depth: 7.5, magnitude: 4.2, location: '臺南市楠西區',
  counties: [
    { county: '臺南市', intensity: '4級', stations: [st('曾文', 120.497, 23.22, '4級')] },
    { county: '嘉義縣', intensity: '3級', stations: [st('大埔', 120.59, 23.3, '3級'), st('民雄', 120.474, 23.532, '1級')] },
  ],
  web: 'https://scweb.cwa.gov.tw/zh-tw/earthquake/details/2026064',
  ...extra,
})

describe('intensityRank / intensityColor', () => {
  it('orders the CWA scale including the weak/strong halves', () => {
    const scale = ['0級', '1級', '2級', '3級', '4級', '5弱', '5強', '6弱', '6強', '7級']
    expect(scale.map(intensityRank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(intensityRank('5弱')).toBeLessThan(intensityRank('5強'))
    expect(intensityRank('5強')).toBeLessThan(intensityRank('6弱'))
  })
  it('treats unknown strings as rank -1 in grey', () => {
    expect(intensityRank('8級')).toBe(-1)
    expect(intensityColor('8級')).toBe('#868e96')
    expect(intensityColor('')).toBe('#868e96')
    expect(intensityColor('4級')).toBe('#ff922b')
  })
  it('lists 1級 to 7級 in the legend', () => {
    expect(INTENSITY_LEGEND.map(l => l.label)).toEqual(['1級', '2級', '3級', '4級', '5弱', '5強', '6弱', '6強', '7級'])
  })
})

describe('maxIntensity', () => {
  it('takes the highest county intensity regardless of order', () => {
    const q = quake('2026-09-22T05:16:13+08:00', {
      counties: [
        { county: '嘉義縣', intensity: '4級', stations: [] },
        { county: '臺南市', intensity: '5弱', stations: [] },
        { county: '高雄市', intensity: '1級', stations: [] },
      ],
    })
    expect(maxIntensity(q)).toBe('5弱')
    expect(maxIntensity(quake('2026-09-22T05:16:13+08:00', { counties: [] }))).toBeNull()
  })
})

describe('fmtQuakeTime', () => {
  it('formats as M/D HH:mm', () => {
    expect(fmtQuakeTime('2026-09-22T05:16:13+08:00')).toBe('9/22 05:16')
  })
})

describe('pickQuake', () => {
  const list = [quake('2026-09-25T01:01:23+08:00'), quake('2026-09-22T05:16:13+08:00')]
  it('finds the selected quake and falls back to the newest', () => {
    expect(pickQuake(list, '2026-09-22T05:16:13+08:00')).toBe(list[1])
    expect(pickQuake(list, null)).toBe(list[0])
    expect(pickQuake(list, 'gone')).toBe(list[0])
    expect(pickQuake([], null)).toBeNull()
  })
})

describe('quakeBadge', () => {
  const t = Date.parse('2026-09-22T05:16:13+08:00')
  const list = [quake('2026-09-22T05:16:13+08:00')]
  it('shows the newest quake for 60 minutes', () => {
    expect(quakeBadge(list, t + 59 * 60_000)).toBe('地震 M4.2 臺南市楠西區 · 最大 4級')
    expect(quakeBadge(list, t + 60 * 60_000)).not.toBeNull()
    expect(quakeBadge(list, t + 61 * 60_000)).toBeNull()
  })
  it('is null without quakes and omits the intensity when there is none', () => {
    expect(quakeBadge([], t)).toBeNull()
    expect(quakeBadge([quake('2026-09-22T05:16:13+08:00', { counties: [] })], t)).toBe('地震 M4.2 臺南市楠西區')
  })
  it('shows whole-number magnitudes with one decimal', () => {
    expect(fmtMagnitude(5)).toBe('5.0')
    expect(fmtMagnitude(4.2)).toBe('4.2')
    expect(quakeBadge([quake('2026-09-22T05:16:13+08:00', { magnitude: 5 })], t)).toBe('地震 M5.0 臺南市楠西區 · 最大 4級')
  })
})

describe('quakeBounds', () => {
  it('covers the epicentre and every station', () => {
    expect(quakeBounds(quake('2026-09-22T05:16:13+08:00'))).toEqual([120.474, 23.21, 120.59, 23.532])
    expect(quakeBounds(quake('2026-09-22T05:16:13+08:00', { counties: [] }))).toEqual([120.54, 23.21, 120.54, 23.21])
  })
})

describe('toGeoJSON', () => {
  const list = [quake('2026-09-25T01:01:23+08:00', { magnitude: 2.6, counties: [] }), quake('2026-09-22T05:16:13+08:00')]
  it('emits every epicentre and only the selected quake\'s stations', () => {
    const fc = toGeoJSON(list, '2026-09-22T05:16:13+08:00')
    const stations = fc.features.filter(f => f.properties!.role === 'station')
    const epicentres = fc.features.filter(f => f.properties!.role === 'epicenter')
    expect(stations).toHaveLength(3)
    expect(stations.map(f => f.properties!.color)).toEqual(['#ff922b', '#fcc419', '#b2f2bb'])
    expect(epicentres.map(f => f.properties)).toEqual([
      { role: 'epicenter', id: '2026-09-25T01:01:23+08:00', magnitude: 2.6, color: '#868e96', selected: false },
      { role: 'epicenter', id: '2026-09-22T05:16:13+08:00', magnitude: 4.2, color: '#ff922b', selected: true },
    ])
    expect((epicentres[1].geometry as Point).coordinates).toEqual([120.54, 23.21])
  })
  it('has no stations when nothing matches the selection', () => {
    expect(toGeoJSON(list, null).features.every(f => f.properties!.role === 'epicenter')).toBe(true)
  })
})
