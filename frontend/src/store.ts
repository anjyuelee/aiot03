import { create } from 'zustand'
import { LAYERS, type LayerId } from './lib/layers'
import { parseUrlState, toSearch } from './lib/urlState'

interface State {
  layer: LayerId
  t: number
  town: string | null
  playing: boolean
  setLayer: (layer: LayerId) => void
  setT: (t: number) => void
  selectTown: (town: string | null) => void
  setPlaying: (playing: boolean) => void
}

export const useStore = create<State>(set => ({
  ...parseUrlState(window.location.search),
  playing: false,
  // 雷達/衛星沒有未來時段，切換時回到「現在」
  setLayer: layer => set(s => ({ layer, t: LAYERS[layer].future ? s.t : 0, playing: LAYERS[layer].future ? s.playing : false })),
  setT: t => set({ t }),
  selectTown: town => set({ town }),
  setPlaying: playing => set({ playing }),
}))

useStore.subscribe(({ layer, t, town }) => {
  window.history.replaceState(null, '', toSearch({ layer, t, town }))
})
