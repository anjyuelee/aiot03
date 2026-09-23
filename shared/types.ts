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

export interface ApiResponse<T> {
  data: T
  updatedAt: string | null
  stale: boolean
}
