/* eslint-disable @typescript-eslint/no-explicit-any -- CWA JSON is external */
export interface Fetcher {
  dataset(id: string, params?: Record<string, string>): Promise<any>
  file(id: string): Promise<any>
  bytes(url: string): Promise<Uint8Array>
  historyMetadata(id: string, params: Record<string, string>): Promise<any>
  /** path 例：2026/09/26/11/30/00 */
  historyData(id: string, path: string): Promise<Uint8Array>
}

/** CWA 回 404：該時刻沒有資料 */
export class NotFoundError extends Error {}

const BASE = 'https://opendata.cwa.gov.tw'
const TIMEOUT_MS = 8000
const BYTES_TIMEOUT_MS = 20_000

function apiKey(): string {
  const key = process.env.CWA_API_KEY
  if (!key) throw new Error('CWA_API_KEY is not set')
  return key
}

const redact = (url: string) => url.replace(/Authorization=[^&]+/, 'Authorization=***')

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`CWA HTTP ${res.status} ${redact(url)}`)
  return res.json()
}

export const cwa: Fetcher = {
  async dataset(id, params = {}) {
    const q = new URLSearchParams({ Authorization: apiKey(), ...params })
    const json = await getJson(`${BASE}/api/v1/rest/datastore/${id}?${q}`)
    if (json.success !== 'true') throw new Error(`CWA ${id} returned success=${json.success}`)
    return json
  },
  // fileapi 會 302 轉址到 S3，fetch 預設會跟隨
  file(id) {
    const q = new URLSearchParams({ Authorization: apiKey(), format: 'JSON' })
    return getJson(`${BASE}/fileapi/v1/opendataapi/${id}?${q}`)
  },
  // S3 上的公開檔案，不需要授權碼
  async bytes(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(BYTES_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`CWA HTTP ${res.status} ${url}`)
    return new Uint8Array(await res.arrayBuffer())
  },
  historyMetadata(id, params) {
    const q = new URLSearchParams({ Authorization: apiKey(), format: 'JSON', ...params })
    return getJson(`${BASE}/historyapi/v1/getMetadata/${id}?${q}`)
  },
  // getData 會 302 轉址到 S3 的公開檔案
  async historyData(id, path) {
    const url = `${BASE}/historyapi/v1/getData/${id}/${path}?${new URLSearchParams({ Authorization: apiKey() })}`
    const res = await fetch(url, { signal: AbortSignal.timeout(BYTES_TIMEOUT_MS) })
    if (res.status === 404) throw new NotFoundError(`CWA ${id} has no ${path}`)
    if (!res.ok) throw new Error(`CWA HTTP ${res.status} ${redact(url)}`)
    return new Uint8Array(await res.arrayBuffer())
  },
}
