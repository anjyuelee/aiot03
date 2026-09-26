import { RADAR_GRID, radarColor } from '../shared/radar.js'

/** +08:00 ISO → /api/radar-frame 的 t（YYYYMMDDHHmm，臺北時間） */
export const frameKey = (time: string) => time.slice(0, 16).replace(/\D/g, '')

/** t（YYYYMMDDHHmm，分鐘為 10 的倍數）→ historyapi getData 的路徑；格式或月日時分範圍不符回 null，不拿去打 CWA */
export function framePath(t: string): string | null {
  const m = /^(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])([0-5]0)$/.exec(t)
  return m ? `${m[1]}/${m[2]}/${m[3]}/${m[4]}/${m[5]}/00` : null
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]

/** O-A0059-001 XML → dBZ 陣列，順序同 CWA：由西向東、再由南往北 */
export function parseRadarGrid(xml: string, nx: number = RADAR_GRID.nx, ny: number = RADAR_GRID.ny): Float32Array {
  const dx = Number(tag(xml, 'GridDimensionX'))
  const dy = Number(tag(xml, 'GridDimensionY'))
  if (dx !== nx || dy !== ny) throw new Error(`Unexpected radar grid ${dx}x${dy}`)
  const content = tag(xml, 'content')
  if (content == null) throw new Error('Radar grid has no content')
  const parts = content.split(',')
  if (parts.length !== nx * ny) throw new Error(`Radar grid has ${parts.length} values, expected ${nx * ny}`)
  return Float32Array.from(parts, Number)
}

/** 上色成北在上的 RGBA；不上色的格子 alpha 0 */
export function radarRgba(values: Float32Array, nx: number = RADAR_GRID.nx, ny: number = RADAR_GRID.ny): Uint8Array {
  const out = new Uint8Array(nx * ny * 4)
  for (let j = 0; j < ny; j++) {
    const row = (ny - 1 - j) * nx
    for (let i = 0; i < nx; i++) {
      const c = radarColor(values[j * nx + i])
      if (!c) continue
      const p = (row + i) * 4
      out[p] = c[0]
      out[p + 1] = c[1]
      out[p + 2] = c[2]
      out[p + 3] = 255
    }
  }
  return out
}
