import { useEarthquakes } from '../api'
import { useStore } from '../store'
import { quakeBadge } from '../lib/quakes'

/** 一小時內有地震時在任何圖層提示；點了切到地震圖層並選取最新一筆。已在地震圖層時不顯示 */
export default function QuakeBadge() {
  const layer = useStore(s => s.layer)
  const setLayer = useStore(s => s.setLayer)
  const selectQuake = useStore(s => s.selectQuake)
  const q = useEarthquakes()
  // 每次 refetch（5 分鐘）有新資料時重新渲染才重算，超過一小時後約晚 5 分鐘消失，不另加計時器
  const text = quakeBadge(q.data?.data ?? [], Date.now())
  if (!text || layer === 'quake') return null
  return (
    <button className="badge glass alert quake" onClick={() => { selectQuake(null); setLayer('quake') }}>{text}</button>
  )
}
