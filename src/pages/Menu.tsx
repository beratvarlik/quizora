import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Cip from '../components/Cip'
import DevreHatlari from '../components/DevreHatlari'
import { BaglantiBandi, Yukleniyor } from '../components/Durum'
import { GorevKarti, GorevPaneli } from '../components/Gorevler'
import { IkArti, IkDefter, IkGrafik, IkSimsek } from '../components/Ikon'
import KademeRozet from '../components/KademeRozet'
import Logo, { GeriButonu } from '../components/Logo'
import SesButonu from '../components/SesButonu'
import { KATEGORILER, KategoriIkon, kategoriBul } from '../components/Kategoriler'
import { getMistakeSummary } from '../hooks/defter'
import { BONUS_ID, claimDailyTask, gorevHataMetni, sessizHata } from '../hooks/gorevler'
import { hataMesaji } from '../hooks/hata'
import { useGorevler } from '../hooks/useGorevler'
import { useSes } from '../hooks/useSes'
import { useSession } from '../hooks/useSession'
import { api } from '../lib/client'
import type { GlobalRow, Kategori, MyStats, Sinav } from '../types'

const K_SINAV = 'quizora.sinav'
const KOD_HARF = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g

function sinavOku(): Sinav {
  // Açılıştan ?sinav=lgs ile gelindiyse o sınav seçili açılır
  try {
    const q = new URLSearchParams(window.location.search).get('sinav')
    if (q === 'yks' || q === 'lgs') {
      localStorage.setItem(K_SINAV, q)
      return q
    }
  } catch {
    /* yok say */
  }
  try {
    return localStorage.getItem(K_SINAV) === 'lgs' ? 'lgs' : 'yks'
  } catch {
    return 'yks'
  }
}

/** ?kategori=sayisal ile gelindiyse (Performansım → "Yarışa gir") o kategori seçili açılır. */
function kategoriOku(sinav: Sinav): Kategori | null {
  try {
    const q = new URLSearchParams(window.location.search).get('kategori')
    return KATEGORILER.find(c => c.k === q && c.sinav === sinav)?.k ?? null
  } catch {
    return null
  }
}

const azHareket = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** "+30 XP" yazısını butondan hedefe uçurur (FLIP: ilk konum → son konum, transform ile). */
function xpUcur(kaynak: HTMLElement, hedef: Element | null, metin: string): Promise<void> {
  if (!hedef || azHareket()) return Promise.resolve()
  const a = kaynak.getBoundingClientRect()
  const b = hedef.getBoundingClientRect()
  if (!b.width) return Promise.resolve()
  const el = document.createElement('div')
  el.className = 'xp-ucan'
  el.textContent = metin
  el.style.left = `${a.left + a.width / 2}px`
  el.style.top = `${a.top + a.height / 2}px`
  document.body.appendChild(el)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const anim = el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 40}px)) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: 0.2 },
    ],
    { duration: 750, easing: 'cubic-bezier(.4, 0, .2, 1)' },
  )
  return anim.finished.then(
    () => el.remove(),
    () => el.remove(),
  )
}

