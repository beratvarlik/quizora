import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Avatar, { AVATAR_KEYS } from '../components/Avatar'
import AvatarSecici from '../components/AvatarSecici'
import Button from '../components/Button'
import DevreHatlari from '../components/DevreHatlari'
import { BaglantiBandi, Yukleniyor } from '../components/Durum'
import { IkKamera, IkOk } from '../components/Ikon'
import KademeRozet from '../components/KademeRozet'
import { UstBar } from '../components/Logo'
import { hataMesaji } from '../hooks/hata'
import { useSession } from '../hooks/useSession'
import { api } from '../lib/client'
import type { MyStats } from '../types'

const AD_EN_AZ = 2
const AD_EN_COK = 20

/** Güvenli yönlendirme: yalnızca uygulama içi yollar. */
function sonrakiYol(ham: string | null): string {
  return ham && ham.startsWith('/') && !ham.startsWith('//') ? ham : '/menu'
}

export default function Profil() {
  const git = useNavigate()
  const [params] = useSearchParams()
  const sonra = sonrakiYol(params.get('sonra'))
  const { profile, loading } = useSession()

  const [ad, setAd] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [stat, setStat] = useState<MyStats | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [zipla, setZipla] = useState(0)
  const dosya = useRef<HTMLInputElement>(null)
  const dolduruldu = useRef(false)

  // Profil gelince formu bir kez doldur; yoksa rastgele avatar öner.
  useEffect(() => {
    if (loading || dolduruldu.current) return
    dolduruldu.current = true
    if (profile) {
      setAd(profile.displayName)
      setAvatar(profile.avatarKey)
      setFotoUrl(profile.photoUrl)
    } else {
      setAvatar(AVATAR_KEYS[Math.floor(Math.random() * AVATAR_KEYS.length)])
    }
  }, [loading, profile])

  useEffect(() => {
    api.getMyStats().then(setStat, () => {})
  }, [])

  // Seçilen dosyanın önizlemesi
  useEffect(() => {
    if (!foto) return
    const url = URL.createObjectURL(foto)
    setFotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  const temizAd = ad.trim()
  const gecerli = temizAd.length >= AD_EN_AZ && temizAd.length <= AD_EN_COK
  const yeni = !profile
  const onizlemeAd = useMemo(() => temizAd || 'Sen', [temizAd])

  function avatarSec(k: string) {
    setAvatar(k)
    setFoto(null)
    setFotoUrl(null)
    setZipla(z => z + 1)
  }

  function dosyaSec(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) return setHata('Lütfen bir fotoğraf seç.')
    if (f.size > 5 * 1024 * 1024) return setHata('Fotoğraf çok büyük (en fazla 5 MB).')
    setHata(null)
    setFoto(f)
    setZipla(z => z + 1)
  }

  async function kaydet() {
    if (!gecerli) {
      setHata(`Adın ${AD_EN_AZ}–${AD_EN_COK} karakter olmalı.`)
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      await api.saveProfile({ displayName: temizAd, avatarKey: avatar, photoFile: foto ?? undefined })
      git(sonra, { replace: true })
    } catch (e) {
      setHata(hataMesaji(e))
      setKaydediliyor(false)
    }
  }

  if (loading) return <Yukleniyor />

  return (
    <main className="sayfa">
      <BaglantiBandi />
      <DevreHatlari kose="sag-kenar" ust={116} boyut={200} />
      <DevreHatlari kose="sol-kenar" ust={300} boyut={150} />
      <div className="icerik">
        <UstBar sag={<span className="etiket">{yeni ? 'Adım 1/2' : 'Profil'}</span>} />
        <div className="px-5 pt-2">
          <h1 className="baslik">
            Kim
            <br />
            yarışıyor<em>?</em>
          </h1>
          <p className="alt-metin">Avatarını seç, adını yaz. Rakiplerin seni bu kartla görecek.</p>
        </div>

        <div className="oyuncu-karti kart">
          <div className="kart-bant">
            Oyuncu kartı<span className="sag">{stat ? `${stat.xp} XP` : ''}</span>
          </div>
          <div className="govde">
            <span key={zipla} className={zipla ? 'zipla' : ''} style={{ display: 'inline-flex', borderRadius: '50%' }}>
              <Avatar avatarKey={avatar} photoUrl={fotoUrl} ad={onizlemeAd} boyut={104} ben />
            </span>
            <div className="min-w-0">
              <div className="isim">{onizlemeAd}</div>
              {stat && (
                <div className="bilgi">
                  <KademeRozet rankKey={stat.rankKey} label={stat.rankLabel} />
                  <span>{stat.rankLabel}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5" style={{ marginTop: 28 }}>
          <span className="etiket">Avatar</span>
        </div>
        <div className="mt-3 px-5">
          <AvatarSecici secili={foto || fotoUrl ? null : avatar} onSec={avatarSec} />
        </div>
        <button type="button" className="yukle-btn" aria-pressed={Boolean(fotoUrl)} onClick={() => dosya.current?.click()}>
          <IkKamera />
          {fotoUrl ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}
        </button>
        <input ref={dosya} type="file" accept="image/*" hidden onChange={dosyaSec} />

        <div className="alan">
          <label className="etiket" htmlFor="ad-in">
            Adın
          </label>
          <div className="isim-giris">
            <input
              id="ad-in"
              value={ad}
              maxLength={AD_EN_COK}
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Örn. Deniz"
              onChange={e => setAd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && kaydet()}
            />
            <span className="sayac">
              {ad.length}/{AD_EN_COK}
            </span>
          </div>
        </div>
        {hata && <div className="hata-kutu" role="alert">{hata}</div>}
        <div className="alt-bosluk" />
      </div>

      <div className="alt-cta">
        <Button onClick={kaydet} disabled={kaydediliyor || !gecerli} ikonSag={<IkOk />}>
          {kaydediliyor ? 'Kaydediliyor…' : yeni ? 'Devam et' : 'Kaydet'}
        </Button>
      </div>
    </main>
  )
}
