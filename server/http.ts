import { seedExists } from './db.js'

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': status === 200 ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store',
      'x-seed-db': seedExists() ? 'present' : 'missing',
    },
  })
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    console.error(e)
    return json({ error: 'Internal server error' }, 500)
  }
}
