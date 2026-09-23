import { handle, json } from '../server/http.js'
import { getTowns } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getTowns()))
}
