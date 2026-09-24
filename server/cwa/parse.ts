/* eslint-disable @typescript-eslint/no-explicit-any -- CWA JSON is external, shapes verified by fixtures */
import type { Bounds, ForecastSlot, ImageKind, ImageOverlay, Town, Typhoon, TyphoonFix, WeekSlot } from '../../shared/types.js'

export interface StationRow { id: string; name: string; county: string; town: string; lat: number; lon: number }
export interface WeatherObsRow { stationId: string; obsTime: string; temp: number | null; humidity: number | null; windSpeed: number | null; windDir: number | null }
export interface RainObsRow { stationId: string; obsTime: string; rain1h: number | null; rain24h: number | null }
export interface Slot3hRow extends ForecastSlot { townId: string }
export interface WeekRow extends WeekSlot { townId: string }

/** CWA 以 -99、-999 等表示缺值；空字串或非數字也視為缺值。 */
export function num(v: unknown): number | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  if (typeof v === 'string' && v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > -90 ? n : null
}

function stationRow(s: any): StationRow | null {
  const c = s.GeoInfo.Coordinates.find((x: any) => x.CoordinateName === 'WGS84')
  const lat = num(c?.StationLatitude)
  const lon = num(c?.StationLongitude)
  if (lat == null || lon == null) return null
  return { id: s.StationId, name: s.StationName, county: s.GeoInfo.CountyName, town: s.GeoInfo.TownName, lat, lon }
}

export function parseWeatherStations(json: any): { stations: StationRow[]; obs: WeatherObsRow[] } {
  const stations: StationRow[] = []
  const obs: WeatherObsRow[] = []
  for (const s of json.records.Station) {
    const st = stationRow(s)
    if (!st) continue
    const w = s.WeatherElement
    stations.push(st)
    obs.push({
      stationId: s.StationId,
      obsTime: s.ObsTime.DateTime,
      temp: num(w.AirTemperature),
      humidity: num(w.RelativeHumidity),
      windSpeed: num(w.WindSpeed),
      windDir: num(w.WindDirection),
    })
  }
  return { stations, obs }
}

export function parseRainStations(json: any): { stations: StationRow[]; obs: RainObsRow[] } {
  const stations: StationRow[] = []
  const obs: RainObsRow[] = []
  for (const s of json.records.Station) {
    const st = stationRow(s)
    if (!st) continue
    const r = s.RainfallElement
    stations.push(st)
    obs.push({
      stationId: s.StationId,
      obsTime: s.ObsTime.DateTime,
      rain1h: num(r.Past1hr?.Precipitation),
      rain24h: num(r.Past24hr?.Precipitation),
    })
  }
  return { stations, obs }
}

type CwaTime = { DataTime?: string; StartTime?: string; EndTime?: string; ElementValue: Record<string, string>[] }

function elements(loc: any): Map<string, CwaTime[]> {
  return new Map(loc.WeatherElement.map((e: any) => [e.ElementName, e.Time]))
}

function valueAt(times: CwaTime[] | undefined, start: string, key: string): string | undefined {
  return times?.find(t => (t.DataTime ?? t.StartTime) === start)?.ElementValue[0]?.[key]
}

function* locations(json: any): Generator<{ county: string; loc: any }> {
  for (const group of json.records.Locations) {
    for (const loc of group.Location) yield { county: group.LocationsName, loc }
  }
}

export function parseForecast3h(json: any): { towns: Town[]; slots: Slot3hRow[] } {
  const towns: Town[] = []
  const slots: Slot3hRow[] = []
  for (const { county, loc } of locations(json)) {
    const lat = num(loc.Latitude)
    const lon = num(loc.Longitude)
    if (lat == null || lon == null) continue
    const townId: string = loc.Geocode
    towns.push({ id: townId, name: loc.LocationName, county, lat, lon })
    const el = elements(loc)
    for (const p of el.get('3小時降雨機率') ?? []) {
      const start = p.StartTime!
      slots.push({
        townId,
        start,
        temp: num(valueAt(el.get('溫度'), start, 'Temperature')),
        pop: num(p.ElementValue[0]?.ProbabilityOfPrecipitation),
        humidity: num(valueAt(el.get('相對濕度'), start, 'RelativeHumidity')),
        windSpeed: num(valueAt(el.get('風速'), start, 'WindSpeed')),
        windDir: valueAt(el.get('風向'), start, 'WindDirection') ?? null,
        wx: valueAt(el.get('天氣現象'), start, 'Weather') ?? null,
        wxCode: valueAt(el.get('天氣現象'), start, 'WeatherCode') ?? null,
      })
    }
  }
  return { towns, slots }
}

