// @apptaptap/flux-embed/server: Node 18+ only. Mint embed tokens with a SECRET key and verify webhooks.
import { ApiError, compact, postJSON, type FetchLike } from '../../../shared/src/http'
import { verifyWebhook as verifyStandard, signWebhook, webhookSigningKey, WebhookVerificationError, type WebhookHeaders } from '../../../shared/src/webhooks'

export { ApiError, WebhookVerificationError, signWebhook, webhookSigningKey }
export type { FetchLike, WebhookHeaders }

/** Public Flux API (v1 aliases of the Flux routes). */
export const DEFAULT_BASE_URL = 'https://apptaptap-vapor-backend.fly.dev/api/flux/v1'

export interface CreateEmbedSessionOptions {
  /** `flux_sk_live_...` / `flux_sk_test_...` (legacy `flux_sk_<hex>` works too). Never ship it to a browser. */
  secretKey: string
  /** Event id (UUID) or slug (sent as `event`). */
  eventId: string
  /** Origin allowed to frame the flow and redeem the token, e.g. https://app.example.com */
  allowedOrigin?: string
  /** Your id for this person; echoed on the registration. */
  externalRef?: string
  /** Prefilled customer fields (name, email, ...). Keys listed in `locked` cannot be changed by the visitor. */
  embeddedData?: Record<string, string>
  locked?: string[]
  /** 30..600 seconds (default 600). */
  expiresInSec?: number
  idempotencyKey?: string
  baseUrl?: string
  fetch?: FetchLike
}

export interface EmbedSession {
  /** `flux_et_live_...` / `flux_et_test_...`: redeemed once. Put it in the URL fragment only. */
  embedToken: string
  expiresAt: string
  eventId: string
  mode: 'live' | 'test'
}

export async function createEmbedSession(o: CreateEmbedSessionOptions): Promise<EmbedSession> {
  if (!o.secretKey || !o.secretKey.startsWith('flux_sk_')) {
    throw new TypeError('createEmbedSession: secretKey must be a flux_sk_ secret key (flux_pk_ keys cannot mint embed tokens)')
  }
  if (!o.eventId) throw new TypeError('createEmbedSession: eventId is required')
  const base = (o.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const res = await postJSON<{ embed_token: string; expires_at: string; event_id: string; mode: 'live' | 'test' }>({
    url: `${base}/embed/sessions`,
    bearer: o.secretKey,
    idempotencyKey: o.idempotencyKey,
    fetch: o.fetch,
    product: 'flux',
    body: compact({
      event: o.eventId, allowed_origin: o.allowedOrigin, external_ref: o.externalRef, embedded_data: o.embeddedData,
      locked: o.locked, expires_in_sec: o.expiresInSec,
    }),
  })
  return { embedToken: res.embed_token, expiresAt: res.expires_at, eventId: res.event_id, mode: res.mode }
}

// ── Webhook payloads (FluxTenantWebhooks.envelope: {id, type, api_version, livemode, created, data}) ──

interface Envelope<T extends string, D> {
  /** evt_...; equals the webhook-id header. */
  id: string
  type: T
  api_version: string
  /** false when a test key or a flux_et_test_ token caused the event. */
  livemode: boolean
  /** Unix seconds. */
  created: number
  data: D & { api_key_id?: string }
}
export type FluxRegistrationCreated = Envelope<'registration.created', { event_id: string; guest_id: string; status: string }>
export type FluxRegistrationCancelled = Envelope<'registration.cancelled', { event_id: string; guest_id: string; [k: string]: unknown }>
export type FluxCheckinCreated = Envelope<'checkin.created', { event_id?: string; guest_id: string; [k: string]: unknown }>
export type FluxOrderPaid = Envelope<'order.paid', { order_id: string; event_id: string; guest_id: string; amount_cents: number; currency: string }>
export type FluxEventUpdated = Envelope<'event.updated', { event_id: string; [k: string]: unknown }>
export type FluxWebhookEvent = FluxRegistrationCreated | FluxRegistrationCancelled | FluxCheckinCreated | FluxOrderPaid | FluxEventUpdated
export type FluxWebhookEventType = FluxWebhookEvent['type']

export interface VerifyWebhookOptions {
  /** RAW body (string or Buffer), exactly as received. */
  payload: string | Uint8Array
  headers: WebhookHeaders
  /** `whsec_...`, shown once when the webhook is created (rotate to get a new one). */
  secret: string
  toleranceSec?: number
  now?: number
}

/** Standard Webhooks verification (webhook-id / webhook-timestamp / webhook-signature). Throws on failure. */
export function verifyWebhook(o: VerifyWebhookOptions): FluxWebhookEvent {
  return verifyStandard<FluxWebhookEvent>(o)
}
