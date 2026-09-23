import { seedExists } from './db.js'

function cacheControl(body: unknown, status: number): string {
  if (status !== 200) return 'no-store'
  const stale = typeof body === 'object' && body !== null && (body as { stale?: unknown }).stale === true
  return stale ? 'public, s-maxage=30' : 'public, s-maxage=300, stale-while-revalidate=600'
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': cacheControl(body, status),
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
