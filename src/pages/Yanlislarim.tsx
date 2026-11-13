import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import CalismaPaneli, { DefterTemiz } from '../components/CalismaPaneli'
import DevreHatlari from '../components/DevreHatlari'
import { IkCarpi, IkDefter, IkGeri } from '../components/Ikon'
import SesButonu from '../components/SesButonu'
import {
  getMistakeSummary,
  getMistakes,
  neZaman,
  removeMistake,
  tekrarSec,
  type MistakeItem,
  type MistakeSummary,
} from '../hooks/defter'
import { useSes } from '../hooks/useSes'
import { useWeb } from '../hooks/useWeb'
import type { Sinav } from '../types'

const K_SINAV = 'quizora.sinav'
const GERI_AL_MS = 4000
const KAYDIR_ESIK = 90

function sinavOku(): Sinav {
  try {
    return localStorage.getItem(K_SINAV) === 'lgs' ? 'lgs' : 'yks'
  } catch {
    return 'yks'
  }
}

/** Kutusuz satır; sola kaydırınca "Defterden çıkar". */
function DefterSatir({ m, aktif, onAc, onCikar }: { m: MistakeItem; aktif: boolean; onAc: () => void; onCikar: () => void }) {
  const [dx, setDx] = useState(0)
  const bas = useRef<{ x: number; y: number; yatay: boolean | null } | null>(null)
  const kaydi = useRef(false)

  return (
    <li className={`df-satir-kap${dx < 0 ? ' kayiyor' : ''}`}>
      <div className={`df-arka${dx <= -KAYDIR_ESIK ? ' hazir' : ''}`} aria-hidden="true">
        <IkCarpi boyut={18} />
        Defterden çıkar
      </div>
      <button
        type="button"
        className={`df-satir${aktif ? ' aktif' : ''}`}
        style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
        onPointerDown={e => {
          bas.current = { x: e.clientX, y: e.clientY, yatay: null }
          kaydi.current = false
        }}
        onPointerMove={e => {
          const b = bas.current
          if (!b) return
          const ddx = e.clientX - b.x
          const ddy = e.clientY - b.y
          if (b.yatay === null && Math.hypot(ddx, ddy) > 8) b.yatay = Math.abs(ddx) > Math.abs(ddy) * 1.2
          if (b.yatay) {
            kaydi.current = true
            setDx(Math.max(-160, Math.min(0, ddx)))
          }
        }}
        onPointerUp={() => {
          if (bas.current?.yatay && dx <= -KAYDIR_ESIK) onCikar()
          bas.current = null
          setDx(0)
        }}
        onPointerCancel={() => {
          bas.current = null
          setDx(0)
        }}
        onClick={() => {
          if (kaydi.current) {
            kaydi.current = false
            return
          }
          onAc()
        }}
      >
        <span className="df-satir-ust">
          <span className="ders-cip">{m.subject}</span>
          <span className={`df-cevap ${m.lastAnswer ? 'y' : 'b'}`}>{m.lastAnswer ? `Senin: ${m.lastAnswer}` : 'Boş'}</span>
        </span>
        <span className="df-metin">{m.text}</span>
        <small className="df-alt">
          {m.wrongCount} kez yanlış · {neZaman(m.lastWrongAt)}
        </small>
      </button>
      <button type="button" className="df-sil" aria-label="Defterden çıkar" onClick={onCikar}>
        <IkCarpi boyut={16} />
      </button>
    </li>
  )
}

