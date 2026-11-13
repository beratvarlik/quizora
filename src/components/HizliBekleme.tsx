import type { ReactNode } from 'react'

/** "Rakip aranıyor" radarı: dönen tarama çizgisi + dışa yayılan turuncu halkalar, ortada oyuncu. */
export function Radar({ children }: { children?: ReactNode }) {
  return (
    <div className="radar" aria-hidden="true">
      <span className="radar-izgara" />
      {[0, 1, 2].map(i => (
        <i key={i} className="radar-halka" style={{ '--d': i } as React.CSSProperties} />
      ))}
      <span className="radar-tarama" />
      <span className="radar-merkez">{children}</span>
    </div>
  )
}

const R = 92
const CEVRE = 2 * Math.PI * R

/**
 * Herkese açık lobide büyük başlama halkası. `kalanMs` / `toplamMs` oranında dolu;
 * `flas` her değiştiğinde (yeni oyuncu) halka kısa bir parlama yapar.
 */
export function BaslamaHalkasi({ kalanMs, toplamMs, flas }: { kalanMs: number; toplamMs: number; flas: number }) {
  const oran = Math.min(1, Math.max(0, kalanMs / toplamMs))
  const sn = Math.max(0, Math.ceil(kalanMs / 1000))
  return (
    <div className="bs-halka" role="timer" aria-label={`Yarış ${sn} saniye sonra başlıyor`}>
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <defs>
          <linearGradient id="bsGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFB15C" />
            <stop offset=".55" stopColor="#F15A24" />
            <stop offset="1" stopColor="#E0262B" />
          </linearGradient>
        </defs>
        <circle className="bs-iz" cx="110" cy="110" r={R} />
        <circle className="bs-ark" cx="110" cy="110" r={R} strokeDasharray={CEVRE} strokeDashoffset={CEVRE * (1 - oran)} />
      </svg>
      {flas > 0 && <span key={flas} className="bs-flas" aria-hidden="true" />}
      <div className="bs-ic">
        <b key={sn}>{sn}</b>
        <span>saniye</span>
      </div>
    </div>
  )
}
