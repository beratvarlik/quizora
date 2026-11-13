import { useEffect, useRef, useState } from 'react'
import { useSes } from '../hooks/useSes'

function Hoparlor({ kapali }: { kapali: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity=".15" />
      {kapali ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
    </svg>
  )
}

/**
 * Üst çubuktaki hoparlör: dokun → tüm sesler aç/kapa; uzun bas (ya da sağ tık) → "Müzik" ve
 * "Efektler" anahtarları. Ayarlar localStorage'da saklanır.
 */
export default function SesButonu({ koyu = false }: { koyu?: boolean }) {
  const { ayar, ayarDegis } = useSes()
  const [acik, setAcik] = useState(false)
  const zaman = useRef<number | null>(null)
  const uzun = useRef(false)
  const kap = useRef<HTMLDivElement>(null)
  const hepsiKapali = !ayar.muzik && !ayar.efekt

  useEffect(() => {
    if (!acik) return
    const kapat = (e: PointerEvent) => {
      if (!kap.current?.contains(e.target as Node)) setAcik(false)
    }
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && setAcik(false)
    window.addEventListener('pointerdown', kapat)
    window.addEventListener('keydown', tus)
    return () => {
      window.removeEventListener('pointerdown', kapat)
      window.removeEventListener('keydown', tus)
    }
  }, [acik])

  const temizle = () => {
    if (zaman.current !== null) window.clearTimeout(zaman.current)
    zaman.current = null
  }

  return (
    <div className="ses-kap" ref={kap}>
      <button
        type="button"
        className={`ses-btn${koyu ? ' koyu' : ''}`}
        aria-label={hepsiKapali ? 'Sesi aç (uzun bas: ayarlar)' : 'Sesi kapat (uzun bas: ayarlar)'}
        aria-haspopup="menu"
        aria-expanded={acik}
        onPointerDown={() => {
          uzun.current = false
          temizle()
          zaman.current = window.setTimeout(() => {
            uzun.current = true
            setAcik(true)
          }, 450)
        }}
        onPointerUp={temizle}
        onPointerLeave={temizle}
        onPointerCancel={temizle}
        onContextMenu={e => {
          e.preventDefault()
          uzun.current = true
          setAcik(true)
        }}
        onClick={() => {
          if (uzun.current) {
            uzun.current = false
            return
          }
          ayarDegis(hepsiKapali ? { muzik: true, efekt: true } : { muzik: false, efekt: false })
        }}
      >
        <Hoparlor kapali={hepsiKapali} />
      </button>
      {acik && (
        <div className="ses-menu" role="menu" aria-label="Ses ayarları">
          {(
            [
              ['muzik', 'Müzik'],
              ['efekt', 'Efektler'],
            ] as const
          ).map(([k, ad]) => (
            <button key={k} type="button" role="menuitemcheckbox" aria-checked={ayar[k]} className="ses-anahtar" onClick={() => ayarDegis({ [k]: !ayar[k] })}>
              <span>{ad}</span>
              <span className={`anahtar${ayar[k] ? ' acik' : ''}`} aria-hidden="true">
                <i />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
