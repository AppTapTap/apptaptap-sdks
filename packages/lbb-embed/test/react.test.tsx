// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LBBSurvey } from '../src/react'

describe('<LBBSurvey>', () => {
  it('mounts through the runtime and calls onCompleted', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const destroy = vi.fn()
    const mountSpy = vi.fn((el: HTMLElement) => ({ el, iframe: null, open() {}, close() {}, destroy, prefill() {}, ui() {} }))
    window.LBB = { version: 1, protocol: 1, mount: mountSpy, ui() {}, on: () => () => {}, destroy() {} }
    const box = document.createElement('div'); document.body.appendChild(box)
    const onCompleted = vi.fn()
    const root = createRoot(box)
    await act(async () => { root.render(<LBBSurvey slug="nps-q4" token="lbb_et_live_x" onCompleted={onCompleted} />) })
    expect(mountSpy).toHaveBeenCalledTimes(1)
    const host = mountSpy.mock.calls[0][0]
    host.dispatchEvent(new CustomEvent('lbb:response.completed', { detail: { session_id: 'S1' } }))
    expect(onCompleted).toHaveBeenCalledWith({ session_id: 'S1' })
    await act(async () => { root.unmount() })
    expect(destroy).toHaveBeenCalled()
  })
})
