// 雷達回放：位置以「距離現在的格數」表示，0 為現在、-(n - 1) 為最舊一格；播到現在之後的正值是停留時間
export const RADAR_STEP_MS = 500
const DWELL_STEPS = 1500 / RADAR_STEP_MS

/** 播放前進 dt 毫秒；在「現在」停留完就回到最舊一格 */
export function advanceRadar(pos: number, dt: number, n: number): number {
  const next = pos + dt / RADAR_STEP_MS
  return next >= DWELL_STEPS ? -(n - 1) : next
}

/** 停下或放開時對齊整格；停留區間算「現在」 */
export const snapRadar = (pos: number) => Math.min(0, Math.round(pos))

/** 播放中一律可以暫停；要開始播放得等每格都有結果（成功或失敗），且不只一格 */
export const canToggleRadar = (playing: boolean, settled: boolean, n: number) => playing || (settled && n > 1)

/** 位置 → frames（由舊到新）的 index */
export const radarIndex = (pos: number, n: number) => Math.min(n - 1, Math.max(0, n - 1 + Math.round(pos)))

/** 例：40 分鐘前、2 小時前、1 小時 20 分前；同一格為空字串 */
export function agoLabel(time: string, latest: string): string {
  const min = Math.round((Date.parse(latest) - Date.parse(time)) / 60_000)
  if (min <= 0) return ''
  if (min < 60) return `${min} 分鐘前`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小時 ${m} 分前` : `${h} 小時前`
}

/** 整點（分鐘為 00）的格子 index；CWA 時間固定 +08:00，直接取字元 */
export const hourTicks = (times: string[]) => times.flatMap((t, i) => (t.slice(14, 16) === '00' ? [i] : []))
