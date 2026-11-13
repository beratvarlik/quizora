import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLSpanElement> {
  /** Bordo dolgu + krem yazı (seçili / vurgulu). */
  dolu?: boolean
  /** Küçük boy (24px, ör. "HOST"). */
  kucuk?: boolean
  ikon?: ReactNode
}

/** Hap biçimli etiket. Zemini opak (krem), arkadan devre hattı geçse de yazı temiz kalır. */
export default function Cip({ dolu = false, kucuk = false, ikon, className = '', children, ...rest }: Props) {
  return (
    <span className={`cip${dolu ? ' cip-dolu' : ''}${kucuk ? ' cip-k' : ''} ${className}`} {...rest}>
      {ikon}
      {children}
    </span>
  )
}
