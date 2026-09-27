import type { ScaleId } from './colorScale'

export type LayerId = 'temp' | 'wind' | 'rain' | 'humidity' | 'radar' | 'satellite' | 'typhoon' | 'warning' | 'quake' | 'admin'
export const LAYER_IDS: LayerId[] = ['temp', 'wind', 'rain', 'humidity', 'radar', 'satellite', 'typhoon', 'warning', 'quake', 'admin']

export interface LayerDef {
  label: string
  icon: string
  /** 有 72 小時預報時間軸 */
  timeline?: true
  now?: { field: 'temp' | 'humidity' | 'windSpeed' | 'rain1h'; scale: ScaleId }
  future?: { field: 'temp' | 'humidity' | 'windSpeed' | 'pop'; scale: ScaleId }
}

export const LAYERS: Record<LayerId, LayerDef> = {
  temp: { label: '溫度', icon: '🌡️', timeline: true, now: { field: 'temp', scale: 'temp' }, future: { field: 'temp', scale: 'temp' } },
  wind: { label: '風', icon: '💨', timeline: true, now: { field: 'windSpeed', scale: 'wind' }, future: { field: 'windSpeed', scale: 'wind' } },
  rain: { label: '雨量', icon: '🌧️', timeline: true, now: { field: 'rain1h', scale: 'rain1h' }, future: { field: 'pop', scale: 'pop' } },
  humidity: { label: '濕度', icon: '💧', timeline: true, now: { field: 'humidity', scale: 'humidity' }, future: { field: 'humidity', scale: 'humidity' } },
  radar: { label: '雷達', icon: '📡' },
  satellite: { label: '衛星', icon: '🛰️' },
  typhoon: { label: '颱風', icon: '🌀', timeline: true },
  warning: { label: '特報', icon: '⚠️' },
  quake: { label: '地震', icon: '🫨' },
  admin: { label: '行政區', icon: '🗺️' },
}

export const isLayerId = (s: unknown): s is LayerId => LAYER_IDS.includes(s as LayerId)
