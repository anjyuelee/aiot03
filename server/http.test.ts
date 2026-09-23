import { describe, it, expect } from 'vitest'
import { json } from './http.js'

describe('json', () => {
  it('uses the normal cache header for a fresh 200', () => {
    const res = json({ data: [], stale: false })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=600')
  })

  it('uses a short cache header for a stale 200', () => {
    const res = json({ data: [], stale: true })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=30')
  })

  it('does not cache non-200 responses', () => {
    const res = json({ error: 'nope' }, 500)
    expect(res.status).toBe(500)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
