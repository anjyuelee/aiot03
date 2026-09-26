import { handle } from '../server/http.js'
import { radarFrameResponse } from '../server/radarFrame.js'

export async function GET(request: Request): Promise<Response> {
  return handle(() => radarFrameResponse(new URL(request.url).searchParams.get('t')))
}
