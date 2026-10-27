// @apptaptap/flux-embed: browser entry. Loads the HOSTED Flux loader once (it defines <flux-event> and
// window.Flux) and wraps Flux.mount with typed events. Same protocol v1 as Little Black Box (MessageChannel
// handshake, embed token in the iframe URL fragment, events re-dispatched on the host as 'flux:<type>').
// The runtime iframe lives at https://flux.events/embed/v1/:eventId.
import { fire, listen, loadOnce, resolveEl } from '../../../shared/src/loader'

export const RUNTIME_URL = 'https://flux.events/embed/v1/flux.js'
export const ELEMENT_NAME = 'flux-event'

export interface FluxEventMap {
  ready: { protocol?: number; eid?: string }
  resize: { height: number }
  /** Confirm `completion_token` server-side (GET /api/flux/v1/registrations/{id}/completion) before granting anything. */
  'registration.created': {
    event_id: string
    guest_id?: string
    registration_id?: string
    status?: 'going' | 'maybe' | 'waitlisted' | string
    completion_token?: string
    external_ref?: string
  }
  /** A priced ticket: send the buyer to `checkout_url` (https://flux.events/e/<event>/checkout?tier=...). */
  'checkout.required': { checkout_url: string; event_id?: string; tier_id?: string }
  redirect: { url: string }
  error: { code: string; retryable?: boolean; message?: string }
  close: Record<string, never>
}
export type FluxEventType = keyof FluxEventMap
export type FluxListener<K extends FluxEventType> = (payload: FluxEventMap[K]) => void

export interface FluxMountOptions {
  /** Event id (UUID) or slug. */
  event: string
  /** One-time embed token from `createEmbedSession` (server). Sent in the URL fragment, never the query. */
  token?: string
  /** Called for a fresh embed token (also once more if the first one expired). Wins over `token`. */
  fetchToken?: () => string | Promise<string>
  /** Same-origin URL POSTed for `{ embed_token }`. */
  tokenUrl?: string
  mode?: 'inline' | 'popup' | 'slider'
  theme?: 'auto' | 'light' | 'dark'
  accent?: string
  bg?: string
  font?: string
  radius?: 'sm' | 'md' | 'lg'
  lang?: string
  chrome?: boolean
  height?: number
  label?: string
  title?: string
  /** Starting values for unlocked fields (name, email, ...). Locked embedded data always wins. */
  prefill?: Record<string, string>
  /** Navigate the host page to checkout_url on checkout.required (https only). Default false: handle it yourself. */
  followCheckout?: boolean
  /** Override the hosted loader (staging). */
  runtimeUrl?: string
}

export interface FluxRuntimeInstance {
  el: HTMLElement
  iframe: HTMLIFrameElement | null
  open(): void
  close(): void
  destroy(): void
  prefill(fields: Record<string, string>): void
}
export interface FluxRuntime {
  version: number
  protocol: number
  mount(el: HTMLElement, opts: Record<string, unknown>): FluxRuntimeInstance
  on?(type: string, cb: (payload: unknown, type: string) => void): () => void
  destroy?(): void
}

declare global {
  interface Window { Flux?: FluxRuntime }
}

const runtime = () => (typeof window !== 'undefined' && window.Flux && window.Flux.protocol === 1 ? window.Flux : undefined)

/** Loads the hosted loader exactly once; resolves when <flux-event> and window.Flux exist. */
export function register(opts: { runtimeUrl?: string } = {}): Promise<FluxRuntime> {
  return loadOnce(opts.runtimeUrl || RUNTIME_URL, () => !!runtime()).then(() => runtime()!)
}

export interface FluxHandle {
  readonly el: HTMLElement
  readonly ready: Promise<FluxRuntimeInstance>
  on<K extends FluxEventType>(type: K, cb: FluxListener<K>): () => void
  open(): void
  close(): void
  prefill(fields: Record<string, string>): void
  destroy(): void
}

/** Typed listener for any element the runtime dispatches on (a mount host or a <flux-event>). */
export function on<K extends FluxEventType>(el: EventTarget, type: K, cb: FluxListener<K>): () => void {
  return listen(el, 'flux:' + type, cb)
}

export function toRuntimeOptions(o: FluxMountOptions): Record<string, unknown> {
  const fetchToken = o.fetchToken ?? (o.token ? () => o.token as string : undefined)
  const out: Record<string, unknown> = {
    event: o.event, tokenUrl: o.tokenUrl, fetchToken, mode: o.mode, theme: o.theme, accent: o.accent, bg: o.bg,
    font: o.font, radius: o.radius, lang: o.lang, chrome: o.chrome === false ? '0' : undefined, height: o.height,
    label: o.label, title: o.title, prefill: o.prefill,
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

/** Mounts the registration flow for one event into `el` (inline) or attaches a popup/slider trigger to it. */
export function mount(target: HTMLElement | string, opts: FluxMountOptions): FluxHandle {
  if (!opts.event) throw new Error('mount: event is required')
  const el = resolveEl(target)
  let inst: FluxRuntimeInstance | null = null
  let dead = false
  const offCheckout = opts.followCheckout
    ? on(el, 'checkout.required', (p) => { if (typeof p.checkout_url === 'string' && /^https:\/\//i.test(p.checkout_url)) window.location.assign(p.checkout_url) })
    : null
  const ready = register({ runtimeUrl: opts.runtimeUrl }).then((rt) => {
    if (dead) throw new Error('destroyed')
    inst = rt.mount(el, toRuntimeOptions(opts))
    return inst
  })
  ready.catch((e: Error) => { if (!dead) fire(el, 'flux:error', { code: 'runtime_load_failed', retryable: true, message: e.message }) })
  return {
    el,
    ready,
    on: (type, cb) => on(el, type, cb),
    open: () => inst?.open(),
    close: () => inst?.close(),
    prefill: (fields) => inst?.prefill(fields),
    destroy: () => { dead = true; offCheckout?.(); inst?.destroy(); inst = null },
  }
}
