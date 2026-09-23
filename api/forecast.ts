import { handle, json } from '../server/http.js'
import { getForecast } from '../server/service.js'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const town = new URL(request.url).searchParams.get('town')
    if (!town) return json({ error: 'Missing town parameter' }, 400)
    const result = await getForecast(town)
    return result ? json(result) : json({ error: 'Town not found' }, 404)
  })
}
