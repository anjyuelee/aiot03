/* eslint-disable @typescript-eslint/no-explicit-any -- CWA JSON is external, shapes verified by fixtures */
import type {
  Bounds, Earthquake, ForecastSlot, ImageKind, ImageOverlay, QuakeCounty, QuakeStation, Town, Typhoon, TyphoonFix, Warning, WarningText,
  WeekSlot,
} from '../../shared/types.js'

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
  const [west, east] = range(ds.GeoInfo.LongitudeRange)
  const [south, north] = range(ds.GeoInfo.LatitudeRange)
  const bounds: Bounds = [west, south, east, north]
  return { kind, url: ds.Resource.ProductURL, obsTime: ds.ObsTime.Datetime, bounds }
}

/** historyapi metadata → 最近 count 格的 DateTime（+08:00 ISO），由舊到新；重複的時間只留一筆，寫入時才不會撞 primary key */
export function parseRadarTimes(json: any, count = 19): string[] {
  const list: any[] = json.dataset?.resources?.resource?.data?.time ?? []
  const times = new Set(list.map(t => t.DateTime).filter((t): t is string => typeof t === 'string'))
  return [...times].sort().slice(-count)
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
      if (!Number.isFinite(h) || !f.InitialTime) return null
      return typhoonFix(f, addHours(f.InitialTime, h), h)
    }).filter(isFix),
  }))
}

/** CWA 縣市代碼是數字：直轄市 2 碼（63～68）右補零、其餘左補零，對齊 taiwan-atlas 的 5 碼 COUNTYCODE */
export function toCountyCode(geocode: unknown): string {
  const s = String(geocode)
  return s.length <= 2 ? s.padEnd(5, '0') : s.padStart(5, '0')
}

/** 特報時間可能是 `YYYY-MM-DD HH:mm:ss` 或 ISO，統一成 +08:00 ISO；空白或無法辨識為 null */
export function toTaipeiIso(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/.exec(s.trim())
  return m ? `${m[1]}T${m[2]}:${m[3] ?? '00'}+08:00` : null
}

export function parseWarnings(json: any): Warning[] {
  const out: Warning[] = []
  for (const loc of json.records?.location ?? []) {
    for (const h of loc.hazardConditions?.hazards ?? []) {
      const phenomena = h.info?.phenomena
      if (!phenomena) continue
      out.push({
        countyCode: toCountyCode(loc.geocode),
        county: loc.locationName,
        phenomena,
        significance: h.info?.significance || '特報',
        level: null,
        towns: null,
        start: toTaipeiIso(h.validTime?.startTime),
        end: toTaipeiIso(h.validTime?.endTime),
      })
    }
  }
  return out
}

/** 7 碼鄉鎮 geocode（Taiwan_Geocode_103）換成 5 碼縣市碼：直轄市以 6 開頭，只取前 2 碼；其他取前 5 碼 */
export function townCountyCode(geocode: string): string {
  return geocode.startsWith('6') ? geocode.slice(0, 2).padEnd(5, '0') : geocode.slice(0, 5)
}

// CWA 的巢狀節點只有一筆時可能不是陣列
const asList = (x: any): any[] => (x == null ? [] : Array.isArray(x) ? x : [x])

// CAP 資料集沒有新訊息時仍回傳最後一則，過期或解除的訊息都要濾掉
function activeInfos(json: any, now: string): any[] {
  return asList(json.records?.info).filter((i: any) =>
    i.urgency !== 'Past' && !String(i.headline ?? '').includes('解除') && Date.parse(i.expires) > Date.parse(now))
}

const HEAT_SIGNIFICANCE = '資訊'

/** W-C0033-005 高溫資訊：鄉鎮歸到縣市，每個縣市＋燈號一列 */
export function parseHeat(json: any, now: string): Warning[] {
  const rows = new Map<string, Warning>()
  for (const info of activeInfos(json, now)) {
    const event: string = info.event ?? '高溫'
    const severity: string | undefined = asList(info.parameter).find((p: any) => p.valueName === 'severity_level')?.value
    const level = (severity?.startsWith(event) ? severity.slice(event.length) : severity) || null
    for (const area of asList(info.area)) {
      const code = String(area.geocode?.value ?? '')
      const desc = String(area.areaDesc ?? '')
      if (!code || !desc) continue
      const countyCode = code.length === 7 ? townCountyCode(code) : toCountyCode(code)
      const key = `${countyCode} ${level}`
      const row = rows.get(key) ?? {
        countyCode, county: desc.slice(0, 3), phenomena: event, significance: HEAT_SIGNIFICANCE, level, towns: [],
        start: toTaipeiIso(info.onset), end: toTaipeiIso(info.expires),
      }
      // 縣市層級的地區代表整個縣市都在範圍內，之後不再列鄉鎮
      if (code.length !== 7) row.towns = null
      else row.towns?.push(desc.slice(3))
      rows.set(key, row)
    }
  }
  return [...rows.values()]
}

