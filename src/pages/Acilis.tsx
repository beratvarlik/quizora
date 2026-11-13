import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DevreHatlari from '../components/DevreHatlari'
import { BaglantiBandi } from '../components/Durum'
import { IkOk } from '../components/Ikon'
import { UstBar } from '../components/Logo'
import { useSes } from '../hooks/useSes'
import { useSession } from '../hooks/useSession'
import type { Sinav } from '../types'

const K_SINAV = 'quizora.sinav'
const DERS_SATIRI: Record<Sinav, string> = { yks: 'SAY · EA · SÖZ · TYT', lgs: 'Sözel · Sayısal' }

// Kart içi lav damarı dokusu: a = ana damar (kenardan başlar), d = dallar. İki kartın deseni farklı.
const DAMAR: Record<Sinav, Array<{ a: string; d: string[]; s: number; g: number }>> = {
  yks: [
    { a: 'M0 18C8 20 13 15 20 19S30 28 37 25', d: ['M20 19C22 13 26 9 29 3'], s: 3.2, g: 0 },
    { a: 'M10 100C12 91 7 85 14 78S24 71 29 63', d: ['M14 78C9 75 5 73 0 71'], s: 3.8, g: 1.1 },
    { a: 'M100 63C92 61 88 69 80 72S68 76 62 85', d: ['M80 72C84 79 88 86 91 93'], s: 3.4, g: 2.2 },
    { a: 'M76 0C76 8 82 12 86 18S93 26 100 29', d: [], s: 2.8, g: 0.6 },
  ],
  lgs: [
    { a: 'M31 0C33 8 26 12 28 20S22 30 13 32', d: ['M28 20C34 22 39 19 44 25'], s: 3.4, g: 0.3 },
    { a: 'M100 40C94 43 90 37 84 41S77 50 71 47', d: ['M84 41C86 33 92 29 95 22'], s: 3.0, g: 1.5 },
    { a: 'M62 100C60 92 67 88 64 80S70 71 79 74', d: ['M64 80C58 82 54 78 49 84'], s: 3.6, g: 2.4 },
    { a: 'M0 82C6 80 10 86 18 84S26 76 33 80', d: ['M18 84C20 90 17 95 21 100'], s: 3.1, g: 0.9 },
  ],
}

function Damar({ s }: { s: Sinav }) {
  return (
    <span className="lp-damar" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {DAMAR[s].map((v, i) => (
          <g key={i}>
            <path className="d" pathLength={100} d={v.a} />
            <path className="d kalin" pathLength={100} d={v.a} />
            {v.d.map(d => (
              <path key={d} className="d dal" pathLength={100} d={d} />
            ))}
            <path className="isik" pathLength={100} d={v.a} style={{ '--s': `${v.s}s`, '--g': `${v.g}s` } as React.CSSProperties} />
          </g>
        ))}
      </svg>
    </span>
  )
}

/** Seçili kartın çerçevesi: soluk iz + etrafında dolaşan iki turuncu ışık. */
function Cerceve() {
  return (
    <svg className="lp-cerceve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect className="iz" x="1" y="1" width="98" height="98" rx="13" />
      <rect className="isik" x="1" y="1" width="98" height="98" rx="13" pathLength={100} />
      <rect className="isik iki" x="1" y="1" width="98" height="98" rx="13" pathLength={100} />
    </svg>
  )
}

function sinavOku(): Sinav {
  try {
    return localStorage.getItem(K_SINAV) === 'lgs' ? 'lgs' : 'yks'
  } catch {
    return 'yks'
  }
}

/** Açılış (W1), ilk ekran: başlık + YKS/LGS kartları + "… ile oyna". */
export default function Acilis() {
  const git = useNavigate()
  const { profile, loading } = useSession()
  const { efekt } = useSes()
  const [sinav, setSinav] = useState<Sinav>('yks') // varsayılan YKS
  const [degisim, setDegisim] = useState(0) // seçim animasyonlarını yeniden oynatmak için
  const [yon, setYon] = useState<'sag' | 'sol' | null>(null)
  const [bekliyor, setBekliyor] = useState(false)

  // Önceki ziyarette LGS seçildiyse onu hatırla
  useEffect(() => {
    if (sinavOku() === 'lgs') setSinav('lgs')
  }, [])

  function sec(s: Sinav) {
    if (s === sinav) return
    efekt('tik')
    setYon(s === 'lgs' ? 'sag' : 'sol')
    setSinav(s)
    setDegisim(d => d + 1)
  }

  function oyna() {
    efekt('tik')
    try {
      localStorage.setItem(K_SINAV, sinav)
    } catch {
      /* yok say */
    }
    setBekliyor(true)
  }

  // Profil yoksa önce /profil (sonra seçili sınavla menü), varsa doğrudan menü.
  // Oturum hâlâ yükleniyorsa yüklenince yönlendirir.
  useEffect(() => {
    if (!bekliyor || loading) return
    const menu = `/menu?sinav=${sinav}`
    git(profile ? menu : `/profil?sonra=${encodeURIComponent(menu)}`)
  }, [bekliyor, loading, profile, sinav, git])

  const ad = sinav === 'yks' ? 'YKS' : 'LGS'

  return (
    <main className="sayfa lp-sayfa">
      <BaglantiBandi />
      <DevreHatlari kose="sag-kenar" ust={150} boyut={170} />
      <DevreHatlari kose="sol-alt" boyut={200} />
      <div className="lp-ust">
        <UstBar />
      </div>
      <section className="lp-hero">
        <div className="lp-isik" aria-hidden="true" />
        <div className="lp-hero-ic">
          <div>
            <span className="etiket">2–5 kişilik düello</span>
            <h1>
              Sınav değil,
              <br />
              düello<em>.</em>
            </h1>
            <p className="lp-alt">YKS ve LGS’ye arkadaşlarınla yarışarak hazırlan.</p>
          </div>
          <div className="lp-secim">
            <div className="lp-sinav" role="tablist" aria-label="Sınav">
              {(['yks', 'lgs'] as const).map(s => (
                <button
                  key={degisim && sinav === s ? `${s}-${degisim}` : s}
                  type="button"
                  role="tab"
                  aria-selected={sinav === s}
                  className={`lp-s${sinav === s && degisim ? ' zipla2 dol' : ''}`}
                  onClick={() => sec(s)}
                >
                  <Damar s={s} />
                  <Cerceve />
                  <b>{s === 'yks' ? 'YKS' : 'LGS'}</b>
                </button>
              ))}
              <span key={`g${degisim}`} className={`lp-gecis${yon ? ` ${yon}` : ''}`} aria-hidden="true">
                <i />
              </span>
            </div>
            <p className="lp-dersler">
              <span key={sinav} className={degisim ? 'gir' : ''}>
                {DERS_SATIRI[sinav]}
              </span>
            </p>
            <button type="button" className="lp-ana-oyna" onClick={oyna} disabled={bekliyor}>
              <span>{ad} ile oyna</span>
              <IkOk />
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
