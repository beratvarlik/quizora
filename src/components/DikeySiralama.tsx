import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { rankPlayers } from '../lib/scoring'
import type { PlayerState } from '../types'
import Avatar from './Avatar'
import { IkBayrak } from './Ikon'

// Satır düzeni (px; web.css ile aynı): 0-20 ad+puan, 20-38 taç, 30-82 avatar (şerit ortası 56), 88-94 noktalar.
const SATIR = 96
const BOSLUK = 26
const SLOT = SATIR + BOSLUK
const AV = 52
const SOL = 30 // sıra rozeti alanı
const SAG = 24 // bitiş bayrağı alanı
const MIN_ODAK = 400 // ölçek: max(lider puanı, 400)

type Sonuc = 'd' | 'y' | 'b'
interface Iz { skor: number; dogru: number; yanlis: number; q: number; sira: number; gecmis: Sonuc[]; k: number; delta: number; sars: number; sol: number }

const TAC = (
  <svg viewBox="0 0 50 34" aria-hidden="true">
    <path d="M4 30 L2 8 L15 18 L25 2 L35 18 L48 8 L46 30 Z" fill="#F15A24" stroke="#2B0E17" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
)
const AZ = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const temizAd = (s: string) => s.replace(/\s*\(bot\)\s*$/i, '')
const tahmin = (p: PlayerState): Sonuc[] => {
  const bos = Math.max(0, p.currentQ - p.correctCount - p.wrongCount)
  return [...Array(p.correctCount).fill('d'), ...Array(p.wrongCount).fill('y'), ...Array(bos).fill('b')]
}