export function parseForecastWeek(json: any): { slots: WeekRow[] } {
  const slots: WeekRow[] = []
  for (const { loc } of locations(json)) {
    const el = elements(loc)
    for (const w of el.get('天氣現象') ?? []) {
      const start = w.StartTime!
      slots.push({
        townId: loc.Geocode,
        start,
        end: w.EndTime!,
        minTemp: num(valueAt(el.get('最低溫度'), start, 'MinTemperature')),
        maxTemp: num(valueAt(el.get('最高溫度'), start, 'MaxTemperature')),
        pop: num(valueAt(el.get('12小時降雨機率'), start, 'ProbabilityOfPrecipitation')),
        wx: w.ElementValue[0]?.Weather ?? null,
        wxCode: w.ElementValue[0]?.WeatherCode ?? null,
      })
    }
  }
  return { slots }
}

const RANGE = /^(-?[\d.]+)-(-?[\d.]+)$/

function range(s: string): [number, number] {
  const m = RANGE.exec(s.trim())
  if (!m) throw new Error(`Unexpected range: ${s}`)
  return [Number(m[1]), Number(m[2])]
}

export function parseImage(json: any, kind: ImageKind): ImageOverlay {
  const ds = json.cwaopendata.dataset
  const geo = kind === 'radar' ? ds.datasetInfo.parameterSet : ds.GeoInfo
  const [west, east] = range(geo.LongitudeRange)
  const [south, north] = range(geo.LatitudeRange)
  const bounds: Bounds = [west, south, east, north]
  return kind === 'radar'
    ? { kind, url: ds.resource.ProductURL, obsTime: ds.DateTime, bounds }
    : { kind, url: ds.Resource.ProductURL, obsTime: ds.ObsTime.Datetime, bounds }
}

const HOUR = 3600_000
const TAIPEI = 8 * HOUR

/** 以 +08:00 表示，與 CWA 其他時間欄位格式一致 */
function addHours(iso: string, h: number): string {
  return new Date(Date.parse(iso) + h * HOUR + TAIPEI).toISOString().slice(0, 19) + '+08:00'
}

function radius15(c: any): number | null {
  const quads: number[] = (c?.QuadrantRadii?.Radius ?? []).map((r: any) => num(r.value)).filter((n: number | null) => n != null)
  return quads.length ? Math.max(...quads) : num(c?.Radius)
}

function typhoonFix(f: any, time: string, forecastHour: number | null): TyphoonFix | null {
  const lat = num(f.CoordinateLatitude)
  const lon = num(f.CoordinateLongitude)
  if (lat == null || lon == null) return null
  return {
    time, forecastHour, lat, lon,
    pressure: num(f.Pressure),
    maxWind: num(f.MaxWindSpeed),
    maxGust: num(f.MaxGustSpeed),
    moveDir: f.MovingDirection || null,
    moveSpeed: num(f.MovingSpeed),
    radius15ms: radius15(f.Circle15ms),
    radius70: num(f.Radius70PercentProbability),
  }
}

const isFix = (f: TyphoonFix | null): f is TyphoonFix => f != null

export function parseTyphoons(json: any): Typhoon[] {
  return (json.records?.TropicalCyclones?.TropicalCyclone ?? []).map((t: any): Typhoon => ({
    id: `${t.Year}-${t.CwaTdNo}`,
    name: t.CwaTyphoonName || `熱帶性低氣壓 TD${t.CwaTdNo}`,
    nameEn: t.TyphoonName || null,
    past: (t.AnalysisData?.Fix ?? []).map((f: any) => typhoonFix(f, f.DateTime, null)).filter(isFix),
    forecast: (t.ForecastData?.Fix ?? []).map((f: any) => {
      const h = Number(f.ForecastHour)
      return typhoonFix(f, addHours(f.InitialTime, h), h)
    }).filter(isFix),
  }))
}
