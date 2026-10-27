// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, on, register, RUNTIME_URL, type LBBRuntime } from '../src/index'

/** Stands in for the hosted loader: defines window.LBB + <lbb-survey>, as embed-v1.src.js does. */
function installFakeRuntime() {
  const instance = { el: null as unknown as HTMLElement, iframe: null, open: vi.fn(), close: vi.fn(), destroy: vi.fn(), prefill: vi.fn(), ui: vi.fn() }
  const rt: LBBRuntime = { version: 1, protocol: 1, mount: vi.fn((el: HTMLElement) => ({ ...instance, el })), ui: vi.fn(), on: vi.fn(), destroy: vi.fn() }
  window.LBB = rt
  if (!customElements.get('lbb-survey')) customElements.define('lbb-survey', class extends HTMLElement {})
  return rt
}
const scripts = () => Array.from(document.querySelectorAll('script')).filter((s) => s.src === RUNTIME_URL)

afterEach(() => { delete window.LBB; document.body.innerHTML = ''; scripts().forEach((s) => s.remove()) })

describe('browser entry', () => {
  it('injects the hosted loader exactly once and resolves when it registers <lbb-survey>', async () => {
    const a = register()
    const b = register()
    const host = document.createElement('div'); document.body.appendChild(host)
    const h = mount(host, { survey: 'nps-q4', token: 'lbb_et_live_x' })
    expect(scripts()).toHaveLength(1)
    expect(scripts()[0].async).toBe(true)
    expect(customElements.get('lbb-survey')).toBeUndefined()
    const rt = installFakeRuntime()
    scripts()[0].dispatchEvent(new Event('load'))
    await expect(a).resolves.toBe(rt)
    await expect(b).resolves.toBe(rt)
    await h.ready
    expect(customElements.get('lbb-survey')).toBeDefined()
    expect(rt.mount).toHaveBeenCalledTimes(1)
    const [el, opts] = (rt.mount as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(el).toBe(host)
    expect(opts.survey).toBe('nps-q4')
    expect(await (opts.fetchToken as () => string)()).toBe('lbb_et_live_x') // fragment token, via the loader's fetchToken
    expect(opts).not.toHaveProperty('token') // token= on the loader means a personal-link token, not an embed token
    // Already loaded: no new tag.
    await register()
    expect(scripts()).toHaveLength(1)
  })

  it('delivers typed events from the lbb:<type> CustomEvents the loader dispatches', async () => {
    installFakeRuntime()
    const host = document.createElement('div'); document.body.appendChild(host)
    const h = mount(host, { survey: 's' })
    const done = vi.fn()
    h.on('response.completed', done)
    const tag = document.createElement('lbb-survey'); document.body.appendChild(tag)
    const fromTag = vi.fn()
    on(tag, 'error', fromTag)
    host.dispatchEvent(new CustomEvent('lbb:response.completed', { detail: { session_id: 'S1', completion_token: 'ct' } }))
    tag.dispatchEvent(new CustomEvent('lbb:error', { detail: { code: 'survey_closed', retryable: false } }))
    expect(done).toHaveBeenCalledWith({ session_id: 'S1', completion_token: 'ct' })
    expect(fromTag).toHaveBeenCalledWith({ code: 'survey_closed', retryable: false })
    await h.ready
    h.destroy()
  })

  it('surfaces a loader failure as an lbb:error event', async () => {
    const host = document.createElement('div'); document.body.appendChild(host)
    const h = mount(host, { survey: 's' })
    const err = vi.fn()
    h.on('error', err)
    scripts()[0].dispatchEvent(new Event('error'))
    await expect(h.ready).rejects.toThrow()
    await Promise.resolve()
    expect(err).toHaveBeenCalledWith(expect.objectContaining({ code: 'runtime_load_failed' }))
  })
})
