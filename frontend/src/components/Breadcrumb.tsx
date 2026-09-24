import type { Map as MlMap } from 'maplibre-gl'
import { useBoundaries, useTowns } from '../api'
import { useStore } from '../store'
import { countyBounds, countyOf } from '../lib/geo'
import { FIT_PADDING, MAIN_ISLAND } from '../map/helpers'

/** 逐層選取的所在位置：全台 › 縣市 › 鄉鎮，點前一層可退回 */
export default function Breadcrumb({ map }: { map: MlMap | null }) {
  const county = useStore(s => s.county)
  const town = useStore(s => s.town)
  const selectCounty = useStore(s => s.selectCounty)
  const towns = useTowns().data?.data ?? []
  const counties = useBoundaries().data?.countyShapes
  if (!county) return null

  const countyName = towns.find(t => countyOf(t.id) === county)?.county
  const townName = town && towns.find(t => t.id === town)?.name

  const toTaiwan = () => {
    selectCounty(null)
    map?.fitBounds(MAIN_ISLAND, { padding: FIT_PADDING })
  }
  const toCounty = () => {
    selectCounty(county)
    const b = counties && countyBounds(counties, county)
    if (b) map?.fitBounds(b, { padding: FIT_PADDING, maxZoom: 11 })
  }

  return (
    <nav className="crumbs glass" aria-label="目前位置">
      <button onClick={toTaiwan}>← 全台</button>
      <span aria-hidden>›</span>
      {townName ? <button onClick={toCounty}>{countyName}</button> : <strong>{countyName}</strong>}
      {townName && <><span aria-hidden>›</span><strong>{townName}</strong></>}
    </nav>
  )
}
