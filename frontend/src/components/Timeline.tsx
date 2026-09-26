import { useCallback, useEffect } from 'react'
import { useFutureTimes } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { daySegments, fmtClock, fmtMD, relDay, taipeiDate, weekdayOf } from '../lib/format'
import { advancePos } from '../lib/playback'
import Legend from './Legend'
import CloudModeToggle from './CloudModeToggle'
import TimeTrack, { measureHeight } from './TimeTrack'
import RadarTimeline from './RadarTimeline'

// 播放時每 3 小時一格走 0.8 秒
const STEP_MS = 800

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

  // 雷達播放過去 3 小時；颱風、行政區等沒有時間可播放，不顯示時間軸；衛星只留雲圖樣式切換
  if (!def.future) {
    if (layer === 'radar') return <RadarTimeline />
    return layer === 'satellite' ? <div className="timeline glass compact" ref={measure}><CloudModeToggle /></div> : null
  }

  const today = taipeiDate(new Date())
  const slot = t > 0 ? times[t - 1] : undefined
  const date = slot?.slice(0, 10) ?? today
  const clock = slot ? slot.slice(11, 16) : fmtClock(new Date().toISOString())
  const main = t === 0 ? '現在' : `${relDay(date, today)} ${clock}`
  const sub = `${fmtMD(date)}（${weekdayOf(date)}）${t === 0 ? ` ${clock}` : ''}`
  const scale = t > 0 ? def.future.scale : def.now?.scale
  const segs = max > 0 ? daySegments(times.slice(0, max), today) : []
  return (
    <div className="timeline glass" ref={measure}>
      <TimeTrack max={max} pos={Math.min(pos, max)} value={t} playing={playing} canPlay={max > 0} ariaLabel="預報時間" main={main} sub={sub}
        ticks={Array.from({ length: max + 1 }, (_, i) => (segs.some(s => s.from === i && i > 0) ? 'day' : ''))}
        // 太短的日期段（例如只剩一兩格）只畫分隔線，不放文字以免重疊
        labels={segs.filter(s => (s.to - s.from + 1) / (max + 1) >= 0.15).map(s => ({
          key: s.date, at: s.from, on: s.date === date,
          text: <>{relDay(s.date, today)}<span className="md"> {fmtMD(s.date)}</span></>,
        }))}
        onToggle={() => setPlaying(!playing)}
        onScrub={p => { setPlaying(false); setPos(p) }}
        onRelease={() => setT(Math.round(useStore.getState().pos))}
        onStep={i => { setPlaying(false); setT(i) }} />
      {scale && <Legend scale={scale} />}
    </div>
  )
}