/** Puan sayarak artar (azaltılmış harekette doğrudan). */
function Sayac({ deger }: { deger: number }) {
  const [g, setG] = useState(deger)
  const onceki = useRef(deger)
  useEffect(() => {
    const bas = onceki.current
    onceki.current = deger
    if (bas === deger || AZ()) {
      setG(deger)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const adim = (t: number) => {
      const f = Math.min(1, (t - t0) / 500)
      setG(Math.round(bas + (deger - bas) * (1 - (1 - f) ** 3)))
      if (f < 1) raf = requestAnimationFrame(adim)
    }
    raf = requestAnimationFrame(adim)
    return () => cancelAnimationFrame(raf)
  }, [deger])
  return <>{g.toLocaleString('tr-TR')}</>
}

/**
 * Web (≥1024px) oyun ekranının sağındaki canlı sıralama: "yarış pisti". Her oyuncunun ince bir şeridi var,
 * avatarı puanına göre ilerler (translateX). Sıra değişince şeritler slotlar arasında kayar (translateY).
 * Mobilde gizlidir (orada CanliSerit var). Yalnızca transform ve opacity anime edilir.
 */
export default function DikeySiralama({ oyuncular, benId, toplamSoru = 10 }: { oyuncular: PlayerState[]; benId: string; toplamSoru?: number }) {
  const sirali = rankPlayers(oyuncular)
  const sira = new Map(sirali.map((p, i) => [p.userId, i]))
  const liste = useRef<HTMLOListElement>(null)
  const [genislik, setGenislik] = useState(300)
  const [iz, setIz] = useState<Record<string, Iz>>({})

  useLayoutEffect(() => {
    const el = liste.current
    if (!el) return
    const olc = () => setGenislik(el.clientWidth || 300)
    olc()
    const ro = new ResizeObserver(olc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Önceki duruma göre olaylar: puan farkı, yanlış (sarsıntı), sollama, cevap geçmişi
  const imza = oyuncular.map(p => `${p.userId}:${p.score}:${p.currentQ}:${p.correctCount}:${p.wrongCount}`).join('|')
  useEffect(() => {
    setIz(onceki => {
      const yeni: Record<string, Iz> = {}
      for (const p of oyuncular) {
        const o = onceki[p.userId]
        const s = sira.get(p.userId) ?? 0
        if (!o) {
          yeni[p.userId] = { skor: p.score, dogru: p.correctCount, yanlis: p.wrongCount, q: p.currentQ, sira: s, gecmis: tahmin(p), k: 0, delta: 0, sars: 0, sol: 0 }
          continue
        }
        const gecmis = [...o.gecmis]
        let d = p.correctCount - o.dogru
        let y = p.wrongCount - o.yanlis
        for (let i = o.q; i < p.currentQ; i++) {
          if (d > 0) (gecmis.push('d'), d--)
          else if (y > 0) (gecmis.push('y'), y--)
          else gecmis.push('b')
        }
        const delta = p.score - o.skor
        yeni[p.userId] = {
          skor: p.score, dogru: p.correctCount, yanlis: p.wrongCount, q: p.currentQ, sira: s, gecmis,
          k: delta !== 0 ? o.k + 1 : o.k,
          delta: delta !== 0 ? delta : o.delta,
          sars: p.wrongCount > o.yanlis ? o.sars + 1 : o.sars,
          sol: s < o.sira ? o.sol + 1 : o.sol,
        }
      }
      return yeni
    })
    // imza, oyuncuların görünür alanlarını kapsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imza])

  const pistG = Math.max(120, genislik - SOL - SAG)
  const menzil = pistG - AV
  const lider = sirali[0]
  const olcek = Math.max(lider?.score ?? 0, MIN_ODAK)
  const xBul = (p: PlayerState) => (p.finished ? menzil : Math.round((Math.max(0, Math.min(p.score, olcek)) / olcek) * menzil))
  const liderX = lider ? xBul(lider) : 0

  return (
    <aside className="dikey-siralama" aria-label="Canlı sıralama">
      <div className="ds-ust">
        <span className="canli" />
        <span className="etiket">Canlı sıralama</span>
      </div>
      <ol ref={liste} className="ds-liste" style={{ height: Math.max(0, oyuncular.length * SLOT - BOSLUK) }}>
        {oyuncular.map(p => {
          const i = sira.get(p.userId) ?? 0
          const ben = p.userId === benId
          const r = sirali[i]?.rank ?? i + 1
          const birinci = i === 0 && p.score > 0
          const x = xBul(p)
          const z = iz[p.userId]
          const gecmis = z?.gecmis ?? tahmin(p)
          const sagaYasla = x + AV / 2 > pistG / 2
          return (
            <li
              key={p.userId}
              className={`ds-satir${ben ? ' ben' : ''}${birinci ? ' ds-lider' : ''}${p.finished ? ' bitti' : ''}`}
              style={{ transform: `translateY(${i * SLOT}px)` }}
            >
              <span key={`r${z?.sol ?? 0}`} className={`ds-no${z?.sol ? ' pop' : ''}`}>{r}</span>
              <span className="ds-pist" aria-hidden="true">
                <span className="ds-dolgu" style={{ transform: `translateX(calc(-100% + ${x + AV / 2}px))` }}>
                  {z && z.k > 0 && z.delta > 0 && <span key={`w${z.k}`} className="ds-dalga" />}
                </span>
              </span>
              <span className="ds-bayrak" aria-hidden="true"><IkBayrak boyut={18} /></span>
              <span className="ds-kosucu" style={{ transform: `translateX(${SOL + x}px)` }}>
                <span className={`ds-etiket${sagaYasla ? ' sag' : ''}`}>
                  <span className="ds-ad">{ben ? 'Sen' : temizAd(p.displayName)}</span>
                  <span className="ds-puan"><Sayac deger={p.score} /></span>
                </span>
                {z && z.k > 0 && (
                  <span key={`f${z.k}`} className={`ds-ucan ${z.delta > 0 ? 'arti' : 'eksi'}`} aria-hidden="true">
                    {z.delta > 0 ? `+${z.delta}` : `−${Math.abs(z.delta)}`}
                  </span>
                )}
                <span key={`z${z?.sol ?? 0}`} className={`ds-zipla${z?.sol ? ' oyna' : ''}`}>
                  <span key={`s${z?.sars ?? 0}`} className={`ds-sars${z?.sars ? ' oyna' : ''}`}>
                    <span className="ds-hale" aria-hidden="true" />
                    <span className="ds-alev" aria-hidden="true" />
                    <Avatar avatarKey={p.avatarKey} photoUrl={p.photoUrl} ad={p.displayName} boyut={AV} ben={ben} />
                    {p.finished && <span className="ds-tik" aria-label="bitirdi">✓</span>}
                  </span>
                </span>
                {z?.sol ? (
                  <span key={`k${z.sol}`} className="ds-kivilcim" aria-hidden="true"><i /><i /><i /><i /></span>
                ) : null}
              </span>
              <span className="ds-noktalar" aria-label={`${gecmis.length}/${toplamSoru} soru`}>
                {Array.from({ length: toplamSoru }, (_, n) => (
                  <i key={n} className={gecmis[n] ?? ''} />
                ))}
              </span>
            </li>
          )
        })}
        {lider && lider.score > 0 && (
          <span className="ds-tac" aria-hidden="true" style={{ transform: `translate(${SOL + liderX + AV / 2 - 13}px, 20px)` }}>
            {TAC}
          </span>
        )}
      </ol>
    </aside>
  )
}
