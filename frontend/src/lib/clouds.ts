import { colorAt, type Stops } from './colorScale'

// 夜間陸地在紅外線約 110–150，門檻取在其上，避免陸地呈灰霧
const CLEAR = 130
const OPAQUE = 240

/** 紅外線灰階亮度 → 雲的不透明度：暖的地表/海面透明，冷的雲頂不透明 */
export const cloudAlpha = (luminance: number) =>
  Math.round(Math.min(1, Math.max(0, (luminance - CLEAR) / (OPAQUE - CLEAR))) * 255)

export type CloudMode = 'white' | 'enhanced'

/** 色調強化色表（紅外線亮度 → 顏色）：低雲半透明灰白，雲頂越高越冷依序藍、綠、黃、紅、紫 */
export const ENHANCED: Stops = [
  [CLEAR, '#d0d4dc00'], [175, '#d0d4dccc'],
  [185, '#74c0fc'], [200, '#1c7ed6'], [212, '#40c057'], [222, '#fcc419'], [232, '#fd7e14'], [242, '#e03131'], [255, '#be4bdb'],
]
export const enhancedColor = (luminance: number) => colorAt(ENHANCED, luminance)

// 逐像素查表比每次內插快
const ENHANCED_LUT = Array.from({ length: 256 }, (_, l) => enhancedColor(l))

/** 灰階衛星圖改成白色雲層或色調強化，底圖可從無雲處透出 */
export function styleClouds(canvas: HTMLCanvasElement, mode: CloudMode): void {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  for (let i = 0; i < px.length; i += 4) {
    // 灰階圖 R=G=B，取 R 當亮度；原圖固定半透明（alpha 128），直接覆寫
    const [r, g, b, a] = mode === 'enhanced' ? ENHANCED_LUT[px[i]] : [255, 255, 255, cloudAlpha(px[i])]
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }
  ctx.putImageData(img, 0, 0)
}
