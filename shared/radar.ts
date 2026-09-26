import type { Bounds } from './types.js'

/** CWA 雷達色標：dBZ 0–65，每 1 dBZ 一色（https://www.cwa.gov.tw/V8/assets/img/radar/colorbar_n.png） */
export const RADAR_COLORS: [number, number, number][] = [
  [0, 255, 255], [0, 236, 255], [0, 218, 255], [0, 200, 255], [0, 182, 255], [0, 163, 255], [0, 145, 255], [0, 127, 255],
  [0, 109, 255], [0, 91, 255], [0, 72, 255], [0, 54, 255], [0, 36, 255], [0, 18, 255], [0, 0, 255],
  [0, 255, 0], [0, 244, 0], [0, 233, 0], [0, 222, 0], [0, 211, 0], [0, 200, 0], [0, 190, 0], [0, 180, 0], [0, 170, 0],
  [0, 160, 0], [0, 150, 0], [51, 171, 0], [102, 192, 0], [153, 213, 0], [204, 234, 0],
  [255, 255, 0], [255, 244, 0], [255, 233, 0], [255, 222, 0], [255, 211, 0], [255, 200, 0], [255, 184, 0], [255, 168, 0],
  [255, 152, 0], [255, 136, 0], [255, 120, 0], [255, 96, 0], [255, 72, 0], [255, 48, 0], [255, 24, 0],
  [255, 0, 0], [244, 0, 0], [233, 0, 0], [222, 0, 0], [211, 0, 0], [200, 0, 0], [190, 0, 0], [180, 0, 0], [170, 0, 0],
  [160, 0, 0], [150, 0, 0], [171, 0, 51], [192, 0, 102], [213, 0, 153], [234, 0, 204],
  [255, 0, 255], [234, 0, 255], [213, 0, 255], [192, 0, 255], [171, 0, 255], [150, 0, 255],
]

/** 負值（含 -99 無效值、-999 範圍外）不上色 */
export function radarColor(dbz: number): [number, number, number] | null {
  if (!(dbz >= 0)) return null
  return RADAR_COLORS[Math.min(RADAR_COLORS.length - 1, Math.floor(dbz))]
}

/** O-A0059-001 格點：左下角格點 115.0°E、18.0°N，每 0.0125° 一點 */
export const RADAR_GRID = { west: 115, south: 18, step: 0.0125, nx: 921, ny: 881 } as const

/** 以格點為中心往外推半格 */
export const RADAR_BOUNDS: Bounds = [
  RADAR_GRID.west - RADAR_GRID.step / 2,
  RADAR_GRID.south - RADAR_GRID.step / 2,
  RADAR_GRID.west + (RADAR_GRID.nx - 0.5) * RADAR_GRID.step,
  RADAR_GRID.south + (RADAR_GRID.ny - 0.5) * RADAR_GRID.step,
]
