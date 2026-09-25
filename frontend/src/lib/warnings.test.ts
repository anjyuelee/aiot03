import { describe, it, expect } from 'vitest'
import { badgeText, fmtValid, groupByKind, severityOf, worstByCounty } from './warnings'
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
  it('keeps the most severe colour per county', () => {
    const m = worstByCounty([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '豪雨'), w('10015', '花蓮縣', '濃霧')])
    expect(m.get('10002')).toBe(severityOf('豪雨').color)
    expect(m.get('10015')).toBe(severityOf('濃霧').color)
    expect(m.size).toBe(2)
    expect(worstByCounty([w('10002', '宜蘭縣', '豪雨'), w('10002', '宜蘭縣', '陸上強風')]).get('10002')).toBe(severityOf('豪雨').color)
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
