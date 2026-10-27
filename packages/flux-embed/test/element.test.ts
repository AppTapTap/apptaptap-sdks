// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, register, RUNTIME_URL, type FluxRuntime } from '../src/index'

function installFakeRuntime() {
  const rt: FluxRuntime = {
    version: 1, protocol: 1,
    mount: vi.fn((el: HTMLElement) => ({ el, iframe: null, open: vi.fn(), close: vi.fn(), destroy: vi.fn(), prefill: vi.fn() })),
  }
  window.Flux = rt
  if (!customElements.get('flux-event')) customElements.define('flux-event', class extends HTMLElement {})
  return rt
}
const scripts = () => Array.from(document.querySelectorAll('script')).filter((s) => s.src === RUNTIME_URL)
afterEach(() => { delete window.Flux; document.body.innerHTML = ''; scripts().forEach((s) => s.remove()) })

describe('browser entry', () => {
  it('injects https://flux.events/embed/v1/flux.js exactly once and registers <flux-event>', async () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const a = register()
    const h = mount(host, { event: 'evt-1', token: 'flux_et_live_x', prefill: { name: 'Ada' } })
    void register()
    expect(scripts()).toHaveLength(1)
    const rt = installFakeRuntime()
    scripts()[0].dispatchEvent(new Event('load'))
    await expect(a).resolves.toBe(rt)
    await h.ready
    expect(customElements.get('flux-event')).toBeDefined()
    const [, opts] = (rt.mount as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts).toMatchObject({ event: 'evt-1', prefill: { name: 'Ada' } })
    expect(await (opts.fetchToken as () => string)()).toBe('flux_et_live_x')
  })

  it('delivers registration.created and checkout.required; followCheckout navigates only to https', async () => {
    installFakeRuntime()
    const host = document.createElement('div'); document.body.appendChild(host)
    const h = mount(host, { event: 'evt-1' })
    const reg = vi.fn(), checkout = vi.fn()
    h.on('registration.created', reg)
    h.on('checkout.required', checkout)
    host.dispatchEvent(new CustomEvent('flux:registration.created', { detail: { event_id: 'evt-1', guest_id: 'g1', completion_token: 'ct' } }))
    host.dispatchEvent(new CustomEvent('flux:checkout.required', { detail: { checkout_url: 'https://flux.events/e/evt-1/checkout?tier=t1' } }))
    expect(reg).toHaveBeenCalledWith({ event_id: 'evt-1', guest_id: 'g1', completion_token: 'ct' })
    expect(checkout).toHaveBeenCalledWith({ checkout_url: 'https://flux.events/e/evt-1/checkout?tier=t1' })
    await h.ready
    h.destroy()
  })
})
