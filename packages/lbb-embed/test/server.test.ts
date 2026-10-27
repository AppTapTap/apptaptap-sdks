import { describe, expect, it, vi } from 'vitest'
import { ApiError, createEmbedSession, type FetchLike } from '../src/server'

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300, status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  }))
}

describe('createEmbedSession', () => {
  it('POSTs /v1/embed/sessions with the secret key, Idempotency-Key and a snake_case body', async () => {
    const f = fakeFetch(201, { embed_token: 'lbb_et_live_abc', expires_at: '2026-10-26T20:10:00Z' })
    const s = await createEmbedSession({
      secretKey: 'lbb_sk_test_123', survey: 'nps-q4', allowedOrigin: 'https://app.example.com',
      externalRef: 'user_1842', embeddedData: { plan: 'pro' }, idempotencyKey: 'idem-1', fetch: f,
    })
    expect(s).toEqual({ embedToken: 'lbb_et_live_abc', expiresAt: '2026-10-26T20:10:00Z' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.littleblackbox.app/v1/embed/sessions')
    expect(init?.method).toBe('POST')
    expect(init?.headers?.Authorization).toBe('Bearer lbb_sk_test_123')
    expect(init?.headers?.['Idempotency-Key']).toBe('idem-1')
    expect(JSON.parse(init!.body!)).toEqual({ survey: 'nps-q4', allowed_origin: 'https://app.example.com', external_ref: 'user_1842', embedded_data: { plan: 'pro' } })
  })
  it('omits Idempotency-Key when not given and honours baseUrl', async () => {
    const f = fakeFetch(201, { embed_token: 't', expires_at: 'x' })
    await createEmbedSession({ secretKey: 'lbb_sk_live_1', survey: 's', allowedOrigin: 'https://a.example', baseUrl: 'https://staging.example/', fetch: f })
    expect(f.mock.calls[0][0]).toBe('https://staging.example/v1/embed/sessions')
    expect(f.mock.calls[0][1]?.headers?.['Idempotency-Key']).toBeUndefined()
  })
  it('maps the error envelope to ApiError', async () => {
    const f = fakeFetch(403, { error: 'forbidden', message: 'Not your survey.', request_id: 'req_9' })
    const err = await createEmbedSession({ secretKey: 'lbb_sk_live_1', survey: 's', allowedOrigin: 'https://a.example', fetch: f }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 403, code: 'forbidden', message: 'Not your survey.', requestId: 'req_9' })
  })
  it('refuses a publishable key before any request', async () => {
    const f = fakeFetch(201, {})
    await expect(createEmbedSession({ secretKey: 'lbb_pk_live_1', survey: 's', allowedOrigin: 'https://a.example', fetch: f })).rejects.toThrow(TypeError)
    expect(f).not.toHaveBeenCalled()
  })
})
