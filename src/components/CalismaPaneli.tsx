import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dersAdi, getMistakeSummary, practiceAnswer, type MistakeItem, type PracticeResult } from '../hooks/defter'
import { hataMesaji } from '../hooks/hata'
import { useSes } from '../hooks/useSes'
import type { Secenek } from '../types'
import Button from './Button'
import { IkAmpul, IkCarpi, IkTik } from './Ikon'

const HARFLER: Secenek[] = ['A', 'B', 'C', 'D', 'E']
const azHareket = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
const RENKLER = ['#F15A24', '#702B3A', '#13805A', '#FFB15C']

/** Küçük konfeti (hepsi doğruysa). Azaltılmış harekette hiç çizilmez. */
function Konfeti() {
  const parcalar = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        x: Math.random() * 100,
        g: Math.random() * 0.5,
        r: Math.round(Math.random() * 360),
        b: 6 + Math.random() * 6,
        c: RENKLER[i % RENKLER.length],
      })),
    [],
  )
  if (azHareket()) return null
  return (
    <div className="konfeti" aria-hidden="true">
      {parcalar.map((p, i) => (
        <i
          key={i}
          style={{ left: `${p.x}%`, width: p.b, height: p.b * 0.45, background: p.c, animationDelay: `${p.g}s`, '--r': `${p.r}deg` } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

/** 0'dan hedefe sayarak yükselen sayı. */
function Sayar({ hedef }: { hedef: number }) {
  const [v, setV] = useState(() => (azHareket() ? hedef : 0))
  useEffect(() => {
    if (azHareket()) {
      setV(hedef)
      return
    }
    let raf = 0
    const bas = performance.now()
    const adim = (t: number) => {
      const o = Math.min(1, (t - bas) / 900)
      setV(Math.round(hedef * (1 - (1 - o) ** 3)))
      if (o < 1) raf = requestAnimationFrame(adim)
    }
    raf = requestAnimationFrame(adim)
    return () => cancelAnimationFrame(raf)
  }, [hedef])
  return <>{v}</>
}

/** Boş defter: büyük onay + "Defterin tertemiz!" */
export function DefterTemiz({ onDon }: { onDon: () => void }) {
  return (
    <div className="df-temiz">
      <span className="df-temiz-ikon">
        <IkTik boyut={44} />
      </span>
      <h2>Defterin tertemiz!</h2>
      <p>Yanlış ya da boş bıraktığın sorular yarıştan sonra buraya düşer.</p>
      <Button onClick={onDon}>Yarışmaya dön</Button>
    </div>
  )
}

interface Props {
  sorular: MistakeItem[]
  onKapat: () => void
  onDeftereDon: () => void
  onYeniden: (kalanlar: MistakeItem[]) => void
  /** Bir cevap defteri değiştirdi (liste yenilensin). */
  onDegisti?: () => void
  /** Web'de sağ panel içinde (alt düğme sabit değil, gövde kendi içinde kayar). */
  panel?: boolean
}

interface Kayit {
  soru: MistakeItem
  secim: Secenek
  dogru: boolean
}

/**
 * Yanlışlarım çalışma modu: sakin tema, sayaç/alev yok. Cevap → practiceAnswer; otomatik geçiş yok,
 * "Sonraki soru" ile ilerlenir. Oturum sonunda özet + "Kalanları tekrar çöz".
 */
export default function CalismaPaneli({ sorular, onKapat, onDeftereDon, onYeniden, onDegisti, panel = false }: Props) {
  const git = useNavigate()
  const { efekt } = useSes()
  const [i, setI] = useState(0)
  const [secim, setSecim] = useState<Secenek | null>(null)
  const [sonuc, setSonuc] = useState<PracticeResult | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [kayitlar, setKayitlar] = useState<Kayit[]>([])
  const [bitti, setBitti] = useState(false)
  const [kalanToplam, setKalanToplam] = useState<number | null>(null)
  const sonucKutu = useRef<HTMLDivElement>(null)
  const govde = useRef<HTMLDivElement>(null)

  const n = sorular.length
  const q = sorular[i] as MistakeItem | undefined
  const harfler = q ? HARFLER.filter(h => q.options[h]?.trim()) : []

  useEffect(() => {
    if (!bitti) return
    getMistakeSummary().then(s => setKalanToplam(s.total), () => setKalanToplam(null))
  }, [bitti])

  // Cevaptan sonra açıklama kutusunu görünür yap
  useEffect(() => {
    if (sonuc) sonucKutu.current?.scrollIntoView({ block: 'nearest', behavior: azHareket() ? 'auto' : 'smooth' })
  }, [sonuc])

  async function cevapla(h: Secenek) {
    if (!q || secim) return
    efekt('tik')
    setSecim(h)
    setHata(null)
    try {
      const r = await practiceAnswer(q.questionId, h)
      setSonuc(r)
      efekt(r.isCorrect ? 'dogru' : 'yanlis')
      setKayitlar(k => [...k, { soru: q, secim: h, dogru: r.isCorrect }])
      onDegisti?.()
    } catch (e) {
      setHata(hataMesaji(e))
      setSecim(null)
    }
  }

  function sonraki() {
    if (i + 1 >= n) {
      setBitti(true)
      return
    }
    setI(i + 1)
    setSecim(null)
    setSonuc(null)
    setHata(null)
    govde.current?.scrollTo({ top: 0 })
    if (!panel) window.scrollTo({ top: 0 })
  }

  const dogruSayi = kayitlar.filter(k => k.dogru).length
  const kalanlar = kayitlar
    .filter(k => !k.dogru)
    .map(k => ({ ...k.soru, lastAnswer: k.secim, wrongCount: k.soru.wrongCount + 1, lastWrongAt: new Date().toISOString() }))
  const ilerleme = n ? ((bitti ? n : i + (sonuc ? 1 : 0)) / n) * 100 : 0

  const altSinif = panel ? 'cz-alt' : 'alt-cta cz-alt'

  return (
    <section className={`cz${panel ? ' cz-panel' : ''}`} aria-label="Çalışma modu">
      <div className="cz-ust">
        <span className="etiket">{bitti ? 'Çalışma modu · bitti' : `Çalışma modu · ${Math.min(i + 1, n)}/${n}`}</span>
        <button type="button" className="cz-kapat" aria-label="Çalışmayı kapat" onClick={onKapat}>
          <IkCarpi boyut={20} />
        </button>
      </div>
      <div className="cz-ilerleme" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={bitti ? n : i}>
        <i style={{ width: `${ilerleme}%` }} />
      </div>

      {bitti ? (
        <div className="cz-govde cz-bitis" ref={govde}>
          {n > 0 && dogruSayi === n && <Konfeti />}
          <span className="etiket">Oturum özeti</span>
          <div className="cz-skor">
            <b>{dogruSayi}</b>/{n} <small>doğru</small>
          </div>
          <p className="cz-cikan">
            <b>
              <Sayar hedef={dogruSayi} />
            </b>{' '}
            soru defterden çıktı
          </p>
          <p className="cz-kalan">
            {kalanToplam === null ? ' ' : kalanToplam === 0 ? 'Defterin tertemiz!' : `Defterinde ${kalanToplam} soru kaldı`}
          </p>
          <div className="cz-bitis-btn">
            {kalanlar.length > 0 && <Button onClick={() => onYeniden(kalanlar)}>Kalanları tekrar çöz ({kalanlar.length})</Button>}
            <Button tur={kalanlar.length > 0 ? 'iki' : 'ana'} onClick={onDeftereDon}>
              Deftere dön
            </Button>
            <Button tur="uc" onClick={() => git('/menu')}>
              Ana menü
            </Button>
          </div>
        </div>
      ) : q ? (
        <>
          <div className="cz-govde" ref={govde}>
            <p className="cz-gecen">
              Geçen sefer:{' '}
              <b className={q.lastAnswer ? 'y' : 'b'}>{q.lastAnswer ? `${q.lastAnswer} (yanlış)` : 'boş bıraktın'}</b>
              {q.wrongCount > 1 && <span> · {q.wrongCount} kez yanlış</span>}
            </p>
            <div key={q.questionId} className="soru-sahne soru-gir">
              <div className="soru-kart">
                <div className="soru-ust">
                  <span className="ders-cip">{dersAdi(q.subject)}</span>
                  <span className="sinav-yazi">
                    {q.topic ? `${q.topic} · ` : ''}
                    {q.exam === 'lgs' ? 'LGS' : 'YKS'}
                  </span>
                </div>
                {q.imageUrl && <img src={q.imageUrl} alt="" />}
                <div className="metin">{q.text}</div>
              </div>
              <div className={`siklar${harfler.length <= 4 ? ' siklar-4' : ''}`} role="group" aria-label="Şıklar">
                {harfler.map((h, k) => {
                  let cls = ''
                  let ikon: 'tik' | 'carpi' | null = null
                  if (sonuc) {
                    if (h === secim) {
                      cls = sonuc.isCorrect ? 'dogru' : 'yanlis'
                      ikon = sonuc.isCorrect ? 'tik' : 'carpi'
                    } else if (h === sonuc.correctOption) {
                      cls = 'dogrusu'
                      ikon = 'tik'
                    } else cls = 'soluk'
                  } else if (h === secim) cls = 'secili'
                  return (
                    <button
                      key={h}
                      type="button"
                      className={`sik ${cls}`}
                      style={{ '--i': k } as React.CSSProperties}
                      disabled={secim !== null}
                      onClick={() => cevapla(h)}
                    >
                      <span className="harf">{h}</span>
                      <span className="sik-metin">{q.options[h]}</span>
                      {ikon && <span className="sik-ikon">{ikon === 'tik' ? <IkTik boyut={16} /> : <IkCarpi boyut={16} />}</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {hata && (
              <div className="hata-kutu" role="alert">
                {hata}
              </div>
            )}

            {sonuc && (
              <div className="cz-sonuc" ref={sonucKutu} role="status" aria-live="polite">
                {sonuc.isCorrect ? (
                  <span className="cz-cikti">
                    <IkTik boyut={16} /> Defterden çıktı
                  </span>
                ) : (
                  <p className="cz-kaldi">
                    Doğru cevap <b>{sonuc.correctOption}</b> · Defterde kalmaya devam ediyor
                  </p>
                )}
                <div className="inc-neden">
                  <span className="inc-ampul">
                    <IkAmpul />
                  </span>
                  <div>
                    <b>Neden doğru?</b>
                    <p>{sonuc.explanation ?? 'Bu soru için açıklama henüz yok.'}</p>
                  </div>
                </div>
              </div>
            )}
            {!panel && <div className="alt-bosluk" />}
          </div>

          <div className={altSinif}>
            <Button onClick={sonraki} disabled={!sonuc && !hata}>
              {i + 1 >= n ? 'Sonucu gör' : 'Sonraki soru →'}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  )
}
