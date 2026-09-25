import type { StyleSpecification } from 'maplibre-gl'
import darkThumb from '../assets/basemap-dark.jpg'
import lightThumb from '../assets/basemap-light.jpg'
import streetsThumb from '../assets/basemap-streets.jpg'
import satelliteThumb from '../assets/basemap-satellite.jpg'
import terrainThumb from '../assets/basemap-terrain.jpg'

export type BasemapId = 'dark' | 'light' | 'streets' | 'satellite' | 'terrain'
export const BASEMAP_IDS: BasemapId[] = ['dark', 'light', 'streets', 'satellite', 'terrain']

const CARTO = 'https://basemaps.cartocdn.com/gl'
const GLYPHS = 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf'

export interface Basemap {
  label: string
  /** 底圖是深色時，疊在上面的線條與粒子用白色，否則改用深灰 */
  dark: boolean
  /** 預先截好的台灣縮圖；CARTO 的點陣圖磚已需要金鑰，不能直接拿來當縮圖 */
  thumb: string
  style: () => Promise<string | StyleSpecification>
}

/** 衛星影像上只保留深色底圖的地名標籤，資料圖層才能照常插在文字之下 */
async function satelliteStyle(): Promise<StyleSpecification> {
  const labels = (await (await fetch(`${CARTO}/dark-matter-gl-style/style.json`)).json()) as StyleSpecification
  return {
    ...labels,
    sources: {
      ...labels.sources,
      // 全球用 Sentinel-2 無雲影像，台灣本島再疊國土測繪中心的高解析正射影像
      s2: { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 15,
        attribution: 'Sentinel-2 cloudless 2020 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)' },
      nlsc: { type: 'raster', tiles: ['https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}'], tileSize: 256, minzoom: 7, maxzoom: 19,
        bounds: [118, 21.5, 122.5, 26.5], attribution: '內政部國土測繪中心' },
    },
    layers: [
      { id: 's2', type: 'raster', source: 's2' },
      { id: 'nlsc', type: 'raster', source: 'nlsc' },
      ...labels.layers.filter(l => l.type === 'symbol'),
    ],
  }
}

const terrainStyle = async (): Promise<StyleSpecification> => ({
  version: 8,
  glyphs: GLYPHS,
  sources: {
    topo: { type: 'raster', tiles: ['a', 'b', 'c'].map(s => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`), tileSize: 256, maxzoom: 17,
      attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)' },
  },
  layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
})

export const BASEMAPS: Record<BasemapId, Basemap> = {
  dark: { label: '深色', dark: true, thumb: darkThumb,
    style: async () => `${CARTO}/dark-matter-gl-style/style.json` },
  light: { label: '淺色', dark: false, thumb: lightThumb,
    style: async () => `${CARTO}/positron-gl-style/style.json` },
  streets: { label: '街道', dark: false, thumb: streetsThumb,
    style: async () => `${CARTO}/voyager-gl-style/style.json` },
  satellite: { label: '衛星', dark: true, thumb: satelliteThumb,
    style: satelliteStyle },
  terrain: { label: '地形', dark: false, thumb: terrainThumb, style: terrainStyle },
}

/** 疊在底圖上的線條顏色 */
export const inkOf = (id: BasemapId) => BASEMAPS[id].dark ? '#ffffff' : '#1f2937'
