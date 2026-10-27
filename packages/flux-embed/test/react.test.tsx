// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FluxEvent } from '../src/react'

describe('<FluxEvent>', () => {
  it('mounts through the runtime and calls onRegistration / onCheckout', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const destroy = vi.fn()
    const mountSpy = vi.fn((el: HTMLElement, _opts?: Record<string, unknown>) => ({ el, iframe: null, open() {}, close() {}, destroy, prefill() {} }))
    window.Flux = { version: 1, protocol: 1, mount: mountSpy }
    const box = document.createElement('div'); document.body.appendChild(box)
    const onRegistration = vi.fn(), onCheckout = vi.fn()
    const root = createRoot(box)
    await act(async () => { root.render(<FluxEvent eventId="evt-1" token="flux_et_live_x" onRegistration={onRegistration} onCheckout={onCheckout} />) })
    const host = mountSpy.mock.calls[0][0]
    expect(mountSpy.mock.calls[0][1]).toMatchObject({ event: 'evt-1' })
    host.dispatchEvent(new CustomEvent('flux:registration.created', { detail: { event_id: 'evt-1' } }))
    host.dispatchEvent(new CustomEvent('flux:checkout.required', { detail: { checkout_url: 'https://flux.events/e/evt-1/checkout' } }))
    expect(onRegistration).toHaveBeenCalledWith({ event_id: 'evt-1' })
    expect(onCheckout).toHaveBeenCalledWith({ checkout_url: 'https://flux.events/e/evt-1/checkout' })
    await act(async () => { root.unmount() })
    expect(destroy).toHaveBeenCalled()
  })
})
