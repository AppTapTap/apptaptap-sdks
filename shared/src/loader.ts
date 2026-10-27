// Browser-side: load a hosted runtime loader script exactly once per page, and DOM event helpers.
const pending: Record<string, Promise<void> | undefined> = {}

/**
 * Injects `<script src async>` once (reusing a tag already on the page) and resolves when `isLoaded()` is true.
 * A failed load clears the cache so a later call can retry.
 */
export function loadOnce(src: string, isLoaded: () => boolean, timeoutMs = 20000): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('runtime loader needs a browser document'))
  if (isLoaded()) return Promise.resolve()
  const cached = pending[src]
  if (cached) return cached
  const p = new Promise<void>((resolve, reject) => {
    let s: HTMLScriptElement | null = null
    const tags = document.getElementsByTagName('script')
    for (let i = 0; i < tags.length; i++) if (tags[i].src === src) s = tags[i]
    const fresh = !s
    if (!s) { s = document.createElement('script'); s.src = src; s.async = true }
    const timer = setTimeout(() => fail(new Error('timed out loading ' + src)), timeoutMs)
    function fail(e: Error) { clearTimeout(timer); pending[src] = undefined; reject(e) }
    s.addEventListener('load', () => {
      clearTimeout(timer)
      if (isLoaded()) { pending[src] = undefined; resolve() }
      else fail(new Error(src + ' loaded but did not register its runtime'))
    })
    s.addEventListener('error', () => fail(new Error('failed to load ' + src)))
    if (fresh) (document.head || document.documentElement).appendChild(s)
  })
  pending[src] = p
  return p
}

export function resolveEl(el: HTMLElement | string): HTMLElement {
  const found = typeof el === 'string' ? document.querySelector<HTMLElement>(el) : el
  if (!found) throw new Error('mount: element not found: ' + String(el))
  return found
}

/** Listens for `<prefix>:<type>` CustomEvents (the hosted loaders re-dispatch every protocol event on the host). */
export function listen<P>(el: EventTarget, name: string, cb: (payload: P) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<P>).detail)
  el.addEventListener(name, h)
  return () => el.removeEventListener(name, h)
}

export function fire(el: EventTarget, name: string, detail: unknown) {
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
}
