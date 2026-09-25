import { useState } from 'react'
import { useStore } from '../store'
import { BASEMAPS, BASEMAP_IDS } from '../lib/basemaps'

/** 右下角的底圖切換：按鈕顯示目前底圖縮圖，展開後列出所有底圖 */
export default function BasemapPicker() {
  const basemap = useStore(s => s.basemap)
  const setBasemap = useStore(s => s.setBasemap)
  const [open, setOpen] = useState(false)
  return (
    <div className="basemap-picker">
      {open && (
        <div className="basemap-menu glass" role="group" aria-label="底圖">
          {BASEMAP_IDS.map(id => (
            <button key={id} className={id === basemap ? 'on' : ''} aria-pressed={id === basemap}
              onClick={() => { setBasemap(id); setOpen(false) }}>
              <img src={BASEMAPS[id].thumb} alt="" />
              <span>{BASEMAPS[id].label}</span>
            </button>
          ))}
        </div>
      )}
      <button className="basemap-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="切換底圖">
        <img src={BASEMAPS[basemap].thumb} alt="" />
        <span>圖層</span>
      </button>
    </div>
  )
}
