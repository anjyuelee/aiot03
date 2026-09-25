import { useEffect, useRef } from 'react'
import { useFutureTimes } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { daySegments, fmtMD, relDay, taipeiDate, weekdayOf } from '../lib/format'
import Legend from './Legend'
import CloudModeToggle from './CloudModeToggle'

export default function Timeline() {
  const layer = useStore(s => s.layer)
  const t = useStore(s => s.t)
  const playing = useStore(s => s.playing)
  const setT = useStore(s => s.setT)
  const setPlaying = useStore(s => s.setPlaying)
  const times = useFutureTimes()
  const def = LAYERS[layer]
  const ref = useRef<HTMLDivElement>(null)
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
  // 時間軸高度會隨圖例、雲圖切換改變；寫進 CSS 變數，讓右下角的元件在窄螢幕時避開它
  useEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--timeline-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (times.length > 0 && t > max) setT(0)
  }, [t, max, times.length, setT])

  const scale = t > 0 ? def.future?.scale : def.now?.scale
  const today = taipeiDate(new Date())
  const slot = t > 0 ? times[t - 1] : undefined
  const date = slot?.slice(0, 10) ?? today
  const time = slot ? slot.slice(11, 16) : '現在'
  const day = `${relDay(date, today)} ${fmtMD(date)}（${weekdayOf(date)}）`
  const segs = max > 0 ? daySegments(times.slice(0, max), today) : []
  const pct = (i: number) => `${(i / max) * 100}%`
  return (
    <div className="timeline glass" ref={ref}>
      <div className="timeline-row">
        <button className="play" disabled={max === 0} onClick={() => setPlaying(!playing)} aria-label={playing ? '暫停' : '播放'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="track">
          <input type="range" min={0} max={max} value={Math.min(t, max)} disabled={max === 0}
            style={{ '--pct': max ? pct(Math.min(t, max)) : '0%' } as React.CSSProperties}
            onChange={e => setT(Number(e.target.value))} aria-label="預報時間" aria-valuetext={`${day} ${time}`} />
          {max > 0 && (
            <div className="ruler" aria-hidden>
              {Array.from({ length: max + 1 }, (_, i) => (
                <i key={i} className={segs.some(s => s.from === i && i > 0) ? 'tick day' : 'tick'} style={{ left: pct(i) }} />
              ))}
              {/* 太短的日期段（例如只剩一兩格）只畫分隔線，不放文字以免重疊 */}
              {segs.filter(s => (s.to - s.from + 1) / (max + 1) >= 0.15).map(s => (
                <span key={s.date} className={`day-label ${s.date === date ? 'on' : ''}`} style={{ left: pct(s.from) }}>
                  {relDay(s.date, today)}<span className="md"> {fmtMD(s.date)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="time-label">
          <strong>{time}</strong>
          <small>{day}</small>
        </div>
      </div>
      {scale && <Legend scale={scale} />}
      {layer === 'satellite' && <CloudModeToggle />}
    </div>
  )
}