/** W-C0033-005 的說明與注意事項，當作高溫資訊的全文 */
export function parseHeatText(json: any, now: string): WarningText[] {
  const info = activeInfos(json, now)[0]
  if (!info) return []
  const text = [info.description, info.instruction].filter(Boolean).join('\n\n').trim()
  return text ? [{ kind: (info.event ?? '高溫') + HEAT_SIGNIFICANCE, issued: toTaipeiIso(info.effective), text }] : []
}

// 只取中文：有標語言時取 zh-TW，沒標的視為中文；contentText 不是字串時當作沒有全文，寧可不顯示也不顯示錯的內容
function zhText(record: any): string {
  const lang = record.datasetInfo?.datasetLanguage
  if (lang && lang !== 'zh-TW') return ''
  const list = asList(record.contents?.content)
  const content = list.find(c => c?.contentLanguage === 'zh-TW') ?? list.find(c => !c?.contentLanguage)
  return typeof content?.contentText === 'string' ? content.contentText.trim() : ''
}

/** W-C0033-002：每則特報的全文對應到它包含的每個種類；同一種類出現在多則時取發布時間最新者 */
export function parseWarningTexts(json: any): WarningText[] {
  const latest = new Map<string, WarningText>()
  for (const record of asList(json.records?.record)) {
    const text = zhText(record)
    if (!text) continue
    const issued = toTaipeiIso(record.datasetInfo?.issueTime)
    const hazards = record.hazardConditions?.hazards
    for (const h of asList(hazards?.hazard ?? hazards)) {
      const phenomena = h.info?.phenomena
      if (!phenomena) continue
      const kind = phenomena + (h.info.significance || '特報')
      const prev = latest.get(kind)
      if (!prev || (issued ?? '') > (prev.issued ?? '')) latest.set(kind, { kind, issued, text })
    }
  }
  return [...latest.values()]
}

function quakeStation(s: any): QuakeStation | null {
  const lat = num(s.StationLatitude)
  const lon = num(s.StationLongitude)
  if (lat == null || lon == null) return null
  return {
    id: String(s.StationID ?? ''), name: String(s.StationName ?? ''), lat, lon, intensity: String(s.SeismicIntensity ?? ''),
  }
}

const isStation = (s: QuakeStation | null): s is QuakeStation => s != null

/** 「最大震度N級地區」摘要沒有測站、內容與逐縣市項目重複，只取有測站的項目；字串欄位缺值時給空字串，前端才不會在渲染時出錯 */
function quakeCounties(areas: any[] | undefined): QuakeCounty[] {
  return (areas ?? []).filter(a => a.EqStation?.length).map(a => ({
    county: String(a.CountyName ?? ''),
    intensity: String(a.AreaIntensity ?? ''),
    stations: a.EqStation.map(quakeStation).filter(isStation),
  }))
}

/** 取括號內「位於…」的地名；沒有括號時用整串 */
function quakeLocation(s: unknown): string {
  const text = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return /[(（]位於(.+?)[)）]/.exec(text)?.[1] ?? text
}

/** numbered：顯著有感報告才有編號，小區域報告一律 115000，不保留 */
export function parseEarthquakes(json: any, numbered: boolean): Earthquake[] {
  const out: Earthquake[] = []
  for (const q of json.records?.Earthquake ?? []) {
    const info = q.EarthquakeInfo
    const time = toTaipeiIso(info?.OriginTime)
    const lat = num(info?.Epicenter?.EpicenterLatitude)
    const lon = num(info?.Epicenter?.EpicenterLongitude)
    const depth = num(info?.FocalDepth)
    const magnitude = num(info?.EarthquakeMagnitude?.MagnitudeValue)
    if (!time || lat == null || lon == null || depth == null || magnitude == null) continue
    out.push({
      id: time,
      no: numbered ? num(q.EarthquakeNo) : null,
      time, lat, lon, depth, magnitude,
      location: quakeLocation(info.Epicenter.Location),
      counties: quakeCounties(q.Intensity?.ShakingArea),
      web: String(q.Web ?? ''),
    })
  }
  return out
}
