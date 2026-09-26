import { useRef, type ReactNode } from 'react'

/** 時間軸高度寫進 CSS 變數，讓右下角的元件在窄螢幕時避開它；隱藏時歸零 */
export function measureHeight(el: HTMLDivElement | null) {
  if (!el) return
  const set = (h: number) => document.documentElement.style.setProperty('--timeline-h', `${h}px`)
  const ro = new ResizeObserver(() => set(el.offsetHeight))
  ro.observe(el)
  return () => { ro.disconnect(); set(0) }
}

export interface TrackLabel { key: string; at: number; text: ReactNode; on?: boolean }

interface Props {
  /** 最後一格的 index；0 表示沒有可選的格子 */
  max: number
  /** 目前位置，0～max，播放與拖曳時有小數 */
  pos: number
  /** 對齊後的格 */
  value: number
  playing: boolean
  canPlay: boolean
  ariaLabel: string
  main: string
  sub: string
  /** 每格刻度額外的 class，長度 max + 1 */
  ticks: string[]
  labels: TrackLabel[]
  onToggle: () => void
  /** 按下或拖曳到連續位置 */
  onScrub: (pos: number) => void
  /** 放開拖曳 */
  onRelease: () => void
  /** 鍵盤選到某一格（已夾在 0～max） */
  onStep: (i: number) => void
}

/** 播放鈕＋可拖曳軌道（含刻度）；整塊都可以拖曳 */
export default function TimeTrack(p: Props) {
  const { max } = p
  const rail = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const posAt = (x: number) => {
    const r = rail.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * max
  }
  const release = () => {
    if (!dragging.current) return
    dragging.current = false
    p.onRelease()
  }
  const pct = (i: number) => (max ? (i / max) * 100 : 0)
  const at = pct(p.pos)
  return (
    <div className="timeline-row">
      <button className="play" disabled={!p.canPlay} onClick={p.onToggle} aria-label={p.playing ? '暫停' : '播放'}>
        {p.playing ? '❚❚' : '▶'}
      </button>
      <div className="track" role="slider" tabIndex={0} aria-label={p.ariaLabel}
        aria-valuemin={0} aria-valuemax={max} aria-valuenow={p.value} aria-valuetext={`${p.main} ${p.sub}`}
        onPointerDown={e => {
          if (max === 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          p.onScrub(posAt(e.clientX))
        }}
        onPointerMove={e => { if (dragging.current) p.onScrub(posAt(e.clientX)) }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={e => {
          const k = { ArrowRight: p.value + 1, ArrowUp: p.value + 1, ArrowLeft: p.value - 1, ArrowDown: p.value - 1, Home: 0, End: max }[e.key]
          if (k === undefined) return
          e.preventDefault()
          p.onStep(Math.min(max, Math.max(0, k)))
        }}>
        <div className="rail-area" ref={rail}>
          {/* 標籤跟著目前位置移動；兩端時貼齊邊緣不超出 */}
          <div className="bubble" style={{ left: `${at}%`, transform: `translateX(-${at}%)` }}>
            <b>{p.main}</b> <span>{p.sub}</span>
          </div>
          <div className="rail"><div className="fill" style={{ width: `${at}%` }} /></div>
          <div className="thumb" style={{ left: `${at}%` }} />
        </div>
        <div className="ruler" aria-hidden>
          {p.ticks.map((c, i) => <i key={i} className={c ? `tick ${c}` : 'tick'} style={{ left: `${pct(i)}%` }} />)}
          {p.labels.map(l => (
            <span key={l.key} className={`day-label ${l.on ? 'on' : ''}`} style={{ left: `${pct(l.at)}%` }}>{l.text}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
