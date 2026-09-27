import { afterEach, describe, it, expect, vi } from 'vitest'
import type { Map as MlMap } from 'maplibre-gl'
import { FIT_PADDING, TOWN_HIT, TYPHOON_FOLLOW_BOTTOM, cardFitPadding, countyFitPadding, dataLayerBefore, overlayBefore } from './helpers'

// 只模擬插入點會用到的兩個方法；layers 由下往上，firstSymbolLayer 靠 type 找文字圖層
const fakeMap = (layers: [id: string, type: string][]) => ({
  getLayer: (id: string) => {
    const l = layers.find(([l]) => l === id)
    return l && { id, type: l[1] }
  },
  getLayersOrder: () => layers.map(([id]) => id),
}) as unknown as MlMap

describe('layer insertion points', () => {
  const base: [string, string][] = [['background', 'background'], ['water', 'fill'], ['place', 'symbol']]
  it('falls back to the first symbol layer before the boundaries load', () => {
    const map = fakeMap(base)
    expect(dataLayerBefore(map)).toBe('place')
    expect(overlayBefore(map)).toBe('place')
  })
  it('puts data layers and overlays under the boundaries', () => {
    const map = fakeMap([...base.slice(0, 2), [TOWN_HIT, 'fill'], base[2]])
    expect(dataLayerBefore(map)).toBe(TOWN_HIT)
    expect(overlayBefore(map)).toBe(TOWN_HIT)
  })
  it('puts data layers under the typhoon overlay', () => {
    const map = fakeMap([...base.slice(0, 2), [TYPHOON_FOLLOW_BOTTOM, 'fill'], [TOWN_HIT, 'fill'], base[2]])
    expect(dataLayerBefore(map)).toBe(TYPHOON_FOLLOW_BOTTOM)
    expect(overlayBefore(map)).toBe(TOWN_HIT)
  })
})

describe('cardFitPadding', () => {
  afterEach(() => vi.unstubAllGlobals())
  // 手機 390×664；cardTop 為資訊卡頂端，null 表示畫面上沒有卡片
  const phone = (cardTop: number | null) => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.stubGlobal('innerHeight', 664)
    vi.stubGlobal('document', { querySelector: () => (cardTop == null ? null : { offsetTop: cardTop }) })
  }
  it('keeps the fitted area above the phone card', () => {
    phone(329)
    expect(cardFitPadding().bottom).toBe(664 - 329 + 20)
  })
  it('falls back to 45% of the height without a card', () => {
    phone(null)
    expect(cardFitPadding().bottom).toBe(Math.round(664 * 0.45))
  })
})

describe('countyFitPadding', () => {
  afterEach(() => vi.unstubAllGlobals())
  // panelBottom 為左上角搜尋列、麵包屑與徽章的下緣，null 表示量不到
  const stub = (phone: boolean, panelBottom: number | null) => {
    vi.stubGlobal('matchMedia', () => ({ matches: phone }))
    vi.stubGlobal('document', { querySelector: () => (panelBottom == null ? null : { getBoundingClientRect: () => ({ bottom: panelBottom }) }) })
  }
  it('keeps the usual padding on desktop', () => {
    stub(false, 200)
    expect(countyFitPadding()).toEqual(FIT_PADDING)
  })
  it('keeps the county and the probe bubble below the phone top panel', () => {
    // 泡泡以點為垂直中心、半高 18px，再留 8px
    stub(true, 161)
    expect(countyFitPadding()).toEqual({ ...FIT_PADDING, top: 161 + 26 })
  })
  it('falls back to the usual padding without the panel', () => {
    stub(true, null)
    expect(countyFitPadding()).toEqual(FIT_PADDING)
  })
})
