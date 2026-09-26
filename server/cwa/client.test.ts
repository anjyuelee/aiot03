import { describe, it, expect, afterEach, vi } from 'vitest'
import { cwa, NotFoundError } from './client.js'

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

  it('downloads bytes and throws on non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))))
    expect(Array.from(await cwa.bytes('https://example.com/a.kmz'))).toEqual([1, 2, 3])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(cwa.bytes('https://example.com/a.kmz')).rejects.toThrow('404')
  })

  it('asks the history API for metadata since a given time', async () => {
    process.env.CWA_API_KEY = SECRET
    const fetch = vi.fn(async (_url: string) => Response.json({ ok: 1 }))
    vi.stubGlobal('fetch', fetch)
    expect(await cwa.historyMetadata('O-A0059-001', { timeFrom: '2026-09-26T07:40:00' })).toEqual({ ok: 1 })
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.pathname).toBe('/historyapi/v1/getMetadata/O-A0059-001')
    expect(url.searchParams.get('timeFrom')).toBe('2026-09-26T07:40:00')
    expect(url.searchParams.get('format')).toBe('JSON')
  })

  it('downloads history data and tells a missing frame apart from other failures', async () => {
    process.env.CWA_API_KEY = SECRET
    const fetch = vi.fn(async (_url: string) => new Response(new Uint8Array([7])))
    vi.stubGlobal('fetch', fetch)
    expect(Array.from(await cwa.historyData('O-A0059-001', '2026/09/26/11/30/00'))).toEqual([7])
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/historyapi/v1/getData/O-A0059-001/2026/09/26/11/30/00')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(cwa.historyData('O-A0059-001', '2026/09/26/11/30/00')).rejects.toBeInstanceOf(NotFoundError)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    expect.assertions(5)
    try {
      await cwa.historyData('O-A0059-001', '2026/09/26/11/30/00')
    } catch (e) {
      expect(e).not.toBeInstanceOf(NotFoundError)
      expect(String(e)).not.toContain(SECRET)
    }
  })
})
