import { useWarnings } from '../api'
import { useStore } from '../store'
import { badgeText, groupByKind } from '../lib/warnings'

/** 任何圖層都看得到的特報提示；點了切到特報圖層。無特報或已在特報圖層時不顯示 */
export default function WarningBadge() {
  const layer = useStore(s => s.layer)
  const setLayer = useStore(s => s.setLayer)
  const q = useWarnings()
  const text = badgeText(groupByKind(q.data?.data ?? []))
  if (!text || layer === 'warning') return null
  return <button className="badge glass alert" onClick={() => setLayer('warning')}>{text}</button>
}
