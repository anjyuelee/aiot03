import { describe, it, expect } from 'vitest'
import { fixture } from './load.js'

describe('fixture', () => {
  it('loads a CWA fixture', () => {
    expect(fixture('O-A0001-001.json').success).toBe('true')
  })
})
