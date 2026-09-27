import { create } from 'zustand'
import { LAYERS, type LayerId } from './lib/layers'
import { parseUrlState, toSearch } from './lib/urlState'
import { countyOf } from './lib/geo'
import type { CloudMode } from './lib/clouds'
import type { BasemapId } from './lib/basemaps'
import type { Probe } from './lib/probe'

interface State {
  layer: LayerId
  t: number
  town: string | null
  /** 時間軸連續位置（播放、拖曳時有小數）；t 是四捨五入後的時段，寫進網址 */
  pos: number
  /** 逐層選取時目前所在的縣市；選了鄉鎮就跟著變成它所屬的縣市 */
  county: string | null
  playing: boolean
  cloudMode: CloudMode
  basemap: BasemapId
  /** 地震圖層選取的地震 id；null 為最新一筆，不寫進網址 */
  quake: string | null
  /** 雷達時間軸位置：距離現在的格數（0 為現在、負數往前；播放時在 0 之後有一段停留），不寫進網址 */
  radarPos: number
  /** 地圖點查的位置；切換圖層時清除，不寫進網址 */
  probe: Probe | null
  setLayer: (layer: LayerId) => void
  setT: (t: number) => void
  setPos: (pos: number) => void
  selectTown: (town: string | null) => void
  selectCounty: (county: string | null) => void
  setPlaying: (playing: boolean) => void
  setCloudMode: (cloudMode: CloudMode) => void
  setBasemap: (basemap: BasemapId) => void
  selectQuake: (quake: string | null) => void
  setRadarPos: (radarPos: number) => void
  setProbe: (probe: Probe | null) => void
}

const initial = parseUrlState(window.location.search)

export const useStore = create<State>(set => ({
  ...initial,
  pos: initial.t,
  county: initial.town && countyOf(initial.town),
  playing: false,
  cloudMode: 'enhanced',
  basemap: 'dark',
  quake: null,
  radarPos: 0,
  probe: null,
  // 沒有預報時間軸的圖層切換時回到「現在」；雷達時間軸每次切換都從「現在」開始。
  // 有預報時間軸的圖層之間繼續播放，但雷達回放不能延續成預報播放；點查泡泡只屬於當下的圖層
  setLayer: layer => set(s => LAYERS[layer].timeline
    ? { layer, radarPos: 0, playing: s.playing && !!LAYERS[s.layer].timeline, probe: null }
    : { layer, t: 0, pos: 0, playing: false, radarPos: 0, probe: null }),
  setT: t => set({ t, pos: t }),
  setPos: pos => set({ pos, t: Math.round(pos) }),
  selectTown: town => set(town ? { town, county: countyOf(town) } : { town }),
  selectCounty: county => set({ county, town: null }),
  setPlaying: playing => set({ playing }),
  setCloudMode: cloudMode => set({ cloudMode }),
  setBasemap: basemap => set({ basemap }),
  selectQuake: quake => set({ quake }),
  setRadarPos: radarPos => set({ radarPos }),
  setProbe: probe => set({ probe }),
}))

// 播放時 pos 每幀都變，只在網址相關的欄位改變時才寫網址（瀏覽器會限制 replaceState 頻率）
useStore.subscribe(({ layer, t, town }, prev) => {
  if (layer === prev.layer && t === prev.t && town === prev.town) return
  window.history.replaceState(null, '', toSearch({ layer, t, town }))
})
