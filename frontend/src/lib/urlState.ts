import { isLayerId, type LayerId } from './layers'

export interface UrlState { layer: LayerId; t: number; town: string | null }

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search)
  const layer = p.get('layer')
  return {
    layer: isLayerId(layer) ? layer : 'temp',
    t: Math.max(0, parseInt(p.get('t') ?? '0', 10) || 0),
    town: p.get('town'),
  }
}

export function toSearch({ layer, t, town }: UrlState): string {
  const p = new URLSearchParams({ layer })
  if (t) p.set('t', String(t))
  if (town) p.set('town', town)
  return `?${p}`
}
