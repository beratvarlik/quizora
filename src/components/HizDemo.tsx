import { useEffect, useRef, useState } from 'react'
import type { PlayerState } from '../types'
import Button from './Button'
import CanliSerit from './CanliSerit'
import HizBildirimi from './HizBildirimi'
import HizRozeti from './HizRozeti'
import SureHalkasi from './SureHalkasi'

/** Geçici vitrin demosu: 5 oyunculu 2× durumu (oyun ekranı B3/B4'te bu bileşenleri kullanacak). */
const oyuncu = (userId: string, displayName: string, avatarKey: string, score: number, currentQ: number, finished = false, totalTimeMs = 0): PlayerState =>
  ({ userId, displayName, avatarKey, photoUrl: null, score, currentQ, correctCount: 0, wrongCount: 0, finished, totalTimeMs, rankKey: 'caylak', rankLabel: 'Çaylak' })
const ILK: PlayerState[] = [
  oyuncu('elif', 'Elif', 'avatar-7', 1105, 10, true, 98000),
  oyuncu('ben', 'Deniz', 'avatar-3', 775, 7),
  oyuncu('mert', 'Mert', 'avatar-2', 690, 7),
  oyuncu('kaan', 'Kaan', 'avatar-5', 610, 7),
  oyuncu('zeynep', 'Zeynep', 'avatar-6', 540, 6),
]

export default function HizDemo() {
  const kap = useRef<HTMLDivElement>(null)
  const rozet = useRef<HTMLSpanElement>(null)
  const [oyuncular, setOyuncular] = useState(ILK)
  const [kalan, setKalan] = useState(24000)
  const [ani, setAni] = useState(false) // "2× anını oynat" ile tetiklenir
  const [anahtar, setAnahtar] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => setKalan(k => (k <= 0 ? 24000 : Math.max(0, k - 200))), 100) // 2× hız
    return () => window.clearInterval(t)
  }, [])

  // Simüle et: bir bot öndekini sollar, bazen başka biri yanlış yapar
  const simule = () => setOyuncular(liste => {
    const sirali = [...liste].sort((a, b) => b.score - a.score)
    const aday = sirali.filter((p, i) => i > 0 && p.userId !== 'ben' && !p.finished)
    if (!aday.length) return ILK
    const o = aday[Math.floor(Math.random() * aday.length)], i = sirali.indexOf(o)
    const hedef = sirali[Math.max(0, i - 1)]
    const yeni = hedef.score + 15 + Math.round(Math.random() * 60)
    const diger = aday.filter(p => p !== o)
    const yanlis = diger.length && Math.random() < .5 ? diger[Math.floor(Math.random() * diger.length)].userId : null
    return liste.map(p => p.userId === o.userId ? { ...p, score: yeni, currentQ: Math.min(9, p.currentQ + 1) }
      : p.userId === yanlis ? { ...p, score: Math.max(0, p.score - 25), currentQ: Math.min(9, p.currentQ + 1) } : p)
  })

  return (
    <div ref={kap} className="oyun-demo">
      <div className="flex items-center gap-3">
        <SureHalkasi kalanMs={kalan} hizli />
        <HizRozeti ref={rozet} gizli={ani} />
        <div className="ml-auto text-right">
          <b className="block font-baslik text-[26px] leading-none font-extrabold">775</b>
          <span className="etiket" style={{ color: 'rgba(245,242,237,.72)' }}>Puan</span>
        </div>
      </div>
      <div className="-mx-4 mt-2">
        <CanliSerit oyuncular={oyuncular} benId="ben" koyu hizli />
      </div>
      <div className="mt-3 flex gap-2">
        <Button tur="uc" blok={false} className="flex-1" onClick={() => { setAni(true); setAnahtar(a => a + 1) }}>2× anını oynat</Button>
        <Button tur="ana" blok={false} className="flex-1" onClick={simule}>Simüle et</Button>
      </div>
      {ani && (
        <HizBildirimi key={anahtar} bitiren={{ ad: 'Elif', avatarKey: 'avatar-7' }} hedef={rozet} sarsilacak={kap} onBitti={() => setAni(false)} />
      )}
    </div>
  )
}
