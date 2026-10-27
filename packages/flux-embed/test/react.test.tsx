// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FluxEvent } from '../src/react'

describe('<FluxEvent>', () => {
  it('mounts through window.FluxEmbed and calls onRegistration / onCheckout', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const destroy = vi.fn()
    const mountSpy = vi.fn((el: Element, _opts?: Record<string, unknown>) => ({ el, iframe: document.createElement('iframe'), destroy, ui() {}, prefill() {}, on: () => () => {} }))
    window.FluxEmbed = { version: 1, protocol: 1, mount: mountSpy, on: () => () => {}, destroy() {} }
    const box = document.createElement('div'); document.body.appendChild(box)
    const onRegistration = vi.fn(), onCheckout = vi.fn()
    const root = createRoot(box)
    await act(async () => { root.render(<FluxEvent eventId="evt-1" token="flux_et_live_x" onRegistration={onRegistration} onCheckout={onCheckout} />) })
    const host = mountSpy.mock.calls[0][0]
    expect(mountSpy.mock.calls[0][1]).toEqual({ eventId: 'evt-1', token: 'flux_et_live_x' })
    host.dispatchEvent(new CustomEvent('flux:registration.created', { detail: { registration_id: 'g1', completion_token: null, event_id: 'evt-1' } }))
    host.dispatchEvent(new CustomEvent('flux:checkout.required', { detail: { event_id: 'evt-1', tier_id: 't', checkout_url: 'https://flux.events/e/evt-1/checkout?tier=t' } }))
    expect(onRegistration).toHaveBeenCalledWith({ registration_id: 'g1', completion_token: null, event_id: 'evt-1' })
    expect(onCheckout).toHaveBeenCalledTimes(1)
    await act(async () => { root.unmount() })
    expect(destroy).toHaveBeenCalled()
  })
})
