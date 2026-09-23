import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import type { Topology } from 'topojson-specification'
import type { ApiResponse, ForecastGrid, ImageOverlay, Observation, SatelliteOverlay, Town, TownForecast } from '../../shared/types'
import { radarOverlay, satelliteOverlay } from './lib/overlays'

const TEN_MIN = 10 * 60_000

async function get<T>(path: string): Promise<ApiResponse<T>> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

export const useObservations = () =>
  useQuery({ queryKey: ['observations'], queryFn: () => get<Observation[]>('/api/observations'), refetchInterval: TEN_MIN })

export const useTowns = () =>
  useQuery({ queryKey: ['towns'], queryFn: () => get<Town[]>('/api/towns'), staleTime: Infinity })

export const useTownForecast = (town: string | null) =>
  useQuery({ queryKey: ['forecast', town], queryFn: () => get<TownForecast>(`/api/forecast?town=${town}`), enabled: !!town })

export const useForecastGrid = (time: string | null) =>
  useQuery({
    queryKey: ['grid', time],
    queryFn: () => get<ForecastGrid>(`/api/forecast-grid${time ? `?time=${encodeURIComponent(time)}` : ''}`),
    placeholderData: keepPreviousData,
  })

/** 尚未結束的 3 小時時段，最多 24 格（72 小時） */
export function useFutureTimes(): string[] {
  const { data } = useForecastGrid(null)
  return useMemo(
    () => (data?.data.times ?? []).filter(t => Date.parse(t) + 3 * 3600_000 > Date.now()).slice(0, 24),
    [data],
  )
}

export const useOverlay = (kind: 'radar' | null) =>
  useQuery({ queryKey: ['overlay', kind], queryFn: () => get<ImageOverlay>(`/api/${kind}`), enabled: !!kind, refetchInterval: TEN_MIN })

export const useReprojected = (o: ImageOverlay | null) =>
  useQuery({
    queryKey: ['reprojected', o?.url, o?.obsTime],
    queryFn: () => radarOverlay(o!),
    enabled: !!o,
    staleTime: Infinity,
  })

export const useSatellite = (enabled: boolean) =>
  useQuery({ queryKey: ['satellite'], queryFn: () => get<SatelliteOverlay>('/api/satellite'), enabled, refetchInterval: TEN_MIN })

export const useSatelliteClouds = (s: SatelliteOverlay | null) =>
  useQuery({
    queryKey: ['satelliteClouds', s?.obsTime],
    queryFn: () => satelliteOverlay(s!),
    enabled: !!s,
    staleTime: Infinity,
  })

export type TownShapes = FeatureCollection<Geometry, { TOWNCODE: string }>

export const useTownShapes = () =>
  useQuery({
    queryKey: ['townShapes'],
    staleTime: Infinity,
    queryFn: async () => {
      const topo = (await import('taiwan-atlas/towns-10t.json')).default as Topology
      return feature(topo, topo.objects.towns) as unknown as TownShapes
    },
  })
