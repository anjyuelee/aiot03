import { handle, json } from '../server/http.js'
import { getSatelliteTilePng } from '../server/service.js'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return json({ error: 'Missing id parameter' }, 400)
    const png = getSatelliteTilePng(id)
    if (!png) return json({ error: 'Tile not found' }, 404)
    return new Response(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=600, s-maxage=600' },
    })
  })
}
