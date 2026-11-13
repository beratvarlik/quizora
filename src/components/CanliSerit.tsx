import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { PlayerState } from '../types'
import { rankPlayers } from '../lib/scoring'
import Avatar from './Avatar'

interface Props {
  oyuncular: PlayerState[]
  benId: string
  /** Gece zemini (2× modu ve koyu ekranlar). */
  koyu?: boolean
  /** 2× modu: pist ışığı hızlanır, liderin halesi alevlenir, halkalarda elektrik titreşimi. */
  hizli?: boolean
  toplamSoru?: number
}

const TAC = (
  <svg viewBox="0 0 50 34" aria-hidden="true">
    <path d="M4 30 L2 8 L15 18 L25 2 L35 18 L48 8 L46 30 Z" fill="#F15A24" stroke="#2B0E17" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
)
const TIK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
/** İsimler en fazla 6 karakter: 5 harf + "…" ("Zeynep" → "Zeyne…") */
const kisalt = (s: string) => (s.length > 5 ? s.slice(0, 5) + '…' : s)
const AZ = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const yeniden = (el: Element | null, cls: string) => { if (!el) return; el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls) }

/**
 * Canlı sıralama şeridi: kutusuz, avatarlar arka planın üstünde yüzer. Avatarın halkası = soru ilerlemesi.
 * Sıra değişince öne geçen yay çizerek atlar (konum yalnızca transform ile değişir), ▲/▼ 1 sn görünür,
 * puan değişince halka yeşil/kırmızı parlar ve "+puan" / "−25" uçar.
 */
