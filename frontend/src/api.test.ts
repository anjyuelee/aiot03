import { describe, it, expect, vi, afterEach } from 'vitest'
import type { CanvasOverlay } from './lib/reproject'

// TanStack Query 沒有 window 時視為 server，會停用 refetchInterval；先補替身再載入
vi.stubGlobal('window', {})
const { QueryClient, QueryObserver } = await import('@tanstack/react-query')
const { radarFrameQuery } = await import('./api')

const overlay = {} as CanvasOverlay

/** 以 radarFrameQuery 的設定跑一個真的 observer，只把載入換成可控制的函式 */
function observe(load: () => Promise<CanvasOverlay>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const opts = { ...radarFrameQuery({ time: '2026-09-26T11:00:00+08:00', url: '/api/radar-frame?t=202609261100' }, [0, 0, 1, 1]), queryFn: load }
  const observer = new QueryObserver(client, opts)
  const unsubscribe = observer.subscribe(() => {})
  return { observer, unsubscribe }
}

afterEach(() => { vi.useRealTimers() })

describe('radarFrameQuery', () => {
  it('fetches a failed frame again a minute later instead of leaving it failed', async () => {
    vi.useFakeTimers()
    let calls = 0
    const { observer, unsubscribe } = observe(async () => {
      calls++
      if (calls === 1) throw new Error('502')
      return overlay
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(observer.getCurrentResult().status).toBe('error')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(observer.getCurrentResult().data).toBe(overlay)
    unsubscribe()
  })

  it('does not refetch a frame that loaded', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => overlay)
    const { unsubscribe } = observe(load)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(load).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
