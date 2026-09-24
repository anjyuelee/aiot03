import type { ScaleId } from './colorScale'

export type LayerId = 'temp' | 'wind' | 'rain' | 'humidity' | 'radar' | 'satellite' | 'typhoon' | 'admin'
export const LAYER_IDS: LayerId[] = ['temp', 'wind', 'rain', 'humidity', 'radar', 'satellite', 'typhoon', 'admin']

export interface LayerDef {
  label: string
  icon: string
  now?: { field: 'temp' | 'humidity' | 'windSpeed' | 'rain1h'; scale: ScaleId }
  future?: { field: 'temp' | 'humidity' | 'windSpeed' | 'pop'; scale: ScaleId }
}

export const LAYERS: Record<LayerId, LayerDef> = {
  temp: { label: '溫度', icon: '🌡️', now: { field: 'temp', scale: 'temp' }, future: { field: 'temp', scale: 'temp' } },
  wind: { label: '風', icon: '💨', now: { field: 'windSpeed', scale: 'wind' }, future: { field: 'windSpeed', scale: 'wind' } },
  rain: { label: '雨量', icon: '🌧️', now: { field: 'rain1h', scale: 'rain1h' }, future: { field: 'pop', scale: 'pop' } },
  humidity: { label: '濕度', icon: '💧', now: { field: 'humidity', scale: 'humidity' }, future: { field: 'humidity', scale: 'humidity' } },
  radar: { label: '雷達', icon: '📡' },
  satellite: { label: '衛星', icon: '🛰️' },
  typhoon: { label: '颱風', icon: '🌀' },
  admin: { label: '行政區', icon: '🗺️' },
}

export const isLayerId = (s: unknown): s is LayerId => LAYER_IDS.includes(s as LayerId)
