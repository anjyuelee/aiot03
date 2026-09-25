import { useEarthquakes } from '../api'
import { useStore } from '../store'
import { quakeBadge } from '../lib/quakes'

/** 一小時內有地震時在任何圖層提示；點了切到地震圖層並選取最新一筆。已在地震圖層時不顯示 */
export default function QuakeBadge() {
  const layer = useStore(s => s.layer)
  const setLayer = useStore(s => s.setLayer)
  const selectQuake = useStore(s => s.selectQuake)
  const q = useEarthquakes()
  // 讀 dataUpdatedAt：資料內容沒變時 TanStack Query 不會通知只讀 data 的元件，靠每次成功取得都會變的時間戳記
  // 讓 60 分鐘的判斷約每 5 分鐘（refetch）重算一次，不另加計時器
  const text = q.dataUpdatedAt ? quakeBadge(q.data?.data ?? [], Date.now()) : null
  if (!text || layer === 'quake') return null
  return (
    <button className="badge glass alert quake" onClick={() => { selectQuake(null); setLayer('quake') }}>{text}</button>
  )
}
