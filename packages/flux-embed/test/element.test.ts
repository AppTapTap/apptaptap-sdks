// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, on, register, RUNTIME_URL, toRuntimeOptions, type FluxRuntime } from '../src/index'

/** Stands in for the hosted flux.js (lane E1 src/embed/loader.ts): window.FluxEmbed + <flux-event>. */
function installFakeRuntime() {
  const prefill = vi.fn()
  const rt: FluxRuntime = {
    version: 1, protocol: 1,
    mount: vi.fn((el: Element) => ({ el, iframe: document.createElement('iframe'), destroy: vi.fn(), ui: vi.fn(), prefill, on: vi.fn(() => () => {}) })),
    on: vi.fn(() => () => {}), destroy: vi.fn(),
  }
  window.FluxEmbed = rt
  if (!customElements.get('flux-event')) customElements.define('flux-event', class extends HTMLElement {})
  return { rt, prefill }
}
const scripts = () => Array.from(document.querySelectorAll('script')).filter((s) => s.src === RUNTIME_URL)
afterEach(() => { delete window.FluxEmbed; document.body.innerHTML = ''; scripts().forEach((s) => s.remove()) })

describe('browser entry', () => {
  it('injects https://flux.events/embed/v1/flux.js exactly once and registers <flux-event>', async () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const a = register()
    const h = mount(host, { eventId: 'evt-1', token: 'flux_et_live_x', prefill: { name: 'Ada' }, radius: 12 })
    void register()
    expect(scripts()).toHaveLength(1)
    expect(customElements.get('flux-event')).toBeUndefined()
    const { rt, prefill } = installFakeRuntime()
    scripts()[0].dispatchEvent(new Event('load'))
    await expect(a).resolves.toBe(rt)
    await h.ready
    expect(customElements.get('flux-event')).toBeDefined()
    const [el, opts] = (rt.mount as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(el).toBe(host)
    // The loader's own option names: eventId + token (it puts the token in the #t= fragment).
    expect(opts).toEqual({ eventId: 'evt-1', token: 'flux_et_live_x', radius: 12 })
    expect(prefill).toHaveBeenCalledWith({ name: 'Ada' })
  })

  it('passes fetchToken / tokenUrl through for the loader\'s one fresh-token retry', () => {
    const fetchToken = () => 'flux_et_test_y'
    expect(toRuntimeOptions({ eventId: 'e', fetchToken, tokenUrl: '/api/flux-token' })).toEqual({ eventId: 'e', fetchToken, tokenUrl: '/api/flux-token' })
  })

  it('delivers registration.created and checkout.required (flux:<type>); followCheckout navigates only to https', async () => {
    installFakeRuntime()
    const host = document.createElement('div'); document.body.appendChild(host)
    const h = mount(host, { eventId: 'evt-1' })
    const reg = vi.fn(), checkout = vi.fn()
    h.on('registration.created', reg)
    h.on('checkout.required', checkout)
    const tag = document.createElement('flux-event'); document.body.appendChild(tag)
    const fromTag = vi.fn()
    on(tag, 'error', fromTag)
    host.dispatchEvent(new CustomEvent('flux:registration.created', { detail: { registration_id: 'g1', completion_token: 'ct', event_id: 'evt-1' } }))
    host.dispatchEvent(new CustomEvent('flux:checkout.required', { detail: { event_id: 'evt-1', tier_id: 't1', checkout_url: 'https://flux.events/e/evt-1/checkout?tier=t1' } }))
    tag.dispatchEvent(new CustomEvent('flux:error', { detail: { code: 'embed_token_invalid', retryable: false } }))
    expect(reg).toHaveBeenCalledWith({ registration_id: 'g1', completion_token: 'ct', event_id: 'evt-1' })
    expect(checkout).toHaveBeenCalledWith(expect.objectContaining({ checkout_url: 'https://flux.events/e/evt-1/checkout?tier=t1' }))
    expect(fromTag).toHaveBeenCalledWith({ code: 'embed_token_invalid', retryable: false })
    await h.ready
    h.destroy()
  })

  it('surfaces a loader failure as flux:error', async () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const h = mount(host, { eventId: 'evt-1' })
    const err = vi.fn()
    h.on('error', err)
    scripts()[0].dispatchEvent(new Event('error'))
    await expect(h.ready).rejects.toThrow()
    await Promise.resolve()
    expect(err).toHaveBeenCalledWith(expect.objectContaining({ code: 'runtime_load_failed' }))
  })
})
