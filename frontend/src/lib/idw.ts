export interface ValuePoint { lon: number; lat: number; v: number }

/** 反距離權重（power 2）內插；距離所有測站超過 maxDist（度）的格點為 NaN。回傳 row-major（lats × lons）。 */
export function idwGrid(points: ValuePoint[], lons: number[], lats: number[], maxDist: number): Float32Array {
  const out = new Float32Array(lons.length * lats.length)
  const max2 = maxDist * maxDist
  for (let j = 0; j < lats.length; j++) {
    const lat = lats[j]
    const k = Math.cos((lat * Math.PI) / 180)
    for (let i = 0; i < lons.length; i++) {
      let num = 0
      let den = 0
      let min2 = Infinity
      let exact: number | null = null
      for (const p of points) {
        const dx = (lons[i] - p.lon) * k
        const dy = lat - p.lat
        const d2 = dx * dx + dy * dy
        if (d2 < 1e-12) { exact = p.v; break }
        if (d2 < min2) min2 = d2
        num += p.v / d2
        den += 1 / d2
      }
      out[j * lons.length + i] = exact ?? (min2 > max2 ? NaN : num / den)
    }
  }
  return out
}
