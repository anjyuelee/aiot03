export type ScaleId = 'temp' | 'wind' | 'rain1h' | 'pop' | 'humidity'
export type Stops = [number, string][]
export type RGBA = [number, number, number, number]

export const SCALES: Record<ScaleId, { unit: string; stops: Stops }> = {
  temp: { unit: '°C', stops: [[0, '#5e4fa2'], [8, '#3288bd'], [14, '#66c2a5'], [20, '#abdda4'], [24, '#e6f598'], [28, '#fee08b'], [32, '#fdae61'], [35, '#f46d43'], [38, '#d53e4f']] },
  wind: { unit: 'm/s', stops: [[0, '#3d4a8a'], [2, '#3288bd'], [4, '#66c2a5'], [6, '#abdda4'], [8, '#fee08b'], [11, '#fdae61'], [14, '#f46d43'], [18, '#d53e4f']] },
  rain1h: { unit: 'mm/h', stops: [[0, '#00000000'], [0.5, '#a5d8ff'], [2, '#4dabf7'], [5, '#1c7ed6'], [10, '#5f3dc4'], [20, '#c2255c'], [40, '#e8590c']] },
  pop: { unit: '% 降雨機率', stops: [[0, '#00000000'], [20, '#a5d8ff'], [50, '#4dabf7'], [80, '#1c7ed6'], [100, '#5f3dc4']] },
  humidity: { unit: '%', stops: [[30, '#e8590c'], [50, '#fcc419'], [70, '#69db7c'], [85, '#22b8cf'], [100, '#1864ab']] },
}

export function parseHex(hex: string): RGBA {
  const h = hex.slice(1)
  const at = (i: number) => parseInt(h.slice(i, i + 2), 16)
  return [at(0), at(2), at(4), h.length === 8 ? at(6) : 255]
}

export function colorAt(stops: Stops, v: number): RGBA {
  if (v <= stops[0][0]) return parseHex(stops[0][1])
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i]
    if (v <= v1) {
      const [v0, c0] = stops[i - 1]
      const t = (v - v0) / (v1 - v0)
      const a = parseHex(c0)
      const b = parseHex(c1)
      return a.map((x, k) => Math.round(x + (b[k] - x) * t)) as RGBA
    }
  }
  return parseHex(stops[stops.length - 1][1])
}

export const toCss = ([r, g, b, a]: RGBA) => `rgba(${r},${g},${b},${+(a / 255).toFixed(3)})`

export function gradientCss(stops: Stops): string {
  const lo = stops[0][0]
  const hi = stops[stops.length - 1][0]
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `${toCss(parseHex(c))} ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`
}

export const fillColorExpr = (stops: Stops): unknown[] =>
  ['interpolate', ['linear'], ['get', 'value'], ...stops.flatMap(([v, c]) => [v, toCss(parseHex(c))])]
