import { afterEach, describe, it, expect, vi } from 'vitest'
import type { RasterSourceSpecification, StyleSpecification } from 'maplibre-gl'
import { BASEMAPS } from './basemaps'

describe('satellite basemap', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('only shows NLSC imagery from zoom 14, so its opaque fill outside Taiwan never covers the overview', async () => {
    const labels = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background' }, { id: 'place', type: 'symbol', source: 'x' }] }
    vi.stubGlobal('fetch', async () => ({ json: async () => labels }))
    const style = await BASEMAPS.satellite.style() as StyleSpecification
    expect(style.layers.map(l => l.id)).toEqual(['s2', 'nlsc', 'place'])
    expect(style.layers.find(l => l.id === 'nlsc')?.minzoom).toBe(14)
    expect((style.sources.nlsc as RasterSourceSpecification).minzoom).toBe(14)
  })
})
