// Minimal JSON-over-fetch helper for the /server entries (Node 18+ global fetch, or an injected one).
export const SDK_VERSION = '0.1.0'

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

/** Error envelope `{error, message, request_id}` shared by Flux `/api/flux/v1` and Little Black Box `/v1`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly body: unknown
  constructor(status: number, code: string, message: string, requestId: string | undefined, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.body = body
  }
}

export interface PostOptions {
  url: string
  bearer: string
  body: unknown
  idempotencyKey?: string
  fetch?: FetchLike
  product: string
}

export async function postJSON<T>(o: PostOptions): Promise<T> {
  const f: FetchLike | undefined = o.fetch ?? (globalThis as { fetch?: FetchLike }).fetch
  if (!f) throw new Error(`${o.product}: no fetch available (Node 18+ or pass { fetch })`)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${o.bearer}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': `apptaptap-sdks/${SDK_VERSION} (${o.product})`,
  }
  if (o.idempotencyKey) headers['Idempotency-Key'] = o.idempotencyKey
  const res = await f(o.url, { method: 'POST', headers, body: JSON.stringify(o.body) })
  const text = await res.text()
  let json: unknown = undefined
  try { json = text ? JSON.parse(text) : undefined } catch { /* not JSON */ }
  if (!res.ok) {
    const e = (json && typeof json === 'object' ? json : {}) as { error?: unknown; message?: unknown; reason?: unknown; request_id?: unknown }
    const code = typeof e.error === 'string' ? e.error : `http_${res.status}`
    const message = typeof e.message === 'string' ? e.message : typeof e.reason === 'string' ? e.reason : `HTTP ${res.status}`
    const requestId = typeof e.request_id === 'string' ? e.request_id : res.headers.get('x-request-id') ?? undefined
    throw new ApiError(res.status, code, message, requestId, json ?? text)
  }
  return json as T
}

/** Drops undefined values (so optional fields are absent, not null). */
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k]
  return out as Partial<T>
}
