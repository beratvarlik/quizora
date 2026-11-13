import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { SES } from '../hooks/useSes'

type Tur = 'ana' | 'iki' | 'uc'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** ana: turuncu zemin + ink yazı · iki: bordo zemin + krem yazı · uc: ince bordo kenarlı */
  tur?: Tur
  /** Tam genişlik (varsayılan). */
  blok?: boolean
  ikonSol?: ReactNode
  ikonSag?: ReactNode
}

/** "Arcade" tuşu: altında 4px koyu katı gölge, basınca 4px aşağı iner. Dokunma hedefi ≥56px. */
export default function Button({ tur = 'ana', blok = true, ikonSol, ikonSag, className = '', children, type = 'button', onClick, ...rest }: Props) {
  return (
    <button
      type={type}
      className={`btn btn-${tur}${blok ? ' btn-blok' : ''} ${className}`}
      onClick={e => {
        SES.efekt('tik')
        onClick?.(e)
      }}
      {...rest}
    >
      {ikonSol}
      {children}
      {ikonSag}
    </button>
  )
}
