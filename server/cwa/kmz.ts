import { strFromU8, unzipSync } from 'fflate'
import type { Bounds } from '../../shared/types.js'

export interface SatelliteTileRow { id: string; png: Uint8Array; bounds: Bounds }

const edge = (box: string, tag: string) => Number(box.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))![1])

/** KMZ super-overlay 的每個圖塊是 L/x/y.png，範圍寫在同名 KML 的 GroundOverlay LatLonBox */
export function parseSatelliteKmz(zip: Uint8Array, level = 2): SatelliteTileRow[] {
  const files = unzipSync(zip, { filter: f => f.name.startsWith(`${level}/`) })
  return Object.keys(files)
    .filter(name => name.endsWith('.png') && files[name.replace(/\.png$/, '.kml')])
    .sort()
    .map(name => {
      const id = name.replace(/\.png$/, '')
      const box = strFromU8(files[`${id}.kml`]).match(/<LatLonBox>([\s\S]*?)<\/LatLonBox>/)![1]
      return { id, png: files[name], bounds: [edge(box, 'west'), edge(box, 'south'), edge(box, 'east'), edge(box, 'north')] }
    })
}
