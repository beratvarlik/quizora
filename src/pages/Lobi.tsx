import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Cip from '../components/Cip'
import DevreHatlari from '../components/DevreHatlari'
import { BaglantiBandi, HataEkrani, Yukleniyor } from '../components/Durum'
import { IkGeri, IkKopya, IkTik } from '../components/Ikon'
import KademeRozet from '../components/KademeRozet'
import SesButonu from '../components/SesButonu'
import { sinavEtiketi } from '../components/Kategoriler'
import { hataMesaji } from '../hooks/hata'
import { useCountdown } from '../hooks/useCountdown'
import { useGame } from '../hooks/useGame'
import { useSes } from '../hooks/useSes'
import { api } from '../lib/client'

const LOBI_SINIRI = 5

/** Panoya yaz: http (LAN IP) üzerinde navigator.clipboard yok, eski yönteme düş. */
async function panoyaYaz(metin: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(metin)
      return true
    }
  } catch {
    /* aşağıdaki yönteme düş */
  }
  try {
    const t = document.createElement('textarea')
    t.value = metin
    t.setAttribute('readonly', '')
    t.style.position = 'fixed'
    t.style.opacity = '0'
    document.body.appendChild(t)
    t.select()
    t.setSelectionRange(0, metin.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(t)
    return ok
  } catch {
    return false
  }
}

