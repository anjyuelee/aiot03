import { describe, it, expect } from 'vitest'
import { LAYERS, LAYER_IDS } from './layers'

describe('LAYERS', () => {
  it('gives the forecast timeline to the weather layers and the typhoon layer only', () => {
    expect(LAYER_IDS.filter(id => LAYERS[id].timeline)).toEqual(['temp', 'wind', 'rain', 'humidity', 'typhoon'])
  })
  it('keeps the typhoon layer without a forecast colour scale', () => {
    expect(LAYERS.typhoon.future).toBeUndefined()
  })
})
