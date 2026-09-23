// 夜間陸地在紅外線約 110–150，門檻取在其上，避免陸地呈灰霧
const CLEAR = 130
const OPAQUE = 240

/** 紅外線灰階亮度 → 雲的不透明度：暖的地表/海面透明，冷的雲頂不透明 */
export const cloudAlpha = (luminance: number) =>
  Math.round(Math.min(1, Math.max(0, (luminance - CLEAR) / (OPAQUE - CLEAR))) * 255)

/** 把灰階衛星圖改成白色雲層，底圖可從無雲處透出 */
export function whitenClouds(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = img.data
  for (let i = 0; i < px.length; i += 4) {
    // 灰階圖 R=G=B，取 R 當亮度；原圖固定半透明（alpha 128），直接覆寫
    px[i + 3] = cloudAlpha(px[i])
    px[i] = px[i + 1] = px[i + 2] = 255
  }
  ctx.putImageData(img, 0, 0)
}
