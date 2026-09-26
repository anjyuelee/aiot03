import { useCallback, useEffect, useMemo } from 'react'
import { useRadar, useRadarFrames } from '../api'
import { useStore } from '../store'
import { advanceRadar, agoLabel, canToggleRadar, hourTicks, radarIndex, radarStart, snapRadar, trackPos } from '../lib/radar'
import Legend from './Legend'
import TimeTrack, { measureHeight } from './TimeTrack'

/** 雷達過去 3 小時：左為最舊、右為「現在」 */
export default function RadarTimeline() {
  const radar = useRadar(true)
  const frames = useRadarFrames(radar.data?.data ?? null)
  const times = useMemo(() => radar.data?.data.frames.map(f => f.time) ?? [], [radar.data])
  const radarPos = useStore(s => s.radarPos)
  const playing = useStore(s => s.playing)
  const setRadarPos = useStore(s => s.setRadarPos)
  const setPlaying = useStore(s => s.setPlaying)
  const measure = useCallback(measureHeight, [])
  const n = times.length

  useEffect(() => {
    if (!playing || n === 0) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      setRadarPos(advanceRadar(useStore.getState().radarPos, now - last, n))
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      setRadarPos(snapRadar(useStore.getState().radarPos))
    }
  }, [playing, n, setRadarPos])

  if (n === 0) return <div className="timeline glass compact" ref={measure}><Legend scale="radar" /></div>

  const max = n - 1
  const index = radarIndex(radarPos, n)
  const time = times[index]
  const clock = time.slice(11, 16)
  const hours = hourTicks(times)
  // 全部格子都有結果（成功或失敗）才能播放，動畫不會停下來等；清單更新多出的新格載入中時仍可暫停
  const settled = frames.every(f => !f.isPending)
  return (
    <div className="timeline glass" ref={measure}>
      <TimeTrack max={max} pos={trackPos(radarPos, n)} value={index} playing={playing} canPlay={canToggleRadar(playing, settled, n)} ariaLabel="雷達觀測時間"
        main={index === max ? '現在' : clock} sub={index === max ? `${clock} 觀測` : agoLabel(time, times[max])}
        ticks={times.map((_, i) => [hours.includes(i) ? 'day' : '', frames[i]?.isError ? 'failed' : frames[i]?.isPending ? 'pending' : '']
          .filter(Boolean).join(' '))}
        // 最後兩格放不下「HH:00」，不標字以免超出右緣
        labels={hours.filter(i => i <= max - 2).map(i => ({ key: times[i], at: i, text: times[i].slice(11, 16) }))}
        onToggle={() => {
          // 停在「現在」按播放時從最舊一格開始
          if (!playing && radarPos >= 0) setRadarPos(radarStart(n))
          setPlaying(!playing)
        }}
        onScrub={p => { setPlaying(false); setRadarPos(p - max) }}
        onRelease={() => setRadarPos(snapRadar(useStore.getState().radarPos))}
        onStep={i => { setPlaying(false); setRadarPos(i - max) }} />
      <Legend scale="radar" />
    </div>
  )
}
