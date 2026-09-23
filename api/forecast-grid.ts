import { handle, json } from '../server/http.js'
import { getForecastGrid } from '../server/service.js'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => json(await getForecastGrid(new URL(request.url).searchParams.get('time'))))
}
