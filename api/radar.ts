import { handle, json } from '../server/http.js'
import { getRadar } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => {
    const result = await getRadar()
    return result ? json(result) : json({ error: 'Radar frames unavailable' }, 503)
  })
}
