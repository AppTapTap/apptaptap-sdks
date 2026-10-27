import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { signWebhook, verifyWebhook, WebhookVerificationError } from '../src/server'

const { vectors } = JSON.parse(readFileSync(new URL('../../../vectors/webhooks.json', import.meta.url), 'utf8')) as {
  vectors: { name: string; secret: string; id: string; timestamp: number; body: string; signature: string }[]
}
const hdrs = (v: (typeof vectors)[number], sig = v.signature) => ({ 'webhook-id': v.id, 'webhook-timestamp': String(v.timestamp), 'webhook-signature': sig })

describe('verifyWebhook (Standard Webhooks)', () => {
  for (const v of vectors) {
    it(`accepts vector: ${v.name}`, () => {
      expect(signWebhook({ secret: v.secret, id: v.id, timestamp: v.timestamp, payload: v.body })).toBe(v.signature)
      const parsed = verifyWebhook({ payload: v.body, headers: hdrs(v), secret: v.secret, now: v.timestamp + 10 })
      expect(parsed).toEqual(JSON.parse(v.body))
    })
  }
  const v = vectors[1]
  it('accepts a Buffer body, fetch Headers and mixed-case names', () => {
    expect(() => verifyWebhook({ payload: Buffer.from(v.body), headers: new Headers(hdrs(v)), secret: v.secret, now: v.timestamp })).not.toThrow()
    const mixed = { 'Webhook-Id': v.id, 'WEBHOOK-TIMESTAMP': String(v.timestamp), 'Webhook-Signature': [v.signature] }
    expect(() => verifyWebhook({ payload: v.body, headers: mixed, secret: v.secret, now: v.timestamp })).not.toThrow()
  })
  it('accepts when any one of several space-separated signatures matches', () => {
    const multi = `v1,${Buffer.alloc(32).toString('base64')} v2,abc ${v.signature}`
    expect(() => verifyWebhook({ payload: v.body, headers: hdrs(v, multi), secret: v.secret, now: v.timestamp })).not.toThrow()
  })
  const code = (fn: () => unknown) => { try { fn(); return 'none' } catch (e) { return e instanceof WebhookVerificationError ? e.code : 'other' } }
  it('rejects a tampered body, wrong secret, missing headers and a non-v1 scheme', () => {
    expect(code(() => verifyWebhook({ payload: v.body + ' ', headers: hdrs(v), secret: v.secret, now: v.timestamp }))).toBe('no_matching_signature')
    expect(code(() => verifyWebhook({ payload: v.body, headers: hdrs(v), secret: 'whsec_AbCdEfGhIjKlMnOpQrStUvWxYz012345', now: v.timestamp }))).toBe('no_matching_signature')
    expect(code(() => verifyWebhook({ payload: v.body, headers: { 'webhook-id': v.id }, secret: v.secret, now: v.timestamp }))).toBe('missing_headers')
    expect(code(() => verifyWebhook({ payload: v.body, headers: hdrs(v, v.signature.replace('v1,', 'v2,')), secret: v.secret, now: v.timestamp }))).toBe('no_matching_signature')
  })
  it('enforces the 5-minute tolerance both ways', () => {
    expect(code(() => verifyWebhook({ payload: v.body, headers: hdrs(v), secret: v.secret, now: v.timestamp + 300 }))).toBe('none')
    expect(code(() => verifyWebhook({ payload: v.body, headers: hdrs(v), secret: v.secret, now: v.timestamp + 301 }))).toBe('timestamp_out_of_range')
    expect(code(() => verifyWebhook({ payload: v.body, headers: hdrs(v), secret: v.secret, now: v.timestamp - 301 }))).toBe('timestamp_out_of_range')
    expect(code(() => verifyWebhook({ payload: v.body, headers: { ...hdrs(v), 'webhook-timestamp': 'soon' }, secret: v.secret, now: v.timestamp }))).toBe('invalid_timestamp')
  })
  it('refuses a parsed object as payload', () => {
    expect(() => verifyWebhook({ payload: JSON.parse(v.body), headers: hdrs(v), secret: v.secret, now: v.timestamp })).toThrow(TypeError)
  })
})