export default function Yanlislarim() {
  const git = useNavigate()
  const web = useWeb()
  const { muzikModu } = useSes()
  useEffect(() => muzikModu('sakin'), [muzikModu])

  const [ozet, setOzet] = useState<MistakeSummary | null>(null)
  const [liste, setListe] = useState<MistakeItem[] | null>(null)
  const [hata, setHata] = useState(false)
  const [yenile, setYenile] = useState(0)
  const [sinav, setSinav] = useState<Sinav>(sinavOku)
  const [ders, setDers] = useState<string | null>(null)
  const [oturum, setOturum] = useState<{ sorular: MistakeItem[]; tur: number } | null>(null)
  const [gizli, setGizli] = useState<Set<string>>(() => new Set())
  const [tost, setTost] = useState<MistakeItem | null>(null)
  const bekleyen = useRef<{ id: string; t: number } | null>(null)
  const sinavAyarli = useRef(false)

  // Veri (ilk yükleme iskelet; yenilemede eski liste kalır, titreme olmaz)
  useEffect(() => {
    let iptal = false
    setHata(false)
    Promise.all([getMistakeSummary(), getMistakes()]).then(
      ([o, l]) => {
        if (iptal) return
        setOzet(o)
        setListe(l)
      },
      () => !iptal && setHata(true),
    )
    return () => {
      iptal = true
    }
  }, [yenile])

  // Seçili sınavda hiç soru yoksa ama diğerinde varsa ilk açılışta oraya geç
  useEffect(() => {
    if (!liste || sinavAyarli.current) return
    sinavAyarli.current = true
    const diger: Sinav = sinav === 'yks' ? 'lgs' : 'yks'
    if (!liste.some(m => m.exam === sinav) && liste.some(m => m.exam === diger)) setSinav(diger)
  }, [liste, sinav])

  // Kaydırıp çıkarılan: 4 sn içinde "Geri al" yoksa kalıcı sil. Sayfadan çıkılırsa hemen sil.
  function bekleyeniBitir() {
    const b = bekleyen.current
    if (!b) return
    window.clearTimeout(b.t)
    bekleyen.current = null
    removeMistake(b.id).then(
      () => setYenile(y => y + 1),
      () => {},
    )
  }
  useEffect(() => () => bekleyeniBitir(), [])

  function cikar(m: MistakeItem) {
    bekleyeniBitir()
    setGizli(g => new Set(g).add(m.questionId))
    setTost(m)
    const t = window.setTimeout(() => {
      bekleyeniBitir()
      setTost(null)
    }, GERI_AL_MS)
    bekleyen.current = { id: m.questionId, t }
  }
  function geriAl() {
    const b = bekleyen.current
    if (b) window.clearTimeout(b.t)
    bekleyen.current = null
    if (tost)
      setGizli(g => {
        const y = new Set(g)
        y.delete(tost.questionId)
        return y
      })
    setTost(null)
  }

  const gorunur = useMemo(() => (liste ?? []).filter(m => !gizli.has(m.questionId)), [liste, gizli])
  const sinavSayi = useMemo(
    () => ({ yks: gorunur.filter(m => m.exam === 'yks').length, lgs: gorunur.filter(m => m.exam === 'lgs').length }),
    [gorunur],
  )
  const dersler = useMemo(() => {
    const s = new Map<string, number>()
    for (const m of gorunur) if (m.exam === sinav) s.set(m.subject, (s.get(m.subject) ?? 0) + 1)
    return [...s.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
  }, [gorunur, sinav])
  const filtreli = useMemo(() => gorunur.filter(m => m.exam === sinav && (!ders || m.subject === ders)), [gorunur, sinav, ders])

  // Seçili ders boşaldıysa "Tümü"ne dön
  useEffect(() => {
    if (ders && !dersler.some(([d]) => d === ders)) setDers(null)
  }, [ders, dersler])

  function sinavDegis(s: Sinav) {
    setSinav(s)
    setDers(null)
    try {
      localStorage.setItem(K_SINAV, s)
    } catch {
      /* yok say */
    }
  }

  function baslat(sorular: MistakeItem[]) {
    if (!sorular.length) return
    if (web) setOturum({ sorular, tur: Date.now() })
    else git('/yanlislarim/coz', { state: { sorular } })
  }

  const tekrarAdet = Math.min(10, filtreli.length)
  const toplam = gorunur.length
  const cozulen = ozet?.resolvedTotal ?? 0
  const bos = liste !== null && toplam === 0

  return (
    <main className="sayfa df-sayfa">
      <DevreHatlari kose="sag-kenar" ust={260} boyut={200} soluk />
      <div className="icerik">
        <header className="ust-bar">
          <button type="button" className="geri-btn" aria-label="Ana menüye dön" onClick={() => git('/menu')}>
            <IkGeri />
          </button>
          <div className="ust-sag">
            <SesButonu />
          </div>
        </header>

        <div className="df-sol">
          <div className="px-5">
            <h1 className="baslik">
              Yanlışlarım<em>.</em>
            </h1>
            <p className="alt-metin df-ozet">
              {liste === null
                ? ' '
                : bos
                  ? cozulen
                    ? `${cozulen} soru çözüldü`
                    : 'Henüz defterinde soru yok'
                  : `${toplam} soru seni bekliyor${cozulen ? ` · ${cozulen} soru çözüldü` : ''}`}
            </p>
          </div>

          {hata ? (
            <div className="hata-kutu" role="alert">
              Yüklenemedi, tekrar dene.{' '}
              <button type="button" className="underline" onClick={() => setYenile(y => y + 1)}>
                Tekrar dene
              </button>
            </div>
          ) : bos ? (
            <DefterTemiz onDon={() => git('/menu')} />
          ) : (
            <>
              <div className="sinav-sec df-sinav" role="tablist" aria-label="Sınav">
                {(['yks', 'lgs'] as const).map(s => (
                  <button key={s} type="button" role="tab" aria-selected={sinav === s} onClick={() => sinavDegis(s)}>
                    <b>{s.toUpperCase()}</b>
                    <span>{liste ? `${sinavSayi[s]} soru` : '…'}</span>
                  </button>
                ))}
              </div>

              <div className="df-cipler" role="tablist" aria-label="Ders">
                <button type="button" role="tab" aria-selected={ders === null} className="df-cip" onClick={() => setDers(null)}>
                  Tümü <b>{sinavSayi[sinav]}</b>
                </button>
                {dersler.map(([d, n]) => (
                  <button key={d} type="button" role="tab" aria-selected={ders === d} className="df-cip" onClick={() => setDers(d)}>
                    {d} <b>{n}</b>
                  </button>
                ))}
              </div>

              <div className="df-aksiyon">
                <Button onClick={() => baslat(tekrarSec(filtreli))} disabled={!tekrarAdet} ikonSol={<IkDefter />}>
                  Tekrar çöz ({tekrarAdet})
                </Button>
              </div>

              <ul className="df-liste ic-kaydir" aria-label="Defterdeki sorular" aria-busy={liste === null}>
                {liste === null ? (
                  Array.from({ length: 5 }, (_, k) => (
                    <li key={k} className="df-iskelet" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </li>
                  ))
                ) : filtreli.length === 0 ? (
                  <li className="df-bos">Bu sınavda defterinde soru yok.</li>
                ) : (
                  filtreli.map(m => (
                    <DefterSatir
                      key={m.questionId}
                      m={m}
                      aktif={Boolean(oturum && oturum.sorular.length === 1 && oturum.sorular[0].questionId === m.questionId)}
                      onAc={() => baslat([m])}
                      onCikar={() => cikar(m)}
                    />
                  ))
                )}
              </ul>
            </>
          )}
        </div>

        {web && (
          <aside className="df-sag" aria-label="Çalışma paneli">
            {oturum ? (
              <CalismaPaneli
                key={oturum.tur}
                sorular={oturum.sorular}
                panel
                onKapat={() => setOturum(null)}
                onDeftereDon={() => setOturum(null)}
                onYeniden={k => setOturum({ sorular: k, tur: Date.now() })}
                onDegisti={() => setYenile(y => y + 1)}
              />
            ) : (
              <div className="df-sag-bos">
                <span className="defter-ikon">
                  <IkDefter boyut={28} />
                </span>
                <b>Çalışmaya hazır</b>
                <p>Soldan bir soruya dokun ya da “Tekrar çöz”e bas. Sayaç yok, acele yok.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {tost && (
        <div className="df-tost" role="status">
          <span>Defterden çıkarıldı</span>
          <button type="button" onClick={geriAl}>
            Geri al
          </button>
        </div>
      )}
    </main>
  )
}
