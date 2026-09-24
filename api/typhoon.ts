import { handle, json } from '../server/http.js'
import { getTyphoons } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => json(await getTyphoons()))
}
