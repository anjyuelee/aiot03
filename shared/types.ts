export type Bounds = [west: number, south: number, east: number, north: number]

export interface Observation {
  stationId: string
  name: string
  lat: number
  lon: number
  obsTime: string
  temp: number | null
  humidity: number | null
  windSpeed: number | null
  windDir: number | null
  rain1h: number | null
  rain24h: number | null
}

export interface Town {
  id: string
  name: string
  county: string
  lat: number
  lon: number
}

export interface ForecastSlot {
  start: string
  temp: number | null
  pop: number | null
  humidity: number | null
  windSpeed: number | null
  windDir: string | null
  wx: string | null
  wxCode: string | null
}

export interface WeekSlot {
  start: string
  end: string
  minTemp: number | null
  maxTemp: number | null
  pop: number | null
  wx: string | null
  wxCode: string | null
}

export interface TownForecast {
  town: Town
  hourly3: ForecastSlot[]
  week: WeekSlot[]
}

export interface GridCell {
  townId: string
  temp: number | null
  pop: number | null
  humidity: number | null
  windSpeed: number | null
}

export interface ForecastGrid {
  times: string[]
  time: string | null
  cells: GridCell[]
}

export type ImageKind = 'radar' | 'satellite'

export interface ImageOverlay {
  kind: ImageKind
  url: string
  obsTime: string
  bounds: Bounds
}

export interface SatelliteOverlay {
  obsTime: string
  tiles: { url: string; bounds: Bounds }[]
}

export interface ApiResponse<T> {
  data: T
  updatedAt: string | null
  stale: boolean
}

export interface TyphoonFix {
  /** 過去點為觀測時間；預測點為 InitialTime + ForecastHour，皆為 +08:00 ISO 字串 */
  time: string
  /** 過去點為 null */
  forecastHour: number | null
  lat: number
  lon: number
  pressure: number | null
  maxWind: number | null
  maxGust: number | null
  moveDir: string | null
  moveSpeed: number | null
  /** 七級風暴風半徑（km）；有象限半徑時取四象限最大值 */
  radius15ms: number | null
  /** 70% 機率半徑（km），僅預測點 */
  radius70: number | null
}

export interface Typhoon {
  id: string
  name: string
  nameEn: string | null
  past: TyphoonFix[]
  forecast: TyphoonFix[]
}

export interface Warning {
  /** 5 碼，對應 taiwan-atlas COUNTYCODE */
  countyCode: string
  county: string
  /** 例：大雨、豪雨、陸上強風 */
  phenomena: string
  /** 例：特報、警報 */
  significance: string
  /** +08:00 ISO；CWA 未提供時為 null */
  start: string | null
  end: string | null
}
