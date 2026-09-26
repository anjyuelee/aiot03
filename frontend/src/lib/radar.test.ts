import { describe, it, expect } from 'vitest'
import { advanceRadar, agoLabel, canToggleRadar, hourTicks, radarIndex, radarStart, snapRadar, trackPos } from './radar'
import { SCALES } from './colorScale'

describe('advanceRadar', () => {
  it('moves one frame every 500 ms', () => {
    expect(advanceRadar(-18, 500, 19)).toBe(-17)
    expect(advanceRadar(-1, 250, 19)).toBe(-0.5)
  })
  it('shows every frame for 500 ms and lingers on the latest for 1.5 s more, loop after loop', () => {
    // 以 60 fps 播兩輪，量每一格實際停留多久
    const frame = 1000 / 60
    const shown: number[][] = [[]]
    let pos = radarStart(19)
    let prev = radarIndex(pos, 19)
    let since = 0
    for (let t = 0; t < 2 * 11_000; t += frame) {
      pos = advanceRadar(pos, frame, 19)
      const i = radarIndex(pos, 19)
      since += frame
      if (i === prev) continue
      shown[shown.length - 1][prev] = since
      if (i === 0) shown.push([])
      prev = i
      since = 0
    }
    for (const loop of shown.slice(0, 2)) {
      expect(loop).toHaveLength(19)
      loop.slice(0, 18).forEach(ms => expect(ms).toBeCloseTo(500, -1.5))
      expect(loop[18]).toBeCloseTo(2000, -1.5)
    }
  })
})

describe('snapRadar / radarIndex', () => {
  it('snaps to whole frames and treats the dwell as now', () => {
    expect(snapRadar(-3.4)).toBe(-3)
    expect(snapRadar(2.6)).toBe(0)
  })
  it('maps positions to frame indexes, clamped to the list', () => {
    expect(radarIndex(0, 19)).toBe(18)
    expect(radarIndex(-18, 19)).toBe(0)
    expect(radarIndex(-30, 19)).toBe(0)
    // 清單變短（缺格）時停在「現在」仍是最後一格
    expect(radarIndex(0, 17)).toBe(16)
  })
})

describe('trackPos', () => {
  it('keeps the slider on the rail at the playback start, during the dwell and after the list shrinks', () => {
    expect(trackPos(radarStart(19), 19)).toBe(0)
    expect(trackPos(-9, 19)).toBe(9)
    expect(trackPos(2, 19)).toBe(18)
    expect(trackPos(-18, 17)).toBe(0)
  })
})

describe('agoLabel', () => {
  const latest = '2026-09-26T11:50:00+08:00'
  it('is empty for the latest frame', () => {
    expect(agoLabel(latest, latest)).toBe('')
  })
  it('uses minutes under an hour, then hours and minutes', () => {
    expect(agoLabel('2026-09-26T11:10:00+08:00', latest)).toBe('40 分鐘前')
    expect(agoLabel('2026-09-26T10:30:00+08:00', latest)).toBe('1 小時 20 分前')
    expect(agoLabel('2026-09-26T09:50:00+08:00', latest)).toBe('2 小時前')
  })
})

describe('hourTicks', () => {
  it('marks the frames on the hour', () => {
    expect(hourTicks(['2026-09-26T09:50:00+08:00', '2026-09-26T10:00:00+08:00', '2026-09-26T10:10:00+08:00', '2026-09-26T11:00:00+08:00']))
      .toEqual([1, 3])
  })
})

describe('radar scale', () => {
  it('has one stop per dBZ from 0 to 65', () => {
    const { unit, stops } = SCALES.radar
    expect(unit).toBe('dBZ')
    expect(stops).toHaveLength(66)
    expect(stops[0]).toEqual([0, '#00ffff'])
    expect(stops[15]).toEqual([15, '#00ff00'])
    expect(stops[65]).toEqual([65, '#9600ff'])
  })
})

describe('canToggleRadar', () => {
  it('always lets a running replay be paused, even while a new frame is loading', () => {
    expect(canToggleRadar(true, false, 19)).toBe(true)
  })
  it('only starts playback once every frame has settled and there is more than one', () => {
    expect(canToggleRadar(false, false, 19)).toBe(false)
    expect(canToggleRadar(false, true, 1)).toBe(false)
    expect(canToggleRadar(false, true, 19)).toBe(true)
  })
})
