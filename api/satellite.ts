import { handle, json } from '../server/http.js'
import { getSatellite } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => {
    const result = await getSatellite()
    return result ? json(result) : json({ error: 'Satellite image unavailable' }, 503)
  })
}
