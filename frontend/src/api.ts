import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { feature, mesh } from 'topojson-client'
import type { FeatureCollection, Geometry, MultiLineString } from 'geojson'
import type { Topology } from 'topojson-specification'
import type { ApiResponse, ForecastGrid, ImageOverlay, Observation, SatelliteOverlay, Town, TownForecast, Typhoon } from '../../shared/types'
import { radarOverlay, satelliteOverlay } from './lib/overlays'
import type { CloudMode } from './lib/clouds'
import type { CountyShapes } from './lib/geo'

const FIVE_MIN = 5 * 60_000
const TEN_MIN = 10 * 60_000
// 重投影後的 canvas 佔記憶體，切走圖層後不久即釋放
const CANVAS_GC = 60_000

async function get<T>(path: string): Promise<ApiResponse<T>> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

export const useObservations = () =>
  useQuery({ queryKey: ['observations'], queryFn: () => get<Observation[]>('/api/observations'), refetchInterval: FIVE_MIN })

export const useTowns = () =>
  useQuery({ queryKey: ['towns'], queryFn: () => get<Town[]>('/api/towns'), staleTime: Infinity })

export const useTownForecast = (town: string | null) =>
  useQuery({ queryKey: ['forecast', town], queryFn: () => get<TownForecast>(`/api/forecast?town=${encodeURIComponent(town!)}`), enabled: !!town })

const gridQuery = (time: string | null) => ({
  queryKey: ['grid', time],
  queryFn: () => get<ForecastGrid>(`/api/forecast-grid${time ? `?time=${encodeURIComponent(time)}` : ''}`),
})

export const useForecastGrid = (time: string | null) =>
  useQuery({
    ...gridQuery(time),
    placeholderData: keepPreviousData,
    // 時段清單定期刷新，已結束的時段才會從時間軸移除
    refetchInterval: time ? false : TEN_MIN,
  })

/** 播放時預先載入所有時段，動畫才不會停下來等資料 */
export function usePrefetchGrids(times: string[], enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (enabled) times.forEach(t => qc.prefetchQuery(gridQuery(t)))
  }, [qc, times, enabled])
}

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
    gcTime: CANVAS_GC,
  })

export const useSatellite = (enabled: boolean) =>
  useQuery({ queryKey: ['satellite'], queryFn: () => get<SatelliteOverlay>('/api/satellite'), enabled, refetchInterval: TEN_MIN })

export const useSatelliteClouds = (s: SatelliteOverlay | null, mode: CloudMode) =>
  useQuery({
    queryKey: ['satelliteClouds', s?.obsTime, mode],
    queryFn: () => satelliteOverlay(s!, mode),
    enabled: !!s,
    staleTime: Infinity,
    gcTime: CANVAS_GC,
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

/** 縣市界含海岸線；鄉鎮界只取相鄰鄉鎮之間的線，避免與縣市界重疊 */
export const useBoundaries = () =>
  useQuery({
    queryKey: ['boundaries'],
    staleTime: Infinity,
    queryFn: async () => {
      const topo = (await import('taiwan-atlas/towns-10t.json')).default as Topology
      const counties: MultiLineString = mesh(topo, topo.objects.counties as never)
      const towns: MultiLineString = mesh(topo, topo.objects.towns as never, (a, b) => a !== b)
      const countyShapes = feature(topo, topo.objects.counties) as unknown as CountyShapes
      return { counties, towns, countyShapes }
    },
  })

export const useTyphoons = (enabled: boolean) =>
  useQuery({ queryKey: ['typhoon'], queryFn: () => get<Typhoon[]>('/api/typhoon'), enabled, refetchInterval: TEN_MIN })
