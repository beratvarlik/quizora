import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Cip from '../components/Cip'
import DevreHatlari from '../components/DevreHatlari'
import { BaglantiBandi, Yukleniyor } from '../components/Durum'
import { IkArti } from '../components/Ikon'
import KademeRozet from '../components/KademeRozet'
import { KATEGORILER, KategoriIkon, kategoriBul } from '../components/Kategoriler'
import { hataMesaji } from '../hooks/hata'
import { useSession } from '../hooks/useSession'
import { api } from '../lib/client'
import type { GlobalRow, Kategori, MyStats, Sinav } from '../types'

const K_SINAV = 'quizora.sinav'
const KOD_HARF = /[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g

function sinavOku(): Sinav {
  try {
    return localStorage.getItem(K_SINAV) === 'lgs' ? 'lgs' : 'yks'
  } catch {
    return 'yks'
  }
}

export default function Menu() {
  const git = useNavigate()
  const { profile, userId, loading } = useSession()
  const [sinav, setSinav] = useState<Sinav>(sinavOku)
  const [secili, setSecili] = useState<Kategori | null>(null)
  const [kod, setKod] = useState('')
  const [stat, setStat] = useState<MyStats | null>(null)
  const [lider, setLider] = useState<GlobalRow[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [kuruluyor, setKuruluyor] = useState(false)

  useEffect(() => {
    if (!loading && !profile) git('/profil', { replace: true })
  }, [loading, profile, git])

  useEffect(() => {
    api.getMyStats().then(setStat, () => {})
    return api.subscribeGlobalLeaderboard(setLider)
  }, [])

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
    <main className="sayfa">
      <BaglantiBandi />
      <DevreHatlari kose="sag-kenar" ust="orta" boyut={220} />
      <DevreHatlari kose="sol-alt" boyut={200} />
      <div className="icerik">
        <header className="ust-bar">
          <Link to="/profil" className="ben-bar" aria-label="Profili düzenle">
            <Avatar avatarKey={profile.avatarKey} photoUrl={profile.photoUrl} ad={profile.displayName} boyut={36} ben />
            <div>
              <div className="ad">{profile.displayName}</div>
              <div className="ben-alt">Profili düzenle</div>
            </div>
          </Link>
          {stat && (
            <span className="rank-cip" aria-label={`Rütbe: ${stat.rankLabel}, ${stat.xp} XP`}>
              <KademeRozet rankKey={stat.rankKey} label={stat.rankLabel} />
              {stat.rankLabel} · {stat.xp} XP
            </span>
          )}
        </header>

        {stat && (
          <div className="kart ilerleme-kart">
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
          </div>
        )}

        <div className="px-5" style={{ marginTop: 18 }}>
          <h1 className="baslik">
            Alanını
            <br />
            seç<em>.</em>
          </h1>
          <p className="alt-metin">{sinav === 'yks' ? 'Üniversite sınavı: 4 alandan birini seç, lobiyi kur.' : 'Liselere geçiş: sözel ya da sayısal, 10 soru.'}</p>
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

        <div className="aksiyon">
          <Button onClick={lobiKur} disabled={!secili || kuruluyor} ikonSol={<IkArti />}>
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
    </main>
  )
}