export default function Menu() {
  const git = useNavigate()
  const { profile, userId, loading } = useSession()
  const [sinav, setSinav] = useState<Sinav>(sinavOku)
  const [secili, setSecili] = useState<Kategori | null>(() => kategoriOku(sinavOku()))
  const [kod, setKod] = useState('')
  const [stat, setStat] = useState<MyStats | null>(null)
  const [lider, setLider] = useState<GlobalRow[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [kuruluyor, setKuruluyor] = useState(false)
  const [araniyor, setAraniyor] = useState(false)
  const [defterSayi, setDefterSayi] = useState<number | null>(null)
  const gorev = useGorevler()
  const [panelAcik, setPanelAcik] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('gorevler') === 'ac'
    } catch {
      return false
    }
  })
  const [aliniyor, setAliniyor] = useState<string | null>(null)
  const [kutlama, setKutlama] = useState(false)
  const [tost, setTost] = useState<string | null>(null)
  const [xpGoster, setXpGoster] = useState<number | null>(null)
  const [parla, setParla] = useState(0)
  const [rutbeAtladi, setRutbeAtladi] = useState<MyStats | null>(null)
  const xpHedef = useRef<HTMLSpanElement>(null)
  const yedekHedef = useRef<HTMLDivElement>(null)
  const ses = useSes()
  const { muzikModu } = ses
  useEffect(() => muzikModu('sakin'), [muzikModu])

  useEffect(() => {
    if (!loading && !profile) git('/profil', { replace: true })
  }, [loading, profile, git])

  useEffect(() => {
    api.getMyStats().then(setStat, () => {})
    getMistakeSummary().then(s => setDefterSayi(s.total), () => {})
    return api.subscribeGlobalLeaderboard(setLider)
  }, [])

  // XP göstergesinde sayarak artış
  function xpSay(once: number, sonra: number) {
    if (azHareket()) {
      setXpGoster(sonra)
      return
    }
    const bas = performance.now()
    const adim = (t: number) => {
      const o = Math.min(1, (t - bas) / 700)
      setXpGoster(Math.round(once + (sonra - once) * (1 - (1 - o) ** 3)))
      if (o < 1) requestAnimationFrame(adim)
    }
    requestAnimationFrame(adim)
  }

  /** Ödül al: XP butondan rütbe göstergesine uçar, sayarak artar; rütbe atladıysa kutlama. */
  async function odulAl(id: string, kaynak: HTMLElement) {
    if (aliniyor) return
    setAliniyor(id)
    try {
      const r = await claimDailyTask(id)
      ses.efekt('isilti')
      const hedef = xpHedef.current?.getBoundingClientRect().width ? xpHedef.current : yedekHedef.current
      await xpUcur(kaynak, hedef, `+${r.xpGained} XP`)
      setParla(n => n + 1)
      xpSay(r.newXp - r.xpGained, r.newXp)
      const yeni = await api.getMyStats().catch(() => null)
      // Gerçek backend henüz ödül XP'sini yazmıyorsa göstergede yeni XP kalsın
      setStat(s => (yeni && yeni.xp >= r.newXp ? yeni : s ? { ...s, xp: r.newXp } : s))
      if (r.tierAfter !== r.tierBefore) setRutbeAtladi(yeni ?? (stat ? { ...stat, rankLabel: r.tierAfter } : null))
      if (id === BONUS_ID) setKutlama(true)
    } catch (e) {
      const m = hataMesaji(e)
      if (!sessizHata(m)) setTost(gorevHataMetni(m))
      gorev.yenile()
    } finally {
      setAliniyor(null)
    }
  }

  const panelKapat = useCallback(() => {
    setPanelAcik(false)
    setKutlama(false)
  }, [])

  function kisayol(id: string) {
    setPanelAcik(false)
    if (id === 'notebook3') {
      git('/yanlislarim')
      return
    }
    if (id === 'math10') {
      // Matematik ağırlıklı alan seçili gelsin
      sinavDegis(sinav)
      setSecili(sinav === 'lgs' ? 'lgs_sayisal' : 'sayisal')
    }
    const hedef = id === 'quick1' ? '.hk-btn' : id === 'friends2' || id === 'math10' ? '.aksiyon' : '.kat-izgara'
    window.setTimeout(() => document.querySelector(hedef)?.scrollIntoView({ block: 'center', behavior: azHareket() ? 'auto' : 'smooth' }), 60)
  }

  useEffect(() => {
    if (!tost) return
    const t = window.setTimeout(() => setTost(null), 3500)
    return () => window.clearTimeout(t)
  }, [tost])
  useEffect(() => {
    if (!rutbeAtladi) return
    const t = window.setTimeout(() => setRutbeAtladi(null), 4200)
    return () => window.clearTimeout(t)
  }, [rutbeAtladi])

  function sinavDegis(s: Sinav) {
    setSinav(s)
    setSecili(null)
    try {
      localStorage.setItem(K_SINAV, s)
    } catch {
      /* yok say */
    }
  }

  async function lobiKur() {
    if (!secili) return
    setKuruluyor(true)
    setHata(null)
    try {
      const { code } = await api.createGame(secili)
      git(`/lobi/${code}`)
    } catch (e) {
      setHata(hataMesaji(e))
      setKuruluyor(false)
    }
  }

  /** Hemen Katıl: aynı kategoride uygun herkese açık lobiye gir ya da yenisini aç. */
  async function hemenKatil() {
    if (!secili || araniyor) return
    setAraniyor(true)
    setHata(null)
    try {
      // Radar en az ~0,8 sn görünsün (anında geçişte ne olduğu anlaşılmıyor)
      const [{ code }] = await Promise.all([api.quickJoin(secili), new Promise(r => setTimeout(r, 800))])
      git(`/lobi/${code}`)
    } catch (e) {
      setHata(hataMesaji(e))
      setAraniyor(false)
    }
  }

  function katil() {
    if (kod.length !== 4) {
      setHata('Lobi kodu 4 karakter olmalı.')
      return
    }
    git(`/join/QZ-${kod}`)
  }

  if (loading || !profile) return <Yukleniyor />

  const kartlar = KATEGORILER.filter(c => c.sinav === sinav)
  const bilgi = secili ? kategoriBul(secili) : null

  return (
    <main className="sayfa mn-sayfa">
      <BaglantiBandi />
      <DevreHatlari kose="sag-kenar" ust="orta" boyut={220} />
      <DevreHatlari kose="sol-alt" boyut={200} />
      <div className="icerik">
        <header className="ust-bar">
          <div className="ust-sol">
          <GeriButonu onClick={() => git('/')} etiket="Açılış sayfasına dön" />
          <Logo className="mn-logo" />
          <Link to="/profil" className="ben-bar" aria-label="Profili düzenle">
            <Avatar avatarKey={profile.avatarKey} photoUrl={profile.photoUrl} ad={profile.displayName} boyut={36} ben />
            <div>
              <div className="ad">{profile.displayName}</div>
              <div className="ben-alt">Profili düzenle</div>
            </div>
          </Link>
          </div>
          <div className="ust-sag">
          {stat && (
            <span key={parla} ref={xpHedef} className={`rank-cip${parla ? ' parla' : ''}`} aria-label={`Rütbe: ${stat.rankLabel}, ${xpGoster ?? stat.xp} XP`}>
              <KademeRozet rankKey={stat.rankKey} label={stat.rankLabel} />
              <span className="rc-etiket">{stat.rankLabel} · </span>
              {xpGoster ?? stat.xp} XP
            </span>
          )}
          <SesButonu />
          </div>
        </header>

        <div className="mn-ust-kartlar">
        {stat && (
          <div className="kart ilerleme-kart" ref={yedekHedef}>
            <KademeRozet rankKey={stat.rankKey} boyut={36} label={stat.rankLabel} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                <span>{stat.rankLabel}</span>
                <span className="text-[color:var(--soluk)]">
                  {stat.nextRankLabel ? `${stat.nextRankLabel} için ${stat.xpToNext} XP` : 'En üst rütbe'}
                </span>
              </div>
              <div className="xp-cubuk">
                <i style={{ width: `${stat.progressPct}%` }} />
              </div>
            </div>
            <Link to="/performans" className="analiz-link">
              Analizim <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
        <GorevKarti veri={gorev.veri} tamam={gorev.tamam} kalanMs={gorev.kalanMs} bekleyen={gorev.bekleyen} onAc={() => setPanelAcik(true)} />
        </div>

        <div className="px-5" style={{ marginTop: 18 }}>
          <h1 className="baslik">
            Alanını{' '}
            <br />
            seç<em>.</em>
          </h1>
          <p className="alt-metin">{sinav === 'yks' ? 'Üniversite sınavı: 4 alandan birini seç, hemen yarışa gir.' : 'Liselere geçiş: sözel ya da sayısal, 10 soru.'}</p>
        </div>

        <div className="sinav-sec" role="tablist" aria-label="Sınav">
          <button type="button" role="tab" aria-selected={sinav === 'yks'} onClick={() => sinavDegis('yks')}>
            <b>YKS</b>
            <span>Üniversite</span>
          </button>
          <button type="button" role="tab" aria-selected={sinav === 'lgs'} onClick={() => sinavDegis('lgs')}>
            <b>LGS</b>
            <span>8. sınıf</span>
          </button>
        </div>

        <div className="kat-izgara" key={sinav}>
          {kartlar.map(c => (
            <button key={c.k} type="button" className="kat" aria-pressed={secili === c.k} onClick={() => setSecili(c.k)}>
              <span className="kat-ust">
                <span className="kat-ikon">
                  <KategoriIkon k={c.k} />
                </span>
                <b>{c.kisa}</b>
              </span>
              <span className="kat-ad">{c.ad}</span>
            </button>
          ))}
        </div>

        <div className="dagilim" aria-live="polite" key={secili ?? 'bos'}>
          {bilgi ? bilgi.dagilim.map(d => <Cip key={d}>{d}</Cip>) : <span className="ipucu">Bir alan seç: ders dağılımı burada görünür.</span>}
        </div>

        <div className="mn-kartlar">
        <Link to="/yanlislarim" className="defter-kart" aria-label={defterSayi ? `Yanlışlarım: ${defterSayi} soru` : 'Yanlışlarım'}>
          <span className="defter-ikon">
            <IkDefter />
          </span>
          <span className="defter-metin">
            <b>Yanlışlarım</b>
            <small>{defterSayi === null ? '…' : defterSayi === 0 ? 'Defterin temiz ✓' : 'Tekrar çöz'}</small>
          </span>
          {defterSayi !== null && defterSayi > 0 && <span className="defter-rozet">{defterSayi}</span>}
          <span className="defter-ok" aria-hidden="true">›</span>
        </Link>
        <Link to="/performans" className="defter-kart perf-kart" aria-label="Performansım: akıllı analiz">
          <span className="defter-ikon">
            <IkGrafik />
          </span>
          <span className="defter-metin">
            <b>Performansım</b>
            <small>Akıllı analiz</small>
          </span>
          <span className="defter-ok" aria-hidden="true">›</span>
        </Link>
        </div>

        <div className="aksiyon">
          <Button
            className={`hk-btn${araniyor ? ' araniyor' : ''}`}
            onClick={hemenKatil}
            disabled={!secili || kuruluyor}
            aria-busy={araniyor}
            aria-describedby={secili ? undefined : 'hk-ipucu'}
            ikonSol={araniyor ? <span className="hk-mini" aria-hidden="true" /> : <IkSimsek />}
          >
            {araniyor ? 'Rakip aranıyor…' : 'Hemen Katıl'}
          </Button>
          {!secili && (
            <span id="hk-ipucu" className="hk-ipucu">
              Önce bir alan seç
            </span>
          )}
          <div className="ayrac" aria-hidden="true">
            <span>ya da arkadaşlarınla</span>
          </div>
          <Button tur="uc" onClick={lobiKur} disabled={!secili || kuruluyor || araniyor} ikonSol={<IkArti />}>
            {kuruluyor ? 'Lobi kuruluyor…' : 'Lobi kur'}
          </Button>
          <form
            className="katil-satir"
            onSubmit={e => {
              e.preventDefault()
              katil()
            }}
          >
            <label className="kod-giris">
              <b>QZ-</b>
              <input
                placeholder="KOD"
                maxLength={4}
                aria-label="Lobi kodu"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="go"
                value={kod}
                onChange={e => setKod(e.target.value.toUpperCase().replace(KOD_HARF, '').slice(0, 4))}
              />
            </label>
            <Button type="submit" tur="iki" blok={false}>
              Katıl
            </Button>
          </form>
          {hata && <div className="hata-kutu" style={{ margin: 0 }} role="alert">{hata}</div>}
        </div>

        <div className="lider kart">
          <div className="kart-bant">
            <span className="canli" />
            Canlı sıralama<span className="sag">Tüm zamanlar</span>
          </div>
          {lider === null ? (
            <div className="lider-bos">Yükleniyor…</div>
          ) : lider.length === 0 ? (
            <div className="lider-bos">Henüz kimse yarışmadı. İlk sen ol!</div>
          ) : (
            lider.map((r, i) => (
              <div key={r.userId} className={`lider-satir${r.userId === userId ? ' ben' : ''}`}>
                <span className="sira">{i + 1}</span>
                <Avatar avatarKey={r.avatarKey} photoUrl={r.photoUrl} ad={r.displayName} boyut={32} />
                <span className="ad">{r.userId === userId ? `${r.displayName} (sen)` : r.displayName}</span>
                <KademeRozet rankKey={r.rankKey} label={r.rankLabel} />
                <span className="puan">
                  {r.xp.toLocaleString('tr-TR')} <small>XP</small>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      {panelAcik && (
        <GorevPaneli
          veri={gorev.veri}
          hata={gorev.hata}
          kalanMs={gorev.kalanMs}
          aliniyor={aliniyor}
          kutlama={kutlama}
          onKapat={panelKapat}
          onAl={odulAl}
          onKisayol={kisayol}
          onYenile={gorev.yenile}
        />
      )}
      {rutbeAtladi && (
        <div className="rutbe-atladi rutbe-tost" role="status">
          <KademeRozet rankKey={rutbeAtladi.rankKey} boyut={48} label={rutbeAtladi.rankLabel} />
          <div>
            <b>Rütbe atladın!</b>
            <span>Yeni rütben: {rutbeAtladi.rankLabel}</span>
          </div>
        </div>
      )}
      {tost && (
        <div className="df-tost" role="alert">
          <span>{tost}</span>
        </div>
      )}
    </main>
  )
}
