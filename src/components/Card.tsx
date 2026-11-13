import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Üstte bordo bant içeriği (ör. "Canlı sıralama"). */
  bant?: ReactNode
  /** Bandın sağ köşesindeki ikincil yazı. */
  bantSag?: ReactNode
}

/** Beyaz kart: 18px köşe, hafif bordo tonlu gölge, isteğe bağlı bordo üst bant. */
export default function Card({ bant, bantSag, className = '', children, ...rest }: Props) {
  return (
    <div className={`kart ${className}`} {...rest}>
      {bant !== undefined && (
        <div className="kart-bant">
          {bant}
          {bantSag !== undefined && <span className="sag">{bantSag}</span>}
        </div>
      )}
      {children}
    </div>
  )
}
