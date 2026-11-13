import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import DevreHatlari from '../components/DevreHatlari'
import { DogrulukHalkasi, HaftalikGrafik } from '../components/Grafikler'
import { IkAlev, IkGeri, IkGrafik } from '../components/Ikon'
import SesButonu from '../components/SesButonu'
import { dersAdi, dersKategorisi, gucluKonular, miniProgram, sn, zorlananKonular, type ProgramEylemi } from '../hooks/analiz'
import { getMistakeSummary } from '../hooks/defter'
import { getPerformance, type PerformanceStats } from '../hooks/performans'
import { useSes } from '../hooks/useSes'
import type { Sinav } from '../types'

const K_SINAV = 'quizora.sinav'
const AZ_VERI = 10

function sinavOku(): Sinav {
  try {
    return localStorage.getItem(K_SINAV) === 'lgs' ? 'lgs' : 'yks'
  } catch {
    return 'yks'
  }
}

export default function Performans() {
  const git = useNavigate()
  const { muzikModu } = useSes()
  useEffect(() => muzikModu('sakin'), [muzikModu])

  const [sinav, setSinav] = useState<Sinav>(sinavOku)
  const [gun, setGun] = useState<7 | 30>(7)
  const [veri, setVeri] = useState<PerformanceStats | null>(null)
  const [defterSayi, setDefterSayi] = useState<Record<string, number>>({})
  const [hata, setHata] = useState(false)
  const [deneme, setDeneme] = useState(0)

  useEffect(() => {
    let iptal = false
    setHata(false)
    setVeri(null)
    getPerformance({ exam: sinav, days: gun }).then(
      v => !iptal && setVeri(v),
      () => !iptal && setHata(true),
    )
    return () => {
      iptal = true
    }
  }, [sinav, gun, deneme])

  useEffect(() => {
    getMistakeSummary().then(
      o => setDefterSayi(Object.fromEntries(o.bySubject.map(b => [b.subject, b.count]))),
      () => {},
    )
  }, [])

  function sinavDegis(s: Sinav) {
    setSinav(s)
    try {
      localStorage.setItem(K_SINAV, s)
    } catch {
      /* yok say */
    }
  }

  const zor = useMemo(() => (veri ? zorlananKonular(veri) : []), [veri])
  const guclu = useMemo(() => (veri ? gucluKonular(veri) : []), [veri])
  const program = useMemo(() => (veri ? miniProgram(veri, defterSayi) : []), [veri, defterSayi])
  const dersler = useMemo(() => (veri ? [...veri.bySubject].sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered) : []), [veri])

  function eylem(e: ProgramEylemi) {
    if (e.tur === 'defter') git('/yanlislarim/coz', { state: { ders: e.ders } })
    else git(`/menu?sinav=${e.sinav}&kategori=${e.kategori}`)
  }
  function calis(subject: string, exam: Sinav) {
    if ((defterSayi[subject] ?? 0) > 0) git('/yanlislarim/coz', { state: { ders: subject } })
    else git(`/menu?sinav=${exam}&kategori=${dersKategorisi(exam, subject)}`)
  }

  const azVeri = veri !== null && veri.totals.answered < AZ_VERI

  return (
    <main className="sayfa pr-sayfa">
      <DevreHatlari kose="sag-kenar" ust={240} boyut={200} soluk />
      <div className="icerik">
        <header className="ust-bar">
          <button type="button" className="geri-btn" aria-label="Geri dön" onClick={() => (window.history.length > 1 ? git(-1) : git('/menu'))}>
            <IkGeri />
          </button>
          <div className="ust-sag">
            <SesButonu />
          </div>
        </header>

        <div className="pr-bas px-5">
          <h1 className="baslik">
            Performansım<em>.</em>
          </h1>
          <p className="alt-metin">Akıllı analiz: neyi iyi yaptığını, nereye çalışman gerektiğini gösterir.</p>
        </div>

        <div className="pr-kontrol">
          <div className="sinav-sec" role="tablist" aria-label="Sınav">
            {(['yks', 'lgs'] as const).map(s => (
              <button key={s} type="button" role="tab" aria-selected={sinav === s} onClick={() => sinavDegis(s)}>
                <b>{s.toUpperCase()}</b>
                <span>{s === 'yks' ? 'Üniversite' : '8. sınıf'}</span>
              </button>
            ))}
          </div>
          <div className="pr-donem" role="tablist" aria-label="Dönem">
            {([7, 30] as const).map(g => (
              <button key={g} type="button" role="tab" aria-selected={gun === g} className="df-cip" onClick={() => setGun(g)}>
                {g} gün
              </button>
            ))}
          </div>
        </div>

        {hata ? (
          <div className="hata-kutu" role="alert">
            Yüklenemedi, tekrar dene.{' '}
            <button type="button" className="underline" onClick={() => setDeneme(d => d + 1)}>
              Tekrar dene
            </button>
          </div>
        ) : !veri ? (
          <div className="pr-iskelet" aria-busy="true" aria-label="Yükleniyor">
            <span />
            <span />
            <span />
          </div>
        ) : azVeri ? (
          <div className="pr-bos">
            <span className="defter-ikon">
              <IkGrafik boyut={30} />
            </span>
            <h2>Analiz için biraz daha yarış</h2>
            <p>
              Son {gun} günde {veri.totals.answered} soru cevapladın. {AZ_VERI} soruyu geçince güçlü ve zayıf konuların burada belirir.
            </p>
            <Button onClick={() => git(`/menu?sinav=${sinav}`)}>Yarışa gir</Button>
          </div>
        ) : (
          <div className="pr-izgara">
            <div className="pr-sol ic-kaydir">
              <div className="pr-ozet">
                <div className="pr-kutu">
                  <span>Yarış</span>
                  <b>{veri.totals.games}</b>
                </div>
                <div className="pr-kutu">
                  <span>Doğruluk</span>
                  <b>%{veri.totals.accuracy}</b>
                </div>
                <div className="pr-kutu">
                  <span>Ort. süre</span>
                  <b>{sn(veri.totals.avgTimeMs)}</b>
                </div>
                <div className="pr-kutu seri">
                  <span>Seri</span>
                  <b>
                    <IkAlev /> {veri.streakDays} gün
                  </b>
                </div>
              </div>

              <section className="pr-bolum" aria-label="Son 7 gün">
                <h2 className="etiket">Son 7 gün</h2>
                <HaftalikGrafik daily={veri.daily} />
              </section>

              <section className="pr-bolum" aria-label="Dersler">
                <h2 className="etiket">Dersler</h2>
                <ul className="pr-dersler">
                  {dersler.map((d, i) => (
                    <li key={d.subject} className="pr-ders" style={{ '--i': i } as React.CSSProperties}>
                      <DogrulukHalkasi yuzde={d.accuracy} />
                      <div className="min-w-0">
                        <b>{dersAdi(d.subject)}</b>
                        <small>
                          {d.answered} soru · {d.correct} doğru
                        </small>
                        <small>Ort. {sn(d.avgTimeMs)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="pr-sag ic-kaydir">
              <section className="pr-bolum" aria-label="Zorlandığın konular">
                <h2 className="etiket">Zorlandığın konular</h2>
                <ul className="pk-liste">
                  {zor.map(t => {
                    const defterde = (defterSayi[t.subject] ?? 0) > 0
                    return (
                      <li key={`${t.subject}|${t.topic}`} className="pk-satir">
                        <div className="min-w-0 flex-1">
                          <span className="ders-cip">{dersAdi(t.subject)}</span>
                          <b className="pk-konu">{t.topic}</b>
                          <small>
                            {t.answered} sorudan {t.correct} doğru
                          </small>
                        </div>
                        <span className="pk-yuzde zayif">%{t.accuracy}</span>
                        <button type="button" className="pk-btn" onClick={() => calis(t.subject, t.exam)}>
                          {defterde ? 'Çalış' : 'Yarış'} <span aria-hidden="true">→</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>

              {guclu.length > 0 && (
                <section className="pr-bolum" aria-label="Güçlü olduğun konular">
                  <h2 className="etiket">Güçlü olduğun konular</h2>
                  <ul className="pg-liste">
                    {guclu.map(t => (
                      <li key={`${t.subject}|${t.topic}`}>
                        <span className="min-w-0">
                          <b>{t.topic}</b> <small>· {dersAdi(t.subject)}</small>
                        </span>
                        <span className="pk-yuzde guclu">%{t.accuracy}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {program.length > 0 && (
                <section className="pr-bolum" aria-label="3 günlük mini program">
                  <h2 className="etiket">3 günlük mini program</h2>
                  <ol className="pp-liste">
                    {program.map(g => (
                      <li key={g.gun} className="pp-gun">
                        <span className="pp-no">
                          Gün <b>{g.gun}</b>
                        </span>
                        <p>{g.metin}</p>
                        <button type="button" className="pk-btn" onClick={() => eylem(g.eylem)}>
                          {g.eylem.etiket} <span aria-hidden="true">→</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
