// Standard Webhooks (https://www.standardwebhooks.com) receiver, shared by @apptaptap/flux-embed/server and
// @apptaptap/lbb-embed/server. Node 18+ only (node:crypto); no browser globals.
//
// Both products sign every delivery the same way:
//   webhook-id:        unique message id (dedupe on it)
//   webhook-timestamp: unix seconds
//   webhook-signature: space-separated list of "v1,<base64 HMAC-SHA256(key, "<id>.<timestamp>.<body>")>"
// where key = base64-decode of the secret after "whsec_". Little Black Box falls back to the secret's raw UTF-8
// bytes when the tail is not valid base64 (WebhookPolicy.standardKey); this receiver does the same.
import { createHmac, timingSafeEqual } from 'node:crypto'

export type WebhookErrorCode =
  | 'missing_headers'
  | 'invalid_timestamp'
  | 'timestamp_out_of_range'
  | 'no_matching_signature'
  | 'invalid_payload'

export class WebhookVerificationError extends Error {
  readonly code: WebhookErrorCode
  constructor(code: WebhookErrorCode, message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
    this.code = code
  }
}

/** A fetch `Headers`, a Node `IncomingHttpHeaders`, or any plain record (names are matched case-insensitively). */
export type WebhookHeaders =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>

export interface VerifyWebhookOptions {
  /** The RAW request body, exactly as received. Never a re-serialised object. */
  payload: string | Uint8Array
  headers: WebhookHeaders
  /** The endpoint secret, `whsec_...`. */
  secret: string
  /** Allowed clock skew in seconds (default 300 = 5 minutes). */
  toleranceSec?: number
  /** Current unix time in seconds (tests). Defaults to the system clock. */
  now?: number
}

function header(h: WebhookHeaders, name: string): string | undefined {
  if (!h) return undefined
  if (typeof (h as { get?: unknown }).get === 'function') return (h as { get(n: string): string | null }).get(name) ?? undefined
  const rec = h as Record<string, string | string[] | undefined>
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase() !== name) continue
    const v = rec[k]
    return Array.isArray(v) ? v.join(' ') : v
  }
  return undefined
}

// Strict base64 (padding required), like Foundation's Data(base64Encoded:) on the server side.
const STRICT_B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** The HMAC key for a secret: base64-decoded tail after `whsec_`, else the secret's raw UTF-8 bytes. */
export function webhookSigningKey(secret: string): Buffer {
  const tail = secret.startsWith('whsec_') ? secret.slice(6) : secret
  if (tail.length > 0 && STRICT_B64.test(tail)) return Buffer.from(tail, 'base64')
  return Buffer.from(secret, 'utf8')
}

function toBuffer(payload: string | Uint8Array): Buffer {
  if (typeof payload === 'string') return Buffer.from(payload, 'utf8')
  if (payload instanceof Uint8Array) return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
  throw new TypeError('verifyWebhook: payload must be the raw body (string or Buffer), not a parsed object')
}

function mac(secret: string, id: string, timestamp: string, body: Buffer): Buffer {
  return createHmac('sha256', webhookSigningKey(secret)).update(`${id}.${timestamp}.`).update(body).digest()
}

/** `v1,<base64>` for a message (useful for testing your own receiver). */
export function signWebhook(opts: { secret: string; id: string; timestamp: number; payload: string | Uint8Array }): string {
  return 'v1,' + mac(opts.secret, opts.id, String(opts.timestamp), toBuffer(opts.payload)).toString('base64')
}

/**
 * Verifies a delivery and returns the parsed JSON body. Throws `WebhookVerificationError` on any failure:
 * missing headers, a timestamp outside the tolerance, or no `v1` signature that matches (constant-time compare).
 */
export function verifyWebhook<T = unknown>(opts: VerifyWebhookOptions): T {
  const { headers, secret } = opts
  if (typeof secret !== 'string' || secret.length === 0) throw new TypeError('verifyWebhook: secret is required')
  const body = toBuffer(opts.payload)
  const id = header(headers, 'webhook-id')
  const ts = header(headers, 'webhook-timestamp')
  const sigs = header(headers, 'webhook-signature')
  if (!id || !ts || !sigs) throw new WebhookVerificationError('missing_headers', 'Missing webhook-id, webhook-timestamp or webhook-signature.')
  if (!/^\d{1,12}$/.test(ts)) throw new WebhookVerificationError('invalid_timestamp', 'webhook-timestamp is not unix seconds.')
  const tolerance = opts.toleranceSec ?? 300
  const now = opts.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(ts)) > tolerance) throw new WebhookVerificationError('timestamp_out_of_range', 'webhook-timestamp is outside the tolerance window.')

  const expected = mac(secret, id, ts, body)
  let ok = false
  for (const part of sigs.split(' ')) {
    const comma = part.indexOf(',')
    if (comma < 0 || part.slice(0, comma) !== 'v1') continue
    const given = Buffer.from(part.slice(comma + 1), 'base64')
    // Keep looping after a match so the time taken does not depend on which signature matched.
    if (given.length === expected.length && timingSafeEqual(given, expected)) ok = true
  }
  if (!ok) throw new WebhookVerificationError('no_matching_signature', 'No webhook-signature matches this payload.')
  try {
    return JSON.parse(body.toString('utf8')) as T
  } catch {
    throw new WebhookVerificationError('invalid_payload', 'The signed payload is not JSON.')
  }
}
