// @apptaptap/flux-embed/react: <FluxEvent eventId token onRegistration onCheckout onError />
import { useEffect, useRef, type CSSProperties } from 'react'
import { mount, type FluxEventMap, type FluxMountOptions } from './index'

export interface FluxEventProps extends Omit<FluxMountOptions, 'event'> {
  /** Event id (UUID) or slug. */
  eventId: string
  onReady?: (e: FluxEventMap['ready']) => void
  onRegistration?: (e: FluxEventMap['registration.created']) => void
  /** Priced ticket: send the buyer to e.checkout_url (or set followCheckout). */
  onCheckout?: (e: FluxEventMap['checkout.required']) => void
  onError?: (e: FluxEventMap['error']) => void
  onResize?: (e: FluxEventMap['resize']) => void
  className?: string
  style?: CSSProperties
}

export function FluxEvent(props: FluxEventProps) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const { eventId, token, mode, theme, accent, lang, runtimeUrl, followCheckout } = props
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { onReady, onRegistration, onCheckout, onError, onResize, className, style, ...rest } = latest.current
    void onReady; void onRegistration; void onCheckout; void onError; void onResize; void className; void style
    const h = mount(el, { ...rest, event: eventId })
    const offs = [
      h.on('ready', (e) => latest.current.onReady?.(e)),
      h.on('registration.created', (e) => latest.current.onRegistration?.(e)),
      h.on('checkout.required', (e) => latest.current.onCheckout?.(e)),
      h.on('error', (e) => latest.current.onError?.(e)),
      h.on('resize', (e) => latest.current.onResize?.(e)),
    ]
    return () => { offs.forEach((off) => off()); h.destroy() }
  }, [eventId, token, mode, theme, accent, lang, runtimeUrl, followCheckout])
  return <div ref={ref} className={props.className} style={{ display: 'block', ...props.style }} />
}

export default FluxEvent
