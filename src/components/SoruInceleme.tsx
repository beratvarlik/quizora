import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { hataMesaji } from '../hooks/hata'
import { api } from '../lib/client'
import type { ReviewItem, Secenek } from '../types'
import { IkCarpi, IkTik } from './Ikon'

const HARFLER: Secenek[] = ['A', 'B', 'C', 'D', 'E']

type Filtre = 'tumu' | 'yanlis' | 'bos'
type Durum = 'dogru' | 'yanlis' | 'bos'

const DENEME = 5
const bekle = (ms: number) => new Promise(r => setTimeout(r, ms))
const durumu = (q: ReviewItem): Durum => (q.outcome === 'blank' ? 'bos' : q.outcome === 'correct' ? 'dogru' : 'yanlis')
const azHareket = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** "Matematik (AYT)" → "Mat"; şerit altındaki küçük ders kısaltması. */
function kisalt(ders: string): string {
  const d = ders.toLocaleLowerCase('tr-TR')
  const tablo: Array<[string, string]> = [
    ['matematik', 'Mat'], ['fizik', 'Fiz'], ['kimya', 'Kim'], ['biyoloji', 'Biy'], ['fen', 'Fen'],
    ['inkılap', 'İnk'], ['tarih', 'Tar'], ['coğrafya', 'Coğ'], ['felsefe', 'Fel'], ['din', 'Din'],
    ['edebiyat', 'Edb'], ['türkçe', 'Türk'], ['ingilizce', 'İng'],
  ]
  return tablo.find(([k]) => d.includes(k))?.[1] ?? ders.slice(0, 3)
}
const dersAdi = (d: string) => d.replace(/\s*\((AYT|TYT|LGS)\)\s*$/, '')

function Ampul() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
    </svg>
  )
}

/**
 * Sonuç ekranı "Soruları incele": 10 soruluk kutusuz şerit (doğru / yanlış / boş), filtre çipleri ve
 * seçili sorunun inceleme kartı (doğru şık, senin cevabın, "Neden doğru?"). Kart yana kaydırılarak da geçilir.
 */
