import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Popup, type Map as MlMap } from 'maplibre-gl'
import { useForecastGrid, useFutureTimes, useObservations, useRadar, useTowns } from '../api'
import { useStore } from '../store'
import { LAYERS, type LayerId } from '../lib/layers'
import { PHONE, dbzOfPixel, formatProbe, obsValueAt, probeAnchor, probeMaxWidth, radarPixel, townValue, type FutureField, type NowField, type Probe } from '../lib/probe'
import { useRadarFrame } from '../map/useRadarFrame'

const show = (field: NowField | FutureField, v: number | null) => (v == null ? '無資料' : formatProbe(field, v))

/** 現在：附近測站 IDW 推估；未來時段：點到的鄉鎮預報。依整數時段 t 取值，停住時一定是實際的值 */
function FieldReading({ probe, layer }: { probe: Probe; layer: LayerId }) {
  const t = useStore(s => s.t)
  const def = LAYERS[layer]
  const obs = useObservations()
  const times = useFutureTimes()
  const future = t >= 1 && def.future ? def.future : null
  const time = future ? times[t - 1] ?? null : null
  const grid = useForecastGrid(time)
  const towns = useTowns().data?.data

  if (future) {
    const name = towns?.find(x => x.id === probe.town)?.name
    const g = grid.data?.data
    // keepPreviousData 會先給上一個時段的格點，時段對上才顯示
    const value = grid.isError ? '無資料'
      : !time || g?.time !== time ? '…'
      : show(future.field, townValue(g.cells, probe.town, future.field))
    return <Reading value={value} source={name ? `${name}預報` : '鄉鎮預報'} />
  }
  const field = def.now!.field
  const value = obs.isError ? '無資料' : !obs.data ? '…' : show(field, obsValueAt(obs.data.data, field, probe.lon, probe.lat))
  return <Reading value={value} source="附近測站推估" />
}

/** 讀雷達圖層目前顯示那一格的像素 */
function RadarReading({ probe }: { probe: Probe }) {
  const radar = useRadar(true)
  const frame = useRadarFrame()
  let value = radar.isError ? '無資料' : '…'
  if (frame) {
    const { canvas, bounds } = frame
    const px = radarPixel(bounds, canvas.width, canvas.height, probe.lon, probe.lat)
    const dbz = px && dbzOfPixel(canvas.getContext('2d')!.getImageData(px[0], px[1], 1, 1).data)
    value = !px ? '無資料' : dbz == null ? '無回波' : formatProbe('dbz', dbz)
  }
  return <Reading value={value} source="雷達回波" />
}

const Reading = ({ value, source }: { value: string; source: string }) => (
  <>
    <strong>{value}</strong>
    <span className="muted">{source}</span>
  </>
)

/** 點查泡泡：MapLibre popup 固定在點的位置，內容以 portal 放入，時間軸移動時只重繪內容 */
export default function ProbeBubble({ map }: { map: MlMap }) {
  const probe = useStore(s => s.probe)
  const layer = useStore(s => s.layer)
  const setProbe = useStore(s => s.setProbe)
  const [el] = useState(() => document.createElement('div'))

  // popup 掛在地圖容器、不在 canvas 容器內，點泡泡不會觸發地圖點擊。
  // 地圖移動後（例如點縣市時縮放過去）重新決定位置：手機點換到畫面另一半就換邊、寬度限制在那一側剩下的空間，
  // 桌機點太靠近頂端就改放到點的下方，才不會超出畫面
  useEffect(() => {
    if (!probe) return
    let popup: Popup | null = null
    let anchor: string | null = null
    const place = () => {
      const { x, y } = map.project([probe.lon, probe.lat])
      const width = map.getContainer().clientWidth
      const next = probeAnchor(x, y, width, matchMedia(PHONE).matches)
      el.style.maxWidth = next === 'left' || next === 'right' ? `${probeMaxWidth(x, width, next)}px` : ''
      if (next === anchor) return
      anchor = next
      popup?.remove()
      popup = new Popup({ anchor: next, offset: 8, closeButton: false, closeOnClick: false, className: 'probe-popup' })
        .setLngLat([probe.lon, probe.lat]).setDOMContent(el).addTo(map)
    }
    place()
    map.on('moveend', place)
    return () => {
      map.off('moveend', place)
      popup?.remove()
    }
  }, [map, probe, el])

  if (!probe) return null
  return createPortal(
    <div className="probe">
      {layer === 'radar' ? <RadarReading probe={probe} /> : <FieldReading probe={probe} layer={layer} />}
      <button className="close" onClick={() => setProbe(null)} aria-label="關閉點查">✕</button>
    </div>,
    el,
  )
}
