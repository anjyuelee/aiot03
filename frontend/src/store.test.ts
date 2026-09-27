import { describe, it, expect, vi, beforeEach } from 'vitest'

// store 載入時讀網址、之後寫網址；測試環境沒有 window，先補最小的替身
vi.stubGlobal('window', { location: { search: '' }, history: { replaceState: () => {} } })
const { useStore } = await import('./store')

describe('setLayer', () => {
  beforeEach(() => useStore.setState({ layer: 'temp', t: 0, pos: 0, playing: false, radarPos: 0 }))

  it('stops playback when leaving the radar replay for a forecast layer', () => {
    useStore.setState({ layer: 'radar', playing: true, radarPos: -5 })
    useStore.getState().setLayer('temp')
    expect(useStore.getState()).toMatchObject({ layer: 'temp', playing: false, radarPos: 0 })
  })

  it('keeps forecast playback running between forecast layers', () => {
    useStore.setState({ layer: 'temp', playing: true })
    useStore.getState().setLayer('wind')
    expect(useStore.getState()).toMatchObject({ layer: 'wind', playing: true })
  })

  it('stops playback when entering the radar layer', () => {
    useStore.setState({ layer: 'temp', playing: true, t: 3, pos: 3 })
    useStore.getState().setLayer('radar')
    expect(useStore.getState()).toMatchObject({ layer: 'radar', playing: false, t: 0, pos: 0, radarPos: 0 })
  })

  it('keeps the forecast time and playback when switching to the typhoon layer', () => {
    useStore.setState({ layer: 'wind', playing: true, t: 8, pos: 8 })
    useStore.getState().setLayer('typhoon')
    expect(useStore.getState()).toMatchObject({ layer: 'typhoon', playing: true, t: 8, pos: 8 })
  })

  it('returns to now when leaving the typhoon layer for the radar', () => {
    useStore.setState({ layer: 'typhoon', playing: true, t: 8, pos: 8 })
    useStore.getState().setLayer('radar')
    expect(useStore.getState()).toMatchObject({ layer: 'radar', playing: false, t: 0, pos: 0 })
  })

  it('does not carry the radar replay into the typhoon timeline', () => {
    useStore.setState({ layer: 'radar', playing: true, radarPos: -5 })
    useStore.getState().setLayer('typhoon')
    expect(useStore.getState()).toMatchObject({ layer: 'typhoon', playing: false, radarPos: 0 })
  })
})
