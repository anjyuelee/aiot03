import { handle, json } from '../server/http.js'
import { getImageOverlay } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => {
    const result = await getImageOverlay('radar')
    return result ? json(result) : json({ error: 'Radar image unavailable' }, 503)
  })
}
