import { useEffect } from 'react'
import { useFutureTimes } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { fmtSlot } from '../lib/format'
import Legend from './Legend'

export default function Timeline() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const playing = useStore(s => s.playing)
  const setT = useStore(s => s.setT)
  const setPlaying = useStore(s => s.setPlaying)
  const times = useFutureTimes()
  const def = LAYERS[layer]
  const max = def.future ? times.length : 0

  useEffect(() => {
    if (!playing || max === 0) return
    const id = setInterval(() => {
      const cur = useStore.getState().t
      setT(cur >= max ? 0 : cur + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [playing, max, setT])

  // URL 帶入的 t 超出範圍（例如資料已更新）時回到現在
  useEffect(() => {
    if (times.length > 0 && t > max) setT(0)
  }, [t, max, times.length, setT])

  const scale = t > 0 ? def.future?.scale : def.now?.scale
  return (
    <div className="timeline glass">
      <div className="timeline-row">
        <button className="play" disabled={max === 0} onClick={() => setPlaying(!playing)} aria-label={playing ? '暫停' : '播放'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <input type="range" min={0} max={max} value={Math.min(t, max)} disabled={max === 0}
          onChange={e => setT(Number(e.target.value))} aria-label="預報時間" />
        <span className="time-label">{t === 0 ? '現在' : times[t - 1] ? fmtSlot(times[t - 1]) : ''}</span>
      </div>
      {scale && <Legend scale={scale} />}
    </div>
  )
}
