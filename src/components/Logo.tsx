import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IkGeri } from './Ikon'
import SesButonu from './SesButonu'

/** "quizora." logosu: Outfit 800, mobilde 32px, web'de 38px; turuncu nokta yazıyla orantılı. Ana sayfaya götürür. */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`logo ${className}`} aria-label="Quizora ana sayfa">
      quizora<span className="logo-nokta">.</span>
    </Link>
  )
}

/** Yuvarlak geri butonu (40px daire, 44px dokunma alanı). */
export function GeriButonu({ onClick, etiket }: { onClick: () => void; etiket: string }) {
  return (
    <button type="button" className="geri-daire" aria-label={etiket} onClick={onClick}>
      <IkGeri />
    </button>
  )
}

/** Sayfa üst çubuğu: solda (isteğe bağlı geri +) logo, sağda isteğe bağlı öğe (adım, buton, rozet) + ses butonu. */
export function UstBar({ sag, geri, geriEtiket = 'Geri dön' }: { sag?: ReactNode; geri?: () => void; geriEtiket?: string }) {
  return (
    <header className="ust-bar">
      {geri ? (
        <div className="ust-sol">
          <GeriButonu onClick={geri} etiket={geriEtiket} />
          <Logo />
        </div>
      ) : (
        <Logo />
      )}
      <div className="ust-sag">
        {sag}
        <SesButonu />
      </div>
    </header>
  )
}
