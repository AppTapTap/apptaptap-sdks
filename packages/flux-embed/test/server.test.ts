import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { ApiError, createEmbedSession, verifyWebhook, type FetchLike } from '../src/server'

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300, status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  }))
}

describe('createEmbedSession', () => {
  it('POSTs /api/flux/v1/embed/sessions with the secret key, Idempotency-Key and a snake_case body', async () => {
    const f = fakeFetch(201, { embed_token: 'flux_et_test_abc', expires_at: '2026-10-26T20:10:00Z', event_id: 'E1', mode: 'test' })
    const s = await createEmbedSession({
      secretKey: 'flux_sk_test_123', eventId: 'E1', allowedOrigin: 'https://app.example.com', externalRef: 'u_1',
      embeddedData: { email: 'a@example.com' }, locked: ['email'], expiresInSec: 300, idempotencyKey: 'idem-1', fetch: f,
    })
    expect(s).toEqual({ embedToken: 'flux_et_test_abc', expiresAt: '2026-10-26T20:10:00Z', eventId: 'E1', mode: 'test' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://apptaptap-vapor-backend.fly.dev/api/flux/v1/embed/sessions')
    expect(init?.headers?.Authorization).toBe('Bearer flux_sk_test_123')
    expect(init?.headers?.['Idempotency-Key']).toBe('idem-1')
    expect(JSON.parse(init!.body!)).toEqual({
      event: 'E1', allowed_origin: 'https://app.example.com', external_ref: 'u_1',
      embedded_data: { email: 'a@example.com' }, locked: ['email'], expires_in_sec: 300,
    })
  })
  it('sends powered_by only when poweredBy is set (false is sent, not dropped)', async () => {
    const ok = { embed_token: 'flux_et_test_abc', expires_at: '2026-10-27T18:00:00Z', event_id: 'E1', mode: 'test' }
    const hidden = fakeFetch(201, ok)
    await createEmbedSession({ secretKey: 'flux_sk_test_1', eventId: 'E1', poweredBy: false, fetch: hidden })
    expect(JSON.parse(hidden.mock.calls[0][1]!.body!)).toEqual({ event: 'E1', powered_by: false })
    const shown = fakeFetch(201, ok)
    await createEmbedSession({ secretKey: 'flux_sk_test_1', eventId: 'E1', poweredBy: true, fetch: shown })
    expect(JSON.parse(shown.mock.calls[0][1]!.body!)).toEqual({ event: 'E1', powered_by: true })
    const unset = fakeFetch(201, ok)
    await createEmbedSession({ secretKey: 'flux_sk_test_1', eventId: 'E1', fetch: unset })
    const body = JSON.parse(unset.mock.calls[0][1]!.body!)
    expect(body).toEqual({ event: 'E1' })
    expect('powered_by' in body).toBe(false)
  })
  it('maps the error envelope (request id from the header when the body has none)', async () => {
    const f = fakeFetch(422, { error: 'invalid_allowed_origin', message: 'allowed_origin must be an origin.' }, { 'x-request-id': 'req_h' })
    const err = await createEmbedSession({ secretKey: 'flux_sk_live_1', eventId: 'E1', fetch: f }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 422, code: 'invalid_allowed_origin', requestId: 'req_h' })
  })
  it('refuses a publishable key before any request', async () => {
    const f = fakeFetch(201, {})
    await expect(createEmbedSession({ secretKey: 'flux_pk_live_1', eventId: 'E1', fetch: f })).rejects.toThrow(TypeError)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('typed Flux webhook payloads', () => {
  const { vectors } = JSON.parse(readFileSync(new URL('../../../vectors/webhooks.json', import.meta.url), 'utf8'))
  it('narrows on type (registration.created test-mode, order.paid)', () => {
    const seen: string[] = []
    for (const v of vectors.filter((x: { name: string }) => x.name.startsWith('Flux'))) {
      const e = verifyWebhook({ payload: v.body, secret: v.secret, now: v.timestamp,
        headers: { 'webhook-id': v.id, 'webhook-timestamp': String(v.timestamp), 'webhook-signature': v.signature } })
      expect(e.id).toBe(v.id)
      if (e.type === 'registration.created') { expect(e.livemode).toBe(false); expect(e.data.status).toBe('going'); expect(e.data.api_key_id).toBeTruthy() }
      if (e.type === 'order.paid') { expect(e.data.amount_cents).toBe(2500); expect(e.livemode).toBe(true) }
      seen.push(e.type)
    }
    expect(seen).toEqual(['registration.created', 'order.paid'])
  })
})
