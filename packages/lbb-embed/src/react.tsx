// @apptaptap/lbb-embed/react: <LBBSurvey slug token onCompleted onError />
import { useEffect, useRef, type CSSProperties } from 'react'
import { mount, type LBBEventMap, type LBBMountOptions } from './index'

export interface LBBSurveyProps extends Omit<LBBMountOptions, 'survey'> {
  /** Survey slug or SV_ key. */
  slug: string
  onReady?: (e: LBBEventMap['ready']) => void
  onCompleted?: (e: LBBEventMap['response.completed']) => void
  onError?: (e: LBBEventMap['error']) => void
  onResize?: (e: LBBEventMap['resize']) => void
  className?: string
  style?: CSSProperties
}

export function LBBSurvey(props: LBBSurveyProps) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const { slug, token, linkToken, mode, theme, accent, lang, runtimeUrl } = props
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { onReady, onCompleted, onError, onResize, className, style, ...rest } = latest.current
    void onReady; void onCompleted; void onError; void onResize; void className; void style
    const h = mount(el, { ...rest, survey: slug })
    const offs = [
      h.on('ready', (e) => latest.current.onReady?.(e)),
      h.on('response.completed', (e) => latest.current.onCompleted?.(e)),
      h.on('error', (e) => latest.current.onError?.(e)),
      h.on('resize', (e) => latest.current.onResize?.(e)),
    ]
    return () => { offs.forEach((off) => off()); h.destroy() }
  }, [slug, token, linkToken, mode, theme, accent, lang, runtimeUrl])
  return <div ref={ref} className={props.className} style={{ display: 'block', ...props.style }} />
}

export default LBBSurvey
