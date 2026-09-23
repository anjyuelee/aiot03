import { describe, it, expect } from 'vitest'
import { sampleKmz } from '../__fixtures__/kmz.js'
import { parseSatelliteKmz } from './kmz.js'

describe('parseSatelliteKmz', () => {
  it('reads level-2 tiles with bounds from the GroundOverlay LatLonBox', () => {
    const tiles = parseSatelliteKmz(sampleKmz())
    expect(tiles.map(t => t.id)).toEqual(['2/0/3', '2/1/2'])
    const t = tiles.find(t => t.id === '2/1/2')!
    expect(t.bounds).toEqual([114.48, 24.96, 126.96, 37.44])
    expect(Array.from(t.png)).toEqual([1, 2, 3])
  })
  it('selects another level on request', () => {
    expect(parseSatelliteKmz(sampleKmz(), 3).map(t => t.id)).toEqual(['3/2/4'])
  })
})
