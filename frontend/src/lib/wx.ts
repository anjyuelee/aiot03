/** CWA 天氣現象代碼 → 圖示 */
export function wxIcon(code: string | null | undefined): string {
  if (!code) return ''
  const n = Number(code)
  if (n === 1) return '☀️'
  if (n <= 3) return '🌤️'
  if (n <= 7) return '☁️'
  if ((n >= 15 && n <= 18) || n === 21 || n === 22 || (n >= 33 && n <= 36) || n === 41) return '⛈️'
  if (n >= 24 && n <= 28) return '🌫️'
  if (n === 42) return '🌨️'
  return '🌧️'
}
