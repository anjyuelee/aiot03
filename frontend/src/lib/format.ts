const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** date 為 YYYY-MM-DD（台灣日期） */
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

// CWA 時間字串固定為 +08:00，直接取字元避免受瀏覽器時區影響
export const fmtHour = (iso: string) => `${iso.slice(11, 13)}時`
export const fmtSlot = (iso: string) => `週${weekdayOf(iso.slice(0, 10))} ${iso.slice(11, 16)}`

const clock = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
export const fmtClock = (iso: string) => clock.format(new Date(iso))

const ymd = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Taipei' })
/** 台灣當地日期 YYYY-MM-DD */
export const taipeiDate = (d: Date) => ymd.format(d)

const REL_DAYS = ['今天', '明天', '後天']
/** 三天內用今天／明天／後天，之後用星期 */
export function relDay(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  return REL_DAYS[diff] ?? `週${weekdayOf(date)}`
}

export const fmtMD = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

/** 時間軸各格依日期分段；第 0 格是「現在」，第 i 格是 times[i - 1] */
export function daySegments(times: string[], today: string): { date: string; from: number; to: number }[] {
  const dates = [today, ...times.map(t => t.slice(0, 10))]
  const segs: { date: string; from: number; to: number }[] = []
  dates.forEach((date, i) => {
    const last = segs[segs.length - 1]
    if (last?.date === date) last.to = i
    else segs.push({ date, from: i, to: i })
  })
  return segs
}