export default function CanliSerit({ oyuncular, benId, koyu = false, hizli = false, toplamSoru = 10 }: Props) {
  const kok = useRef<HTMLDivElement>(null)
  const [genislik, setGenislik] = useState(0)
  // İlk ölçüm yapılana kadar konum geçişi kapalı: açılışta avatarlar üst üste başlayıp kaymasın
  const [hazir, setHazir] = useState(false)
  const once = useRef(new Map<string, { rank: number; score: number }>())
  const sirali = useMemo(() => rankPlayers(oyuncular), [oyuncular])
  const n = sirali.length
  const avatarBoy = n >= 5 ? 40 : 48
  const halkaBoy = avatarBoy + 12
  const slot = genislik ? (genislik - 16) / Math.max(1, n) : 0

  useLayoutEffect(() => {
    const el = kok.current; if (!el) return
    const ro = new ResizeObserver(([g]) => setGenislik(g.contentRect.width))
    ro.observe(el); setGenislik(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!slot || hazir) return
    const r = requestAnimationFrame(() => setHazir(true))
    return () => cancelAnimationFrame(r)
  }, [slot, hazir])

  // Sıra / puan değişiminde efektleri tetikle (DOM sınıflarıyla; React yeniden çizmez)
  useLayoutEffect(() => {
    const el = kok.current; if (!el || !slot) return
    const az = AZ()
    sirali.forEach(p => {
      const eski = once.current.get(p.userId)
      const o = el.querySelector<HTMLElement>(`[data-id="${p.userId}"]`)
      if (!eski || !o) return
      if (eski.rank !== p.rank) {
        const yukari = p.rank < eski.rank
        yeniden(o.querySelector('.cs-sira'), 'pop')
        const ok = o.querySelector<HTMLElement>('.cs-ok')
        if (ok) { ok.textContent = yukari ? '▲' : '▼'; ok.className = 'cs-ok ' + (yukari ? 'yukari' : 'asagi'); yeniden(ok, 'goster') }
        if (!az) {
          yeniden(o.querySelector('.cs-zip'), yukari ? 'atla' : 'egil')
          if (yukari) { // öne geçenin arkasında kısa kıvılcım izi
            const iz = document.createElement('span'); iz.className = 'cs-izi'
            const x0 = 8 + slot * (p.rank - 1) + slot / 2, x1 = 8 + slot * (eski.rank - 1) + slot / 2
            iz.style.cssText = `left:${x0}px;width:${x1 - x0}px;top:${18 + halkaBoy / 2}px`
            el.appendChild(iz); window.setTimeout(() => iz.remove(), 700)
          }
        }
      }
      const d = p.score - eski.score
      if (d !== 0) {
        const avk = o.querySelector('.cs-av-kap')
        if (avk) {
          avk.classList.remove('dogru', 'yanlis'); void (avk as HTMLElement).offsetWidth; avk.classList.add(d > 0 ? 'dogru' : 'yanlis')
          window.setTimeout(() => avk.classList.remove('dogru', 'yanlis'), 800)
          const u = document.createElement('span'); u.className = 'cs-ucan ' + (d > 0 ? 'art' : 'eks')
          u.textContent = d > 0 ? `+${d}` : `−${-d}`; avk.appendChild(u); window.setTimeout(() => u.remove(), 1000)
        }
      }
    })
    once.current = new Map(sirali.map(p => [p.userId, { rank: p.rank, score: p.score }]))
  }, [sirali, slot, halkaBoy])

  const merkez = (i: number) => 8 + slot * i + slot / 2
  const pistY = 18 + halkaBoy / 2 // .cs-zip padding-top + halka yarıçapı
  return (
    <div ref={kok} className={`cs${koyu ? ' cs-koyu' : ''}${hizli ? ' cs-hizli' : ''}${hazir ? ' hazir' : ''}`} style={{ '--slot': `${slot}px`, '--av': `${avatarBoy}px`, '--halka': `${halkaBoy}px` } as CSSProperties}>
      {slot > 0 && (
        <div className={`devre cs-pist${koyu ? ' koyu' : ''}`} aria-hidden="true" style={{ inset: 0, '--devre-hiz': hizli ? 2.5 : 1 } as CSSProperties}>
          <svg>
            <path className="iz" d={`M${merkez(n - 1)} ${pistY} H${merkez(0)}`} />
            <g className="isiklar"><path className="isik" pathLength={100} d={`M${merkez(n - 1)} ${pistY} H${merkez(0)}`} style={{ '--s': '2.6s', '--g': '0s' } as CSSProperties} /></g>
          </svg>
        </div>
      )}
      <ol className="cs-liste" aria-label="Canlı sıralama">
        {sirali.map(p => {
          const ben = p.userId === benId
          const ilerleme = p.finished ? 1 : Math.min(1, p.currentQ / toplamSoru)
          return (
            <li key={p.userId} data-id={p.userId}
              className={`cs-oyuncu${ben ? ' ben' : ''}${p.rank === 1 ? ' lider' : ''}${p.finished ? ' bitti' : ''}`}
              style={{ transform: `translateX(${8 + slot * (p.rank - 1)}px)` }}>
              <div className="cs-zip">
                <div className="cs-av-kap">
                  <span className="cs-hale" />
                  <svg className="cs-halka" viewBox="0 0 64 64" aria-hidden="true">
                    <circle className="cs-iz" cx="32" cy="32" r="29" />
                    <circle className="cs-dolu" cx="32" cy="32" r="29" pathLength={100} style={{ strokeDashoffset: 100 - ilerleme * 100 }} />
                    <circle className="cs-elektrik" cx="32" cy="32" r="31.5" />
                  </svg>
                  <span className="cs-dalga" />
                  <Avatar avatarKey={p.avatarKey} photoUrl={p.photoUrl} ad={p.displayName} boyut={avatarBoy} ben={ben} />
                  <span className="cs-sira">{p.rank}</span>
                  <span className="cs-tac">{TAC}</span>
                  {p.finished && <span className="cs-tik" aria-label="bitirdi">{TIK}</span>}
                </div>
                <span className="cs-puan">{p.score.toLocaleString('tr-TR')}</span>
                <span className="cs-ad" title={p.displayName}>{ben ? 'Sen' : kisalt(p.displayName)}</span>
              </div>
              <span className="cs-ok" aria-hidden="true" />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
