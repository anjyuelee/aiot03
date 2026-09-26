import { RADAR_GRID } from '../shared/radar.js'
import { cwa, NotFoundError, type Fetcher } from './cwa/client.js'
import { json } from './http.js'
import { encodePng } from './png.js'
import { framePath, parseRadarGrid, radarRgba } from './radar.js'

// 歷史格點產生後不再變動；Vercel CDN 只看 s-maxage
const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable'

/** GET /api/radar-frame?t=YYYYMMDDHHmm：抓 CWA 歷史格點、上色成 PNG；格點維度不符時拋錯，交給 handle() 回 500 */
export async function radarFrameResponse(t: string | null, f: Fetcher = cwa): Promise<Response> {
  const path = t ? framePath(t) : null
  if (!path) return json({ error: 'Invalid t parameter' }, 400)
  let bytes: Uint8Array
  try {
    bytes = await f.historyData('O-A0059-001', path)
  } catch (e) {
    // 沒有這一格時短暫快取，避免一直重打 CWA
    if (e instanceof NotFoundError) {
      return Response.json({ error: 'Radar frame not found' }, { status: 404, headers: { 'cache-control': 'public, s-maxage=60' } })
    }
    console.error('radar frame fetch failed', e)
    return json({ error: 'Radar frame unavailable' }, 502)
  }
  const png = encodePng(RADAR_GRID.nx, RADAR_GRID.ny, radarRgba(parseRadarGrid(new TextDecoder().decode(bytes))))
  return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': IMMUTABLE } })
}
