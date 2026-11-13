import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** "quizora." logosu: Outfit 800, mobilde 32px, web'de 38px; turuncu nokta yazıyla orantılı. Ana sayfaya götürür. */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`logo ${className}`} aria-label="Quizora ana sayfa">
      quizora<span className="logo-nokta">.</span>
    </Link>
  )
}

/** Sayfa üst çubuğu: solda logo, sağda isteğe bağlı öğe (adım, buton, rozet); dikeyde ortalı. */
export function UstBar({ sag }: { sag?: ReactNode }) {
  return (
    <header className="ust-bar">
      <Logo />
      {sag}
    </header>
  )
}
