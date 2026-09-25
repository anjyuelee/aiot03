import { create } from 'zustand'
import { LAYERS, type LayerId } from './lib/layers'
import { parseUrlState, toSearch } from './lib/urlState'
import { countyOf } from './lib/geo'
import type { CloudMode } from './lib/clouds'

interface State {
  layer: LayerId
  t: number
  town: string | null
  /** 逐層選取時目前所在的縣市；選了鄉鎮就跟著變成它所屬的縣市 */
  county: string | null
  playing: boolean
  cloudMode: CloudMode
  setLayer: (layer: LayerId) => void
  setT: (t: number) => void
  selectTown: (town: string | null) => void
  selectCounty: (county: string | null) => void
  setPlaying: (playing: boolean) => void
  setCloudMode: (cloudMode: CloudMode) => void
}

const initial = parseUrlState(window.location.search)

export const useStore = create<State>(set => ({
  ...initial,
  county: initial.town && countyOf(initial.town),
  playing: false,
  cloudMode: 'enhanced',
  // 雷達/衛星沒有未來時段，切換時回到「現在」
  setLayer: layer => set(s => ({ layer, t: LAYERS[layer].future ? s.t : 0, playing: LAYERS[layer].future ? s.playing : false })),
  setT: t => set({ t }),
  selectTown: town => set(town ? { town, county: countyOf(town) } : { town }),
  selectCounty: county => set({ county, town: null }),
  setPlaying: playing => set({ playing }),
  setCloudMode: cloudMode => set({ cloudMode }),
}))

useStore.subscribe(({ layer, t, town }) => {
  window.history.replaceState(null, '', toSearch({ layer, t, town }))
})
