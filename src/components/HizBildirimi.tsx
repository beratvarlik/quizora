import { useEffect, useRef, useState, type RefObject } from 'react'
import Avatar from './Avatar'

interface Props {
  /** 2×'i tetikleyen, ilk bitiren oyuncu. */
  bitiren: { ad: string; avatarKey: string | null; photoUrl?: string | null }
  /** "2×" yazısının uçarak yerleşeceği kalıcı rozet (FLIP hedefi). */
  hedef: RefObject<HTMLElement | null>
  /** Haptik hissi için 150ms sarsılacak alan (oyun ekranı). */
  sarsilacak?: RefObject<HTMLElement | null>
  onBitti: () => void
}

const azHareket = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 2× tetiklenme anı (~1.6 sn, bir kez): ekran hafif kararır, ortadan büyük "2×" pop eder,
 * arkasında şimşek ve dairesel ışık dalgası; altında bitiren oyuncu. Sonra "2×" küçülerek
 * rozetin yerine uçar (FLIP, sadece transform/opacity). Cevaplamayı engellemez (pointer-events: none);
 * ekrana dokunmak anı anında geçer. Hareketi azalt açıksa an hiç oynamaz.
 */
export default function HizBildirimi({ bitiren, hedef, sarsilacak, onBitti }: Props) {
  const yazi = useRef<HTMLSpanElement>(null)
  const [kalk, setKalk] = useState(false)
  const bitti = useRef(false)
  const onBittiRef = useRef(onBitti)
  onBittiRef.current = onBitti

  useEffect(() => {
    const bitir = () => { if (!bitti.current) { bitti.current = true; onBittiRef.current() } }
    if (azHareket()) { bitir(); return }

    // Haptik hissi: 150ms hafif sarsıntı
    sarsilacak?.current?.animate(
      [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(3px,-2px)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(0,0)' }],
      { duration: 150, easing: 'linear' },
    )

    // FLIP: büyük "2×"in şimdiki yerinden rozetin yerine uç
    const uc = () => {
      setKalk(true)
      const el = yazi.current, h = hedef.current
      if (!el || !h) { bitir(); return }
      const a = el.getBoundingClientRect(), b = h.getBoundingClientRect()
      const dx = b.left + b.width / 2 - (a.left + a.width / 2)
      const dy = b.top + b.height / 2 - (a.top + a.height / 2)
      const s = Math.max(.12, (b.height * .9) / a.height)
      el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .4 }],
        { duration: 420, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' })
      zaman.push(window.setTimeout(bitir, 420))
    }
    const zaman = [window.setTimeout(uc, 1180)]
    // Dokununca anında geç (tıklama yine de alttaki şıkka ulaşır)
    const gec = () => { zaman.forEach(clearTimeout); bitir() }
    window.addEventListener('pointerdown', gec, { once: true })
    return () => { zaman.forEach(clearTimeout); window.removeEventListener('pointerdown', gec) }
  }, [hedef, sarsilacak])

  return (
    <div className={`hiz-ani${kalk ? ' kalk' : ''}`} role="status" aria-live="assertive">
      <div className="ha-perde" />
      <div className="ha-merkez">
        <span className="ha-dalga" />
        <svg className="ha-simsek" viewBox="0 0 120 220" aria-hidden="true">
          <polyline points="70,0 48,78 72,84 38,160 60,164 34,220" />
        </svg>
        <span ref={yazi} className="ha-yazi">2×</span>
        <span className="ha-kim">
          <Avatar avatarKey={bitiren.avatarKey} photoUrl={bitiren.photoUrl} ad={bitiren.ad} boyut={32} className="ha-av" />
          {bitiren.ad} bitirdi
        </span>
      </div>
    </div>
  )
}
