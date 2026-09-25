import { useStore } from '../store'
import { ENHANCED, type CloudMode } from '../lib/clouds'
import { gradientCss } from '../lib/colorScale'

const MODES: [CloudMode, string][] = [['enhanced', '色調強化'], ['white', '白色雲層']]

/** 衛星雲圖樣式切換；色調強化時附色階圖例 */
export default function CloudModeToggle() {
  const mode = useStore(s => s.cloudMode)
  const setMode = useStore(s => s.setCloudMode)
  return (
    <div className="cloud-mode">
      <div className="segmented" role="group" aria-label="雲圖樣式">
        {MODES.map(([m, label]) => (
          <button key={m} className={m === mode ? 'on' : ''} aria-pressed={m === mode} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>
      {mode === 'enhanced' && (
        <div className="legend">
          <span>低雲</span>
          <div className="legend-bar" style={{ background: gradientCss(ENHANCED) }} />
          <span>高冷雲頂／強對流</span>
        </div>
      )}
    </div>
  )
}