export default function SoruInceleme({ gameId }: { gameId: string }) {
  const [liste, setListe] = useState<ReviewItem[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [deneme, setDeneme] = useState(0)
  const [filtre, setFiltre] = useState<Filtre>('tumu')
  const [secili, setSecili] = useState<number | null>(null)
  const [defter, setDefter] = useState(0)
  const [yon, setYon] = useState<'ileri' | 'geri'>('ileri')
  const serit = useRef<HTMLOListElement>(null)
  const kaydirma = useRef<{ x: number; y: number } | null>(null)

  // Veri: yarış bitmeden çağrılırsa "henüz bitmedi" → 500 ms arayla en çok 5 kez yeniden dene.
  useEffect(() => {
    let iptal = false
    setHata(null)
    ;(async () => {
      for (let d = 0; d <= DENEME; d++) {
        try {
          const r = await api.getGameReview(gameId)
          if (iptal) return
          const sirali = [...r.items].sort((a, b) => a.position - b.position)
          setListe(sirali)
          setDefter(r.addedToNotebook ?? 0) // bu yarıştan Yanlışlarım defterine giren soru sayısı
          // İlk açılışta ilk YANLIŞ soru seçili (yoksa ilk soru)
          setSecili(sirali.find(q => durumu(q) === 'yanlis')?.position ?? sirali[0]?.position ?? null)
          return
        } catch (e) {
          if (iptal) return
          if (/henüz bitmedi/i.test(hataMesaji(e)) && d < DENEME) await bekle(500)
          else {
            setHata('Sorular yüklenemedi, tekrar dene')
            return
          }
        }
      }
    })()
    return () => {
      iptal = true
    }
  }, [gameId, deneme])

  const gorunen = useMemo(() => {
    if (!liste) return []
    if (filtre === 'yanlis') return liste.filter(q => durumu(q) === 'yanlis')
    if (filtre === 'bos') return liste.filter(q => durumu(q) === 'bos')
    return liste
  }, [liste, filtre])

  // Filtre değişince seçili soru listede yoksa ilkine geç
  useEffect(() => {
    if (!gorunen.length) return
    if (secili === null || !gorunen.some(q => q.position === secili)) setSecili(gorunen[0].position)
  }, [gorunen, secili])

  // Seçili numarayı şeritte görünür yap (sayfayı dikeyde kaydırmadan)
  useEffect(() => {
    const el = serit.current?.querySelector<HTMLElement>('[aria-current="true"]')
    const kap = serit.current
    if (!el || !kap) return
    const hedef = el.offsetLeft - kap.clientWidth / 2 + el.clientWidth / 2
    kap.scrollTo({ left: hedef, behavior: azHareket() ? 'auto' : 'smooth' })
  }, [secili, gorunen])

  const konum = gorunen.findIndex(q => q.position === secili)
  const git = useCallback(
    (adim: number) => {
      const yeni = gorunen[konum + adim]
      if (!yeni) return
      setYon(adim > 0 ? 'ileri' : 'geri')
      setSecili(yeni.position)
    },
    [gorunen, konum],
  )

  const sayilar = useMemo(() => {
    const s = { yanlis: 0, bos: 0 }
    for (const q of liste ?? []) {
      const d = durumu(q)
      if (d === 'yanlis') s.yanlis++
      if (d === 'bos') s.bos++
    }
    return s
  }, [liste])

  const q = gorunen[konum] ?? null

  // Hangi sorular deftere girdi? Yanlışların hepsi; boşlardan yalnızca görülenler. Görülmeyen boşlar
  // (süre bitince açılmayanlar) sondadır, bu yüzden pozisyon sırasıyla ilk (eklenen − yanlış) boş girer.
  const defterdekiler = useMemo(() => {
    const k = new Set<number>()
    if (!liste || defter <= 0) return k
    const sirali = [...liste].sort((a, b) => a.position - b.position)
    for (const x of sirali) if (durumu(x) === 'yanlis') k.add(x.position)
    let bosHak = Math.max(0, defter - k.size)
    for (const x of sirali) if (durumu(x) === 'bos' && bosHak > 0) (k.add(x.position), bosHak--)
    return k
  }, [liste, defter])
  const toplam = liste?.length ?? 10

  return (
    <section className="inceleme" aria-label="Soruları incele">
      <div className="inc-ust">
        <span className="etiket">Soruları incele</span>
        {liste && (
          <div className="inc-filtre" role="tablist" aria-label="Filtre">
            {(
              [
                ['tumu', 'Tümü'],
                ['yanlis', `Yanlışlar${sayilar.yanlis ? ` ${sayilar.yanlis}` : ''}`],
                ['bos', `Boşlar${sayilar.bos ? ` ${sayilar.bos}` : ''}`],
              ] as const
            ).map(([k, ad]) => (
              <button key={k} type="button" role="tab" aria-selected={filtre === k} className="inc-cip" onClick={() => setFiltre(k)}>
                {ad}
              </button>
            ))}
          </div>
        )}
      </div>

      {hata ? (
        <div className="hata-kutu inc-hata" role="alert">
          {hata}{' '}
          <button type="button" className="underline" onClick={() => setDeneme(d => d + 1)}>
            Tekrar dene
          </button>
        </div>
      ) : !liste ? (
        <ol className="inc-serit iskelet" aria-label="Yükleniyor">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i}>
              <span className="inc-no" />
              <small>&nbsp;</small>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <ol className="inc-serit" ref={serit} key={filtre} aria-label="Sorular">
            {gorunen.map((s, i) => {
              const d = durumu(s)
              return (
                <li key={s.position} style={{ '--i': i } as React.CSSProperties}>
                  <button
                    type="button"
                    className={`inc-no ${d}`}
                    aria-current={s.position === secili}
                    aria-label={`Soru ${s.position + 1}: ${d === 'dogru' ? 'doğru' : d === 'yanlis' ? 'yanlış' : 'boş'}`}
                    onClick={() => {
                      setYon(s.position > (secili ?? 0) ? 'ileri' : 'geri')
                      setSecili(s.position)
                    }}
                  >
                    {d === 'dogru' ? <IkTik boyut={16} /> : d === 'yanlis' ? <IkCarpi boyut={16} /> : <b>–</b>}
                    <i>{s.position + 1}</i>
                  </button>
                  <small>{kisalt(s.ders)}</small>
                </li>
              )
            })}
          </ol>

          {defter > 0 && (
            <Link to="/yanlislarim" className="inc-defter">
              Yanlışlarım defterine {defter} soru eklendi <span aria-hidden="true">→</span>
            </Link>
          )}

          {!q ? (
            <p className="inc-bos">{filtre === 'yanlis' ? 'Hiç yanlışın yok. Harika!' : 'Boş bıraktığın soru yok.'}</p>
          ) : (
            <article
              key={q.position}
              className={`inc-kart ${yon}`}
              onPointerDown={e => (kaydirma.current = { x: e.clientX, y: e.clientY })}
              onPointerUp={e => {
                const b = kaydirma.current
                kaydirma.current = null
                if (!b) return
                const dx = e.clientX - b.x
                const dy = e.clientY - b.y
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) git(dx < 0 ? 1 : -1)
              }}
              onPointerCancel={() => (kaydirma.current = null)}
            >
              <div className="inc-baslik">
                <span className="ders-cip">{dersAdi(q.ders)}</span>
                {defterdekiler.has(q.position) && <span className="inc-defterde">Defterde</span>}
                <span className="inc-sira">
                  Soru {q.position + 1}/{toplam}
                </span>
                <span className={`inc-puan ${q.points > 0 ? 'art' : q.points < 0 ? 'eks' : ''}`}>
                  {q.points > 0 ? `+${q.points}` : q.points < 0 ? `−${Math.abs(q.points)}` : '0'}
                  {q.timeMs !== null && <small> · {(q.timeMs / 1000).toFixed(1).replace('.', ',')} sn</small>}
                </span>
              </div>

              <div className="soru-kart inc-soru">
                {q.outcome === 'blank' && <span className="inc-etiket bos">Boş bıraktın</span>}
                {q.imageUrl && <img src={q.imageUrl} alt="" />}
                <div className="metin">{q.text}</div>
              </div>

              <div className={`siklar inc-siklar${Object.keys(q.options).length <= 4 ? ' siklar-4' : ''}`}>
                {HARFLER.filter(h => q.options[h]?.trim()).map(h => {
                    const dogru = h === q.correctOption
                    const benim = h === q.selected && q.outcome === 'wrong'
                    return (
                      <div key={h} className={`sik ${dogru ? 'dogrusu' : benim ? 'yanlis' : 'soluk'}`}>
                        <span className="harf">{h}</span>
                        <span className="sik-metin">
                          {q.options[h]}
                          {benim && <em className="inc-etiket">Senin cevabın</em>}
                        </span>
                        {(dogru || benim) && <span className="sik-ikon">{dogru ? <IkTik boyut={16} /> : <IkCarpi boyut={16} />}</span>}
                      </div>
                    )
                  })}
              </div>

              <div className="inc-neden">
                <span className="inc-ampul">
                  <Ampul />
                </span>
                <div>
                  <b>Neden doğru?</b>
                  <p>{q.explanation ?? 'Bu soru için açıklama henüz eklenmedi.'}</p>
                </div>
              </div>

              <div className="inc-gezin">
                <button type="button" className="inc-ok" onClick={() => git(-1)} disabled={konum <= 0} aria-label="Önceki soru">
                  ‹ Önceki
                </button>
                <span className="inc-konum">
                  {konum + 1} / {gorunen.length}
                </span>
                <button type="button" className="inc-ok" onClick={() => git(1)} disabled={konum >= gorunen.length - 1} aria-label="Sonraki soru">
                  Sonraki ›
                </button>
              </div>
            </article>
          )}
        </>
      )}
    </section>
  )
}
