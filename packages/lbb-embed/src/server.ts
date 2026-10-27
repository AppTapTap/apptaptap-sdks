// @apptaptap/lbb-embed/server: Node 18+ only. Mint embed tokens with a SECRET key and verify webhooks.
import { ApiError, compact, postJSON, type FetchLike } from '../../../shared/src/http'
import { verifyWebhook as verifyStandard, signWebhook, webhookSigningKey, WebhookVerificationError, type WebhookHeaders } from '../../../shared/src/webhooks'

export { ApiError, WebhookVerificationError, signWebhook, webhookSigningKey }
export type { FetchLike, WebhookHeaders }

/** Production API (servers: in docs/openapi.yaml). Paths below start with /v1. */
export const DEFAULT_BASE_URL = 'https://api.littleblackbox.app'

export interface CreateEmbedSessionOptions {
  /** `lbb_sk_live_...` or `lbb_sk_test_...`. Never ship it to a browser. */
  secretKey: string
  /** Survey slug or SV_ key. */
  survey: string
  /** The one origin that may frame the survey and redeem the token, e.g. https://app.example.com */
  allowedOrigin: string
  /** Your id for this person (stored on the response and the contact). */
  externalRef?: string
  /** Locked values attached to the response (URL params cannot override them). */
  embeddedData?: Record<string, string>
  language?: string
  idempotencyKey?: string
  baseUrl?: string
  fetch?: FetchLike
}

export interface EmbedSession {
  /** `lbb_et_...`: 10 minutes, redeemed once. Hand it to the browser, put it in the URL fragment only. */
  embedToken: string
  expiresAt: string
}

export async function createEmbedSession(o: CreateEmbedSessionOptions): Promise<EmbedSession> {
  if (!o.secretKey || !o.secretKey.startsWith('lbb_sk_')) {
    throw new TypeError('createEmbedSession: secretKey must be an lbb_sk_ secret key (publishable keys cannot mint embed tokens)')
  }
  if (!o.survey) throw new TypeError('createEmbedSession: survey is required')
  if (!o.allowedOrigin) throw new TypeError('createEmbedSession: allowedOrigin is required')
  const base = (o.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const res = await postJSON<{ embed_token: string; expires_at: string }>({
    url: `${base}/v1/embed/sessions`,
    bearer: o.secretKey,
    idempotencyKey: o.idempotencyKey,
    fetch: o.fetch,
    product: 'lbb',
    body: compact({
      survey: o.survey, allowed_origin: o.allowedOrigin, external_ref: o.externalRef,
      embedded_data: o.embeddedData, language: o.language,
    }),
  })
  return { embedToken: res.embed_token, expiresAt: res.expires_at }
}

// ── Webhook payloads (WebhookJobs.responsePayload / publishedPayload; api_version 2026-10-26) ──

export interface LBBSurveyRef { id: string; survey_id: string; title: string; slug?: string; status?: string }
export interface LBBResponseRecord {
  id: string
  response_id: string
  finished: boolean
  outcome: string
  progress: number
  channel: string
  language: string
  started_at: string
  recorded_at: string | null
  duration_sec: number | null
  embedded_data: Record<string, string>
  values: Record<string, string>
}
interface Base<T extends string> { id: string; type: T; created_at: string; api_version: string; livemode: boolean; survey: LBBSurveyRef }
export type LBBResponseEvent = Base<'response.completed' | 'response.partial' | 'response.recorded'> & { response: LBBResponseRecord }
export type LBBSurveyPublishedEvent = Base<'survey.published'> & {
  version: { id: string; version_number: number; label: string | null; published_at: string | null }
}
export type LBBWebhookEvent = LBBResponseEvent | LBBSurveyPublishedEvent
export type LBBWebhookEventType = LBBWebhookEvent['type']

export interface VerifyWebhookOptions {
  /** RAW body (string or Buffer), exactly as received. */
  payload: string | Uint8Array
  headers: WebhookHeaders
  /** `whsec_...` from the webhook's create/rotate response. */
  secret: string
  toleranceSec?: number
  now?: number
}

/** Standard Webhooks verification (webhook-id / webhook-timestamp / webhook-signature). Throws on failure. */
export function verifyWebhook(o: VerifyWebhookOptions): LBBWebhookEvent {
  return verifyStandard<LBBWebhookEvent>(o)
}
