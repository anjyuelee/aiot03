import { handle, json } from '../server/http.js'
import { getObservations } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getObservations()))
}