export default function Lobi() {
  const { code = '' } = useParams()
  const git = useNavigate()
  const { snapshot, me, userId, offsetMs, loading, error } = useGame(code)
  const sayac = useCountdown(snapshot?.game, offsetMs)
  const [kopyalandi, setKopyalandi] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [basliyor, setBasliyor] = useState(false)

  const oyun = snapshot?.game
  const ses = useSes()
  const { muzikModu, baslangicPlanla, efekt } = ses

  // Lobide sakin müzik; geri sayım başlayınca 3-2-1 bipleri + başlama kornası planlanır.
  useEffect(() => muzikModu('sakin'), [muzikModu])
  const oyunId = oyun?.id
  const baslangicZamani = oyun?.startedAt
  useEffect(() => {
    if (oyunId && baslangicZamani && sayac.phase === 'gerisayim') baslangicPlanla(oyunId, new Date(baslangicZamani).getTime(), offsetMs)
  }, [oyunId, baslangicZamani, sayac.phase, offsetMs, baslangicPlanla])
  // Lobiye oyuncu katılınca "pop"
  const oyuncuSayisi = snapshot?.players.length ?? 0
  const oncekiSayi = useRef<number | null>(null)
  useEffect(() => {
    if (oncekiSayi.current !== null && oyuncuSayisi > oncekiSayi.current) efekt('pop')
    oncekiSayi.current = oyuncuSayisi
  }, [oyuncuSayisi, efekt])
  const katilmaLinki = `${window.location.origin}/join/${oyun?.code ?? code}`

  // Geri sayım bitince oyuna, oyun bitmişse sonuca geç.
  useEffect(() => {
    if (!oyun) return
    if (sayac.phase === 'oyun') git(`/oyun/${oyun.code}`, { replace: true })
    else if (oyun.status === 'finished') git(`/sonuc/${oyun.code}`, { replace: true })
  }, [sayac.phase, oyun, git])

  async function kopyala() {
    const ok = await panoyaYaz(katilmaLinki)
    if (ok) efekt('kopya')
    if (!ok && navigator.share) {
      navigator.share({ title: 'Quizora', text: `Lobi kodu: ${oyun?.code}`, url: katilmaLinki }).catch(() => {})
      return
    }
    setKopyalandi(ok)
    if (!ok) setHata(`Kopyalanamadı. Kodu elle paylaş: ${oyun?.code}`)
    window.setTimeout(() => setKopyalandi(false), 1500)
  }

  async function baslat() {
    if (!oyun) return
    setBasliyor(true)
    setHata(null)
    try {
      await api.startGame(oyun.id)
    } catch (e) {
      setHata(hataMesaji(e))
      setBasliyor(false)
    }
  }

  if (loading) return <Yukleniyor />
  if (error || !snapshot || !oyun) return <HataEkrani mesaj={error ?? 'Lobi bulunamadı.'} />
  if (!me) return <HataEkrani mesaj="Bu lobide değilsin. Kodla katılmayı dene." />

  const host = oyun.hostId === userId
  const oyuncular = snapshot.players
  const yeterli = oyuncular.length >= 2

  return (
    <main className="sayfa lb-sayfa">
      <BaglantiBandi />
      <DevreHatlari kose="sag-kenar" ust={404} boyut={220} />
      <DevreHatlari kose="sol-kenar" ust={476} boyut={220} />
      <div className="icerik">
        <header className="ust-bar">
          <button type="button" className="geri-btn" aria-label="Ana menüye dön" onClick={() => git('/menu')}>
            <IkGeri />
          </button>
          <div className="ust-sag">
            <Cip>
              {sinavEtiketi(oyun.kategori)} · {oyun.totalQuestions} soru
            </Cip>
            <SesButonu />
          </div>
        </header>

        <div className="kod-blok">
          <div>
            <span className="etiket">Lobi kodu</span>
            <div className="kod-buyuk">{oyun.code}</div>
          </div>
          <button type="button" className={`kopya${kopyalandi ? ' tamam' : ''}`} onClick={kopyala}>
            {kopyalandi ? <IkTik /> : <IkKopya />}
            {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>

        <div className="qr-kart kart">
          <div className="qr">
            <QRCodeSVG value={katilmaLinki} size={102} level="M" bgColor="#FFFFFF" fgColor="#2B0E17" />
          </div>
          <div className="qr-metin">
            <b>
              Okut,
              <br />
              katıl.
            </b>
            <p>Arkadaşın kamerayla okutsun ya da menüde kodu girsin.</p>
          </div>
        </div>

        <div className="slot-baslik">
          <span className="etiket">Oyuncular</span>
          <span className="etiket">
            {oyuncular.length}/{LOBI_SINIRI}
          </span>
        </div>
        <div className="slotlar">
          {oyuncular.map(p => (
            <div key={p.userId} className="slot dolu">
              <Avatar avatarKey={p.avatarKey} photoUrl={p.photoUrl} ad={p.displayName} boyut={38} ben={p.userId === userId} />
              <span className="ad">
                {p.displayName}
                {p.userId === userId ? ' (sen)' : ''}
              </span>
              <span className="rutbe">
                <KademeRozet rankKey={p.rankKey} label={p.rankLabel} boyut={18} />
                {p.rankLabel}
              </span>
              {p.userId === oyun.hostId && (
                <Cip dolu kucuk>
                  HOST
                </Cip>
              )}
            </div>
          ))}
          {Array.from({ length: Math.max(0, LOBI_SINIRI - oyuncular.length) }, (_, i) => (
            <div key={`bos-${i}`} className="slot bos">
              <span className="yer" />
              Bekleniyor…
            </div>
          ))}
        </div>
        {hata && <div className="hata-kutu" role="alert">{hata}</div>}
        <div className="alt-bosluk" />
      </div>

      <div className="alt-cta">
        {host ? (
          <>
            <Button onClick={baslat} disabled={!yeterli || basliyor || oyun.status !== 'lobby'}>
              {basliyor || oyun.status !== 'lobby' ? 'Başlıyor…' : 'Yarışmayı başlat'}
            </Button>
            <p className="bekle-not">{yeterli ? `${oyuncular.length} oyuncu hazır. İstersen daha fazlasını bekle.` : 'Başlamak için en az 2 oyuncu gerekli.'}</p>
          </>
        ) : (
          <p className="bekle-not" style={{ fontSize: 15 }}>
            Lobiyi kuran yarışı başlatacak. Hazır ol!
          </p>
        )}
      </div>

      {sayac.phase === 'gerisayim' && (
        <div className="geri-sayim" role="status" aria-live="assertive">
          <DevreHatlari kose="sag-kenar" ust="orta" boyut={240} koyu zemin="#702B3A" hiz={1.6} />
          <DevreHatlari kose="sol-alt" boyut={220} koyu zemin="#702B3A" hiz={1.6} />
          <span className="etiket gs-ust">Hazır ol</span>
          <span key={sayac.geriSayim} className="sayi">
            {sayac.geriSayim}
          </span>
        </div>
      )}
    </main>
  )
}
