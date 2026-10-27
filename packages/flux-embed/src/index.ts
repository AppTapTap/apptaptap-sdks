// @apptaptap/flux-embed: browser entry. Loads the HOSTED Flux loader (https://flux.events/embed/v1/flux.js)
// once — it defines <flux-event> and window.FluxEmbed — and wraps FluxEmbed.mount with typed events.
// Protocol v1, message-for-message LBB's with ns 'flux': MessageChannel handshake, the embed token in the iframe
// URL fragment (#t=), every event re-dispatched on the host element as 'flux:<type>' (plus the short aliases
// 'flux:registration' and 'flux:checkout'). The runtime iframe is https://flux.events/embed/v1/:eventId.
import { fire, listen, loadOnce, resolveEl } from '../../../shared/src/loader'

export const RUNTIME_URL = 'https://flux.events/embed/v1/flux.js'
export const ELEMENT_NAME = 'flux-event'

export interface FluxEventMap {
  ready: { protocol?: number; eid?: string }
  resize: { height: number }
  /**
   * The LBB `response.completed` equivalent. `completion_token` is NOT proof: confirm it on your server
   * (GET /api/flux/v1/registrations/{registration_id}/completion?token=...) before granting anything.
   */
  'registration.created': { registration_id: string; completion_token: string | null; event_id: string }
  /** A priced ticket: send the buyer to `checkout_url` (https://flux.events/e/<event>/checkout?tier=...). */
  'checkout.required': { event_id: string; tier_id: string; checkout_url: string }
  error: { code: string; retryable: boolean; message?: string }
  close: Record<string, never>
}
export type FluxEventType = keyof FluxEventMap
export type FluxListener<K extends FluxEventType> = (payload: FluxEventMap[K]) => void

export interface FluxMountOptions {
  /** Event id (UUID) or slug. */
  eventId: string
  /** One-time embed token (`flux_et_live_…` / `flux_et_test_…`) from `createEmbedSession` on your server. */
  token?: string
  /** Called for a fresh embed token (and once more if the first expired or was used). Wins over `token`. */
  fetchToken?: () => string | Promise<string>
  /** Same-origin URL POSTed for `{ embed_token }` (retried once on expiry). */
  tokenUrl?: string
  /** Display only: accent colour (#rrggbb), corner radius (px, 0..99), Google Font family. */
  accent?: string
  radius?: number | string
  font?: string
  poweredBy?: boolean
  /** Initial iframe height in px (default 560; the runtime then resizes it). */
  height?: number
  title?: string
  /** Instance id echoed in `ready` (several embeds on one page). */
  eid?: string
  /** Starting values for unlocked fields; locked embedded data always wins. */
  prefill?: { name?: string; email?: string }
  /** Navigate the host page to checkout_url on checkout.required (https only). Default false. */
  followCheckout?: boolean
  /** Override the hosted loader (staging). The iframe origin follows the loader's origin. */
  runtimeUrl?: string
}

/** What window.FluxEmbed.mount returns. */
export interface FluxRuntimeInstance {
  el: Element
  iframe: HTMLIFrameElement
  destroy(): void
  ui(u: { accent?: string; radius?: number | string; font?: string }): void
  prefill(fields: Record<string, unknown>): void
  on(type: string, cb: (payload: Record<string, unknown>, type: string) => void): () => void
}
/** window.FluxEmbed, defined by the hosted loader. */
export interface FluxRuntime {
  version: number
  protocol: number
  mount(el: Element, opts: Record<string, unknown>): FluxRuntimeInstance
  on(type: string, cb: (payload: Record<string, unknown>, type: string) => void): () => void
  destroy(): void
}

declare global {
  interface Window { FluxEmbed?: FluxRuntime }
}

const runtime = () => (typeof window !== 'undefined' && window.FluxEmbed && window.FluxEmbed.protocol === 1 ? window.FluxEmbed : undefined)

/** Loads the hosted loader exactly once; resolves when <flux-event> and window.FluxEmbed exist. */
export function register(opts: { runtimeUrl?: string } = {}): Promise<FluxRuntime> {
  return loadOnce(opts.runtimeUrl || RUNTIME_URL, () => !!runtime()).then(() => runtime()!)
}

export interface FluxHandle {
  readonly el: HTMLElement
  /** Resolves once the runtime has mounted the iframe (rejects if the loader could not load). */
  readonly ready: Promise<FluxRuntimeInstance>
  on<K extends FluxEventType>(type: K, cb: FluxListener<K>): () => void
  ui(u: { accent?: string; radius?: number | string; font?: string }): void
  prefill(fields: { name?: string; email?: string }): void
  destroy(): void
}

/** Typed listener for any element the runtime dispatches on (a mount host or a <flux-event>). */
export function on<K extends FluxEventType>(el: EventTarget, type: K, cb: FluxListener<K>): () => void {
  return listen(el, 'flux:' + type, cb)
}

/** SDK options -> FluxEmbed.mount options (the loader reads eventId, token, tokenUrl, fetchToken, ...). */
export function toRuntimeOptions(o: FluxMountOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {
    eventId: o.eventId, token: o.token, tokenUrl: o.tokenUrl, fetchToken: o.fetchToken, accent: o.accent,
    radius: o.radius, font: o.font, poweredBy: o.poweredBy, height: o.height, title: o.title, eid: o.eid,
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

/** Mounts the registration flow for one event into `el`. */
export function mount(target: HTMLElement | string, opts: FluxMountOptions): FluxHandle {
  if (!opts.eventId) throw new Error('mount: eventId is required')
  const el = resolveEl(target)
  let inst: FluxRuntimeInstance | null = null
  let dead = false
  const offCheckout = opts.followCheckout
    ? on(el, 'checkout.required', (p) => { if (typeof p.checkout_url === 'string' && /^https:\/\//i.test(p.checkout_url)) window.location.assign(p.checkout_url) })
    : null
  const ready = register({ runtimeUrl: opts.runtimeUrl }).then((rt) => {
    if (dead) throw new Error('destroyed')
    inst = rt.mount(el, toRuntimeOptions(opts))
    if (opts.prefill) inst.prefill(opts.prefill)
    return inst
  })
  ready.catch((e: Error) => { if (!dead) fire(el, 'flux:error', { code: 'runtime_load_failed', retryable: true, message: e.message }) })
  return {
    el,
    ready,
    on: (type, cb) => on(el, type, cb),
    ui: (u) => inst?.ui(u),
    prefill: (fields) => inst?.prefill(fields),
    destroy: () => { dead = true; offCheckout?.(); inst?.destroy(); inst = null },
  }
}
