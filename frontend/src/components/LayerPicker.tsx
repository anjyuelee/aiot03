import { useState } from 'react'
import { useStore } from '../store'
import { LAYERS, LAYER_IDS } from '../lib/layers'

export default function LayerPicker() {
  const layer = useStore(s => s.layer)
  const setLayer = useStore(s => s.setLayer)
  const [open, setOpen] = useState(false)
  return (
    <nav className={`layer-picker glass ${open ? 'open' : ''}`} aria-label="圖層">
      <button className="layer-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="切換圖層">
        {LAYERS[layer].icon}
      </button>
      {LAYER_IDS.map(id => (
        <button key={id} className={`layer-btn ${id === layer ? 'on' : ''}`} aria-pressed={id === layer}
          onClick={() => { setLayer(id); setOpen(false) }}>
          <span>{LAYERS[id].icon}</span>
          <span>{LAYERS[id].label}</span>
        </button>
      ))}
    </nav>
  )
}
