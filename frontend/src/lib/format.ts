const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** date 為 YYYY-MM-DD（台灣日期） */
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]

// CWA 時間字串固定為 +08:00，直接取字元避免受瀏覽器時區影響
export const fmtHour = (iso: string) => `${iso.slice(11, 13)}時`
export const fmtSlot = (iso: string) => `週${weekdayOf(iso.slice(0, 10))} ${iso.slice(11, 16)}`

const clock = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })
export const fmtClock = (iso: string) => clock.format(new Date(iso))
