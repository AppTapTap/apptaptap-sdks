// @apptaptap/lbb-embed: browser entry. Loads the HOSTED Little Black Box loader once (it defines <lbb-survey>
// and window.LBB) and wraps LBB.mount with typed events. Protocol v1: MessageChannel handshake, the embed token
// in the iframe URL fragment (#et=), events re-dispatched on the host element as DOM CustomEvents 'lbb:<type>'.
import { fire, listen, loadOnce, resolveEl } from '../../../shared/src/loader'

export const RUNTIME_URL = 'https://littleblackbox.app/embed/v1/lbb.js'
export const ELEMENT_NAME = 'lbb-survey'

export interface LBBEventMap {
  ready: { protocol?: number; eid?: string }
  resize: { height: number }
  'response.started': { session_id: string }
  'page.changed': { index: number; total: number }
  /** Confirm `completion_token` server-side (GET /v1/responses/{id}/completion) before granting anything. */
  'response.completed': { session_id: string; completion_token?: string }
  redirect: { url: string }
  error: { code: string; retryable?: boolean }
  close: Record<string, never>
}
export type LBBEventType = keyof LBBEventMap
export type LBBListener<K extends LBBEventType> = (payload: LBBEventMap[K]) => void

export interface LBBMountOptions {
  /** Survey slug or SV_ key. */
  survey?: string
  /** One-time embed token from `createEmbedSession` (server). Sent in the URL fragment, never the query. */
  token?: string
  /** Called for a fresh embed token (also once more if the first one expired). Wins over `token`. */
  fetchToken?: () => string | Promise<string>
  /** Same-origin URL POSTed for `{ embed_token }` (the hosted loader's token-url). */
  tokenUrl?: string
  /** A personal-link token (/x/t/<token>) instead of `survey`. */
  linkToken?: string
  mode?: 'inline' | 'popup' | 'slider'
  theme?: 'auto' | 'light' | 'dark'
  accent?: string
  bg?: string
  font?: string
  radius?: 'sm' | 'md' | 'lg'
  lang?: string
  /** false hides the logo header and background (chrome=0). */
  chrome?: boolean
  params?: Record<string, string> | string
  height?: number
  label?: string
  title?: string
  prefill?: Record<string, string>
  followRedirect?: boolean
  /** Override the hosted loader (staging). The iframe origin follows the loader's origin. */
  runtimeUrl?: string
}

/** What window.LBB.mount returns (the hosted loader's instance). */
export interface LBBRuntimeInstance {
  el: HTMLElement
  iframe: HTMLIFrameElement | null
  open(): void
  close(): void
  destroy(): void
  prefill(fields: Record<string, string>): void
  ui(u: unknown): void
}
export interface LBBRuntime {
  version: number
  protocol: number
  mount(el: HTMLElement, opts: Record<string, unknown>): LBBRuntimeInstance
  ui(u: unknown): void
  on(type: string, cb: (payload: unknown, type: string) => void): () => void
  destroy(): void
}

declare global {
  interface Window { LBB?: LBBRuntime }
  interface HTMLElementEventMap {
    'lbb:ready': CustomEvent<LBBEventMap['ready']>
    'lbb:response.completed': CustomEvent<LBBEventMap['response.completed']>
    'lbb:error': CustomEvent<LBBEventMap['error']>
  }
}

const runtime = () => (typeof window !== 'undefined' && window.LBB && window.LBB.protocol === 1 ? window.LBB : undefined)

/** Loads the hosted loader exactly once; resolves when <lbb-survey> and window.LBB exist. */
export function register(opts: { runtimeUrl?: string } = {}): Promise<LBBRuntime> {
  return loadOnce(opts.runtimeUrl || RUNTIME_URL, () => !!runtime()).then(() => runtime()!)
}

export interface LBBHandle {
  readonly el: HTMLElement
  /** Resolves once the runtime has mounted the survey (rejects if the loader could not load). */
  readonly ready: Promise<LBBRuntimeInstance>
  on<K extends LBBEventType>(type: K, cb: LBBListener<K>): () => void
  open(): void
  close(): void
  prefill(fields: Record<string, string>): void
  destroy(): void
}

/** Typed listener for any element the runtime dispatches on (a mount host or an <lbb-survey>). */
export function on<K extends LBBEventType>(el: EventTarget, type: K, cb: LBBListener<K>): () => void {
  return listen(el, 'lbb:' + type, cb)
}

export function toRuntimeOptions(o: LBBMountOptions): Record<string, unknown> {
  const fetchToken = o.fetchToken ?? (o.token ? () => o.token as string : undefined)
  const out: Record<string, unknown> = {
    survey: o.survey, token: o.linkToken, tokenUrl: o.tokenUrl, fetchToken, mode: o.mode,
    theme: o.theme, accent: o.accent, bg: o.bg, font: o.font, radius: o.radius, lang: o.lang,
    chrome: o.chrome === false ? '0' : undefined, params: o.params, height: o.height, label: o.label,
    title: o.title, prefill: o.prefill, followRedirect: !!o.followRedirect,
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}

/** Mounts a survey into `el` (inline) or attaches a popup/slider trigger to it. */
export function mount(target: HTMLElement | string, opts: LBBMountOptions): LBBHandle {
  if (!opts.survey && !opts.linkToken) throw new Error('mount: survey (or linkToken) is required')
  const el = resolveEl(target)
  let inst: LBBRuntimeInstance | null = null
  let dead = false
  const ready = register({ runtimeUrl: opts.runtimeUrl }).then((rt) => {
    if (dead) throw new Error('destroyed')
    inst = rt.mount(el, toRuntimeOptions(opts))
    return inst
  })
  ready.catch((e: Error) => { if (!dead) fire(el, 'lbb:error', { code: 'runtime_load_failed', retryable: true, message: e.message }) })
  return {
    el,
    ready,
    on: (type, cb) => on(el, type, cb),
    open: () => inst?.open(),
    close: () => inst?.close(),
    prefill: (fields) => inst?.prefill(fields),
    destroy: () => { dead = true; inst?.destroy(); inst = null },
  }
}
