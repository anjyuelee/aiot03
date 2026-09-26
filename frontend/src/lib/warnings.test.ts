import { describe, it, expect } from 'vitest'
import {
  COUNTY_SELECTED_WIDTH, WARNING_LINE_WIDTH, badgeText, countyColor, countyFilter, countyRank, fmtValid, groupByKind, outlineOpacity, severityOf, worstByCounty,
} from './warnings'
import type { Warning } from '../../../shared/types'

const w = (countyCode: string, county: string, phenomena: string, extra: Partial<Warning> = {}): Warning => ({
  countyCode, county, phenomena, significance: '特報',
  start: '2026-09-25T05:30:00+08:00', end: '2026-09-25T17:30:00+08:00', ...extra,
})

describe('severityOf', () => {
  it('ranks by keyword, heaviest first', () => {
    const ranks = ['颱風', '超大豪雨', '大豪雨', '豪雨', '大雨', '低溫', '陸上強風', '濃霧'].map(p => severityOf(p).rank)
    expect(ranks).toEqual([7, 6, 6, 5, 4, 3, 2, 1])
  })
  it('falls back to grey for unknown kinds', () => {
    expect(severityOf('高溫')).toEqual({ rank: 0, color: '#868e96' })
  })
})

describe('worstByCounty', () => {
  it('keeps the most severe warning per county', () => {
    const m = worstByCounty([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '豪雨'), w('10015', '花蓮縣', '濃霧')])
    expect(m.get('10002')).toEqual(severityOf('豪雨'))
    expect(m.get('10015')).toEqual(severityOf('濃霧'))
    expect(m.size).toBe(2)
    expect(worstByCounty([w('10002', '宜蘭縣', '豪雨'), w('10002', '宜蘭縣', '陸上強風')]).get('10002')).toEqual(severityOf('豪雨'))
  })
})

describe('countyColor', () => {
  it('is transparent without warnings', () => {
    expect(countyColor([])).toBe('rgba(0,0,0,0)')
  })
  it('matches each county to its most severe colour', () => {
    expect(countyColor([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '豪雨'), w('10015', '花蓮縣', '濃霧')])).toEqual(
      ['match', ['get', 'COUNTYCODE'], '10002', severityOf('豪雨').color, '10015', severityOf('濃霧').color, 'rgba(0,0,0,0)'])
  })
})

describe('countyFilter', () => {
  it('selects no county without warnings', () => {
    expect(countyFilter([])).toEqual(['in', ['get', 'COUNTYCODE'], ['literal', []]])
  })
  it('lists each warned county once, unknown kinds included', () => {
    expect(countyFilter([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '陸上強風'), w('10015', '花蓮縣', '高溫')])).toEqual(
      ['in', ['get', 'COUNTYCODE'], ['literal', ['10002', '10015']]])
  })
})

describe('countyRank', () => {
  it('is 0 without warnings', () => {
    expect(countyRank([])).toBe(0)
  })
  it('matches each county to its highest rank', () => {
    expect(countyRank([w('10002', '宜蘭縣', '陸上強風'), w('10002', '宜蘭縣', '大雨'), w('10015', '花蓮縣', '豪雨')])).toEqual(
      ['match', ['get', 'COUNTYCODE'], '10002', 4, '10015', 5, 0])
  })
})

describe('outlineOpacity', () => {
  it('hides the outline on the warning, quake and admin layers', () => {
    expect((['warning', 'quake', 'admin'] as const).map(l => outlineOpacity(l, 0))).toEqual([0, 0, 0])
  })
  it('fades out between now and the first forecast slot', () => {
    expect([0, 0.5, 1, 3].map(p => outlineOpacity('temp', p))).toEqual([1, 0.5, 0, 0])
    expect(outlineOpacity('temp', 0.52)).toBe(0.5)
    expect(outlineOpacity('radar', 0)).toBe(1)
  })
})

describe('outline widths', () => {
  it('leaves at least 1px of warning colour on each side of the county selection line', () => {
    const rims = WARNING_LINE_WIDTH.map((w, i) => (w - COUNTY_SELECTED_WIDTH[i]) / 2)
    expect(Math.min(...rims)).toBeGreaterThanOrEqual(1)
  })
})

describe('groupByKind', () => {
  const groups = groupByKind([
    w('10015', '花蓮縣', '大雨'),
    w('10002', '宜蘭縣', '陸上強風'),
    w('10002', '宜蘭縣', '大雨'),
    w('63000', '臺北市', '颱風', { significance: '警報' }),
  ])
  it('orders groups by severity and counties by code', () => {
    expect(groups.map(g => g.title)).toEqual(['颱風警報', '大雨特報', '陸上強風特報'])
    expect(groups[1].items.map(i => i.county)).toEqual(['宜蘭縣', '花蓮縣'])
    expect(groups[1].color).toBe(severityOf('大雨').color)
  })
})

describe('badgeText', () => {
  it('is null without warnings, names the kind when there is one, counts otherwise', () => {
    expect(badgeText([])).toBeNull()
    expect(badgeText(groupByKind([w('10002', '宜蘭縣', '大雨'), w('10015', '花蓮縣', '大雨')]))).toBe('⚠ 大雨特報 · 2 縣市')
    expect(badgeText(groupByKind([w('10002', '宜蘭縣', '大雨'), w('10015', '花蓮縣', '濃霧')]))).toBe('⚠ 2 則特報')
  })
})

describe('fmtValid', () => {
  it('formats same-day, cross-day and one-sided ranges', () => {
    expect(fmtValid('2026-09-25T05:30:00+08:00', '2026-09-25T17:30:00+08:00')).toBe('9/25 05:30 – 17:30')
    expect(fmtValid('2026-09-25T22:00:00+08:00', '2026-09-26T06:00:00+08:00')).toBe('9/25 22:00 – 9/26 06:00')
    expect(fmtValid('2026-09-25T06:00:00+08:00', null)).toBe('9/25 06:00 起')
    expect(fmtValid(null, '2026-09-25T06:00:00+08:00')).toBe('至 9/25 06:00')
    expect(fmtValid(null, null)).toBe('')
  })
})
