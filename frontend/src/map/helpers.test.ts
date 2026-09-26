import { describe, it, expect } from 'vitest'
import type { Map as MlMap } from 'maplibre-gl'
import { TOWN_HIT, TYPHOON_FOLLOW_BOTTOM, dataLayerBefore, overlayBefore } from './helpers'

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
