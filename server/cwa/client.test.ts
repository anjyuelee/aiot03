import { describe, it, expect, afterEach, vi } from 'vitest'
import { cwa } from './client.js'

const SECRET = 'CWA-TEST-SECRET'

describe('cwa client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.CWA_API_KEY
  })

  it('does not leak the API key in a rejection message', async () => {
    process.env.CWA_API_KEY = SECRET
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })))

    expect.assertions(1)
    try {
      await cwa.dataset('O-A0001-001')
    } catch (e) {
      expect(String(e)).not.toContain(SECRET)
    }
  })
})
