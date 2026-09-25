import { useCallback, useEffect, useRef } from 'react'
import { useFutureTimes } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { daySegments, fmtClock, fmtMD, relDay, taipeiDate, weekdayOf } from '../lib/format'
import { advancePos } from '../lib/playback'
import Legend from './Legend'
import CloudModeToggle from './CloudModeToggle'

// 播放時每 3 小時一格走 0.8 秒
const STEP_MS = 800

/** 時間軸高度寫進 CSS 變數，讓右下角的元件在窄螢幕時避開它；隱藏時歸零 */
function measureHeight(el: HTMLDivElement | null) {
  if (!el) return
  const set = (h: number) => document.documentElement.style.setProperty('--timeline-h', `${h}px`)
  const ro = new ResizeObserver(() => set(el.offsetHeight))
  ro.observe(el)
  return () => { ro.disconnect(); set(0) }
}

export default function Timeline() {
  const layer = useStore(s => s.layer)
  const pos = useStore(s => s.pos)
  const t = useStore(s => s.t)
  const playing = useStore(s => s.playing)
  const setPos = useStore(s => s.setPos)
  const setT = useStore(s => s.setT)
  const setPlaying = useStore(s => s.setPlaying)
  const times = useFutureTimes()
  const def = LAYERS[layer]
  const max = def.future ? times.length : 0
  const rail = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const measure = useCallback(measureHeight, [])

  // 以 requestAnimationFrame 連續前進；停下時對齊最近的整格，停住時看到的一定是實際預報值
  useEffect(() => {
    if (!playing || max === 0) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      setPos(advancePos(useStore.getState().pos, now - last, max, STEP_MS))
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      setT(Math.round(useStore.getState().pos))
    }
  }, [playing, max, setPos, setT])

  // URL 帶入的 t 超出範圍（例如資料已更新）時回到現在
  useEffect(() => {
    if (times.length > 0 && t > max) setT(0)
  }, [t, max, times.length, setT])

  // 雷達、颱風、行政區沒有時間可播放，不顯示時間軸；衛星只留雲圖樣式切換
  if (!def.future) {
    return layer === 'satellite' ? <div className="timeline glass compact" ref={measure}><CloudModeToggle /></div> : null
  }

  const posAt = (x: number) => {
    const r = rail.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * max
  }
  const release = () => {
    if (!dragging.current) return
    dragging.current = false
    setT(Math.round(useStore.getState().pos))
  }
  const step = (k: number) => { setPlaying(false); setT(Math.min(max, Math.max(0, k))) }

  const today = taipeiDate(new Date())
  const slot = t > 0 ? times[t - 1] : undefined
  const date = slot?.slice(0, 10) ?? today
  const clock = slot ? slot.slice(11, 16) : fmtClock(new Date().toISOString())
  const main = t === 0 ? '現在' : `${relDay(date, today)} ${clock}`
  const sub = `${fmtMD(date)}（${weekdayOf(date)}）${t === 0 ? ` ${clock}` : ''}`
  const scale = t > 0 ? def.future.scale : def.now?.scale
  const segs = max > 0 ? daySegments(times.slice(0, max), today) : []
  const pct = (i: number) => (max ? (i / max) * 100 : 0)
  const p = pct(Math.min(pos, max))
  return (
    <div className="timeline glass" ref={measure}>
      <div className="timeline-row">
        <button className="play" disabled={max === 0} onClick={() => setPlaying(!playing)} aria-label={playing ? '暫停' : '播放'}>
          {playing ? '❚❚' : '▶'}
        </button>
        {/* 整塊（含日期刻度）都可以拖曳 */}
        <div className="track" role="slider" tabIndex={0} aria-label="預報時間"
          aria-valuemin={0} aria-valuemax={max} aria-valuenow={t} aria-valuetext={`${main} ${sub}`}
          onPointerDown={e => {
            if (max === 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            dragging.current = true
            setPlaying(false)
            setPos(posAt(e.clientX))
          }}
          onPointerMove={e => { if (dragging.current) setPos(posAt(e.clientX)) }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={e => {
            const k = { ArrowRight: t + 1, ArrowUp: t + 1, ArrowLeft: t - 1, ArrowDown: t - 1, Home: 0, End: max }[e.key]
            if (k === undefined) return
            e.preventDefault()
            step(k)
          }}>
          <div className="rail-area" ref={rail}>
            {/* 標籤跟著目前位置移動；兩端時貼齊邊緣不超出 */}
            <div className="bubble" style={{ left: `${p}%`, transform: `translateX(-${p}%)` }}>
              <b>{main}</b> <span>{sub}</span>
            </div>
            <div className="rail"><div className="fill" style={{ width: `${p}%` }} /></div>
            <div className="thumb" style={{ left: `${p}%` }} />
          </div>
          <div className="ruler" aria-hidden>
            {Array.from({ length: max + 1 }, (_, i) => (
              <i key={i} className={segs.some(s => s.from === i && i > 0) ? 'tick day' : 'tick'} style={{ left: `${pct(i)}%` }} />
            ))}
            {/* 太短的日期段（例如只剩一兩格）只畫分隔線，不放文字以免重疊 */}
            {segs.filter(s => (s.to - s.from + 1) / (max + 1) >= 0.15).map(s => (
              <span key={s.date} className={`day-label ${s.date === date ? 'on' : ''}`} style={{ left: `${pct(s.from)}%` }}>
                {relDay(s.date, today)}<span className="md"> {fmtMD(s.date)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {scale && <Legend scale={scale} />}
    </div>
  )
}
