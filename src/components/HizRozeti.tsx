import type { Ref } from 'react'

/** Kalıcı 2× göstergesi: süre halkasının yanında yüzen hap. Yarı saydam koyu + blur, turuncu ince kenar, şimşek ikonu. */
export default function HizRozeti({ ref, gizli = false }: { ref?: Ref<HTMLSpanElement>; gizli?: boolean }) {
  return (
    <span ref={ref} className={`hiz-rozeti${gizli ? ' gizli' : ''}`} role="status" aria-label="Süre 2 kat hızlı akıyor">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.5 2 5 13.5h6L10 22l9-12h-6.2L13.5 2z" />
      </svg>
      2×
    </span>
  )
}
