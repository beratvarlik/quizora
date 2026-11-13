import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Cip from '../components/Cip'
import DevreHatlari from '../components/DevreHatlari'
import { BaglantiBandi, HataEkrani, Yukleniyor } from '../components/Durum'
import { BaslamaHalkasi, Radar } from '../components/HizliBekleme'
import { IkGeri, IkKopya, IkSimsek, IkTik } from '../components/Ikon'
import KademeRozet from '../components/KademeRozet'
import SesButonu from '../components/SesButonu'
import { sinavEtiketi } from '../components/Kategoriler'
import { hataMesaji } from '../hooks/hata'
import { useCountdown } from '../hooks/useCountdown'
import { useGame } from '../hooks/useGame'
import { useSes } from '../hooks/useSes'
import { api } from '../lib/client'

const LOBI_SINIRI = 5
/** Sunucu startIfReady'de started_at = now() + 3 sn yazar; herkese açık geri sayım bu payı da içerir. */
const BASLAMA_PAYI = 3000
/** 2. oyuncu gelince autoStartAt = +10 sn; halkanın tam dolu hâli (10 + 3 sn). */
const HALKA_TOPLAM = 10_000 + BASLAMA_PAYI
const UZUN_BEKLEME = 30_000
const DENEME = 8

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms))

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

function sureYaz(ms: number): string {
  const sn = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`
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
  // Lobiye oyuncu katılınca "pop" + (herkese açık lobide) halka parlaması
  const oyuncuSayisi = snapshot?.players.length ?? 0
  const oncekiSayi = useRef<number | null>(null)
  const [flas, setFlas] = useState(0)
  useEffect(() => {
    if (oncekiSayi.current !== null && oyuncuSayisi > oncekiSayi.current) {
      efekt('pop')
      setFlas(f => f + 1)
    }
    oncekiSayi.current = oyuncuSayisi
  }, [oyuncuSayisi, efekt])
  const katilmaLinki = `${window.location.origin}/join/${oyun?.code ?? code}`

  // Geri sayım bitince oyuna, oyun bitmişse sonuca geç.
  useEffect(() => {
    if (!oyun) return
    if (sayac.phase === 'oyun') git(`/oyun/${oyun.code}`, { replace: true })
    else if (oyun.status === 'finished') git(`/sonuc/${oyun.code}`, { replace: true })
  }, [sayac.phase, oyun, git])

  // ---------------- Herkese açık lobi (Hemen Katıl) ----------------
  const acik = Boolean(oyun?.isPublic)
  const lobide = oyun?.status === 'lobby'
  const autoStartAt = oyun?.autoStartAt ?? null
  const hedefMs = autoStartAt ? Date.parse(autoStartAt) + BASLAMA_PAYI : null
  const kalanMs = hedefMs !== null ? hedefMs - sayac.simdi : null
  const sureDoldu = acik && lobide && autoStartAt !== null && sayac.simdi >= Date.parse(autoStartAt)

  // Süre dolunca startIfReady: 500 ms arayla birkaç kez, hata yutulur, aynı anda tek istek (ref kilidi).
  const durumRef = useRef(oyun?.status)
  useEffect(() => {
    durumRef.current = oyun?.status
  }, [oyun?.status])
  const kilit = useRef(false)
  const denenen = useRef<string | null>(null)
  const [takildi, setTakildi] = useState(false)
  const [yeniden, setYeniden] = useState(0)
  useEffect(() => {
    if (!sureDoldu || !oyunId || !autoStartAt || kilit.current) return
    const anahtar = `${autoStartAt}#${yeniden}`
    if (denenen.current === anahtar) return
    denenen.current = anahtar
    kilit.current = true
    setTakildi(false)
    ;(async () => {
      for (let i = 0; i < DENEME && durumRef.current === 'lobby'; i++) {
        try {
          await api.startIfReady(oyunId)
        } catch {
          /* yut: başkası başlatmış ya da koşul sağlanmıyor */
        }
        await bekle(500)
      }
      kilit.current = false
      if (durumRef.current === 'lobby') setTakildi(true)
    })()
  }, [sureDoldu, oyunId, autoStartAt, yeniden])

  // "Rakip aranıyor" süresi (tek başına beklerken)
  const ariyor = acik && lobide && autoStartAt === null
  const [aramaBas, setAramaBas] = useState<number | null>(null)
  useEffect(() => {
    setAramaBas(ariyor ? Date.now() : null)
  }, [ariyor])
  const aramaMs = ariyor && aramaBas !== null ? Math.max(0, sayac.simdi - offsetMs - aramaBas) : 0

  // Sayfa kapanışında herkese açık lobiden çık (en iyi çaba, beklenmez)
  useEffect(() => {
    if (!acik || !lobide || !oyunId) return
    const cik = () => {
      api.leaveGame(oyunId).catch(() => {})
    }
    window.addEventListener('pagehide', cik)
    window.addEventListener('beforeunload', cik)
    return () => {
      window.removeEventListener('pagehide', cik)
      window.removeEventListener('beforeunload', cik)
    }
  }, [acik, lobide, oyunId])

  function geri() {
    if (acik && lobide && oyunId) api.leaveGame(oyunId).catch(() => {})
    git('/menu')
  }

  const [kuruluyor, setKuruluyor] = useState(false)
  async function kendiLobin() {
    if (!oyun || kuruluyor) return
    setKuruluyor(true)
    setHata(null)
    try {
      await api.leaveGame(oyun.id).catch(() => {})
      const { code: yeniKod } = await api.createGame(oyun.kategori)
      git(`/lobi/${yeniKod}`, { replace: true })
    } catch (e) {
      setHata(hataMesaji(e))
      setKuruluyor(false)
    }
  }

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

  /** Davet: telefonda paylaşım sayfası, yoksa bağlantıyı kopyala. */
  function davetEt() {
    if (navigator.share) {
      navigator.share({ title: 'Quizora', text: `Benimle yarış! Lobi kodu: ${oyun?.code}`, url: katilmaLinki }).catch(() => {})
      return
    }
    kopyala()
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

  // 3-2-1: oyun başladıysa startedAt'e, herkese açık lobide henüz başlamadıysa autoStartAt + 3 sn'ye göre.
  // Böylece halka (13 → 4) ile 3-2-1 kesintisiz tek bir geri sayım olur, 3-2-1 iki kez oynamaz.
  const onSayim = acik && lobide && kalanMs !== null && kalanMs <= BASLAMA_PAYI && kalanMs > -2500 && !takildi
  const geriSayimGoster = sayac.phase === 'gerisayim' || onSayim
  const geriSayimSayi = sayac.phase === 'gerisayim' ? sayac.geriSayim : Math.min(3, Math.max(1, Math.ceil((kalanMs ?? 0) / 1000)))

  const slotlar = (
    <>
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
            {!acik && p.userId === oyun.hostId && (
              <Cip dolu kucuk>
                HOST
              </Cip>
            )}
          </div>
        ))}
        {Array.from({ length: Math.max(0, LOBI_SINIRI - oyuncular.length) }, (_, i) => (
          <div key={`bos-${i}`} className="slot bos">
            <span className="yer" />
            {acik ? 'Rakip aranıyor…' : 'Bekleniyor…'}
          </div>
        ))}
      </div>
    </>
  )

  return (
    <main className={`sayfa lb-sayfa${acik ? ' lb-acik' : ''}`}>
      <BaglantiBandi />
      <DevreHatlari kose="sag-kenar" ust={404} boyut={220} />
      <DevreHatlari kose="sol-kenar" ust={476} boyut={220} />
      <div className="icerik">
        <header className="ust-bar">
          <button type="button" className="geri-btn" aria-label="Ana menüye dön" onClick={geri}>
            <IkGeri />
          </button>
          <div className="ust-sag">
            <Cip ikon={acik ? <IkSimsek boyut={14} /> : undefined}>
              {sinavEtiketi(oyun.kategori)} · {oyun.totalQuestions} soru
            </Cip>
            <SesButonu />
          </div>
        </header>

        {acik ? (
          <>
            <section className="hk-durum" aria-live="polite">
              {autoStartAt === null ? (
                <>
                  <Radar>
                    <Avatar avatarKey={me.avatarKey} photoUrl={me.photoUrl} ad={me.displayName} boyut={56} ben />
                  </Radar>
                  <h1 className="hk-baslik">Rakip aranıyor…</h1>
                  <p className="hk-alt">
                    <span className="hk-sure">{sureYaz(aramaMs)}</span> · Biri gelince yarış kendiliğinden başlar.
                  </p>
                </>
              ) : (
                <>
                  <BaslamaHalkasi kalanMs={kalanMs ?? 0} toplamMs={HALKA_TOPLAM} flas={flas} />
                  {takildi ? (
                    <>
                      <h1 className="hk-baslik">Yarış başlatılıyor…</h1>
                      <p className="hk-alt">
                        <button type="button" className="underline" onClick={() => setYeniden(n => n + 1)}>
                          Tekrar dene
                        </button>
                      </p>
                    </>
                  ) : (
                    <>
                      <h1 className="hk-baslik">
                        Yarış <em>{Math.max(0, Math.ceil((kalanMs ?? 0) / 1000))}</em> saniye sonra başlıyor
                      </h1>
                      <p className="hk-alt">
                        {oyuncular.length} oyuncu hazır{oyuncular.length < LOBI_SINIRI ? ' · 5 kişi olunca hemen başlar' : ''}
                      </p>
                    </>
                  )}
                </>
              )}
            </section>

            {slotlar}

            <div className="davet-kart kart">
              <div className="qr qr-kucuk">
                <QRCodeSVG value={katilmaLinki} size={64} level="M" bgColor="#FFFFFF" fgColor="#2B0E17" />
              </div>
              <div className="davet-metin">
                <span className="etiket">Arkadaşını da çağır</span>
                <b>{oyun.code}</b>
              </div>
              <button type="button" className={`kopya${kopyalandi ? ' tamam' : ''}`} onClick={kopyala}>
                {kopyalandi ? <IkTik /> : <IkKopya />}
                {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
          </>
        ) : (
          <>
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

            {slotlar}
          </>
        )}
        {hata && <div className="hata-kutu" role="alert">{hata}</div>}
        <div className="alt-bosluk" />
      </div>

      <div className="alt-cta">
        {acik ? (
          ariyor && aramaMs >= UZUN_BEKLEME ? (
            <div className="hk-uzun" role="status">
              <p>Biraz uzun sürdü. Arkadaşını davet et ya da kendi lobini kur.</p>
              <div className="hk-uzun-btn">
                <Button onClick={davetEt}>Arkadaşını davet et</Button>
                <Button tur="uc" onClick={kendiLobin} disabled={kuruluyor}>
                  {kuruluyor ? 'Kuruluyor…' : 'Kendi lobini kur'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="bekle-not" style={{ fontSize: 14 }}>
              {ariyor ? 'Aynı alanda yarışacak biri aranıyor.' : 'Lobi hazır. Yarış kendiliğinden başlayacak.'}
            </p>
          )
        ) : host ? (
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

      {geriSayimGoster && (
        <div className="geri-sayim" role="status" aria-live="assertive">
          <DevreHatlari kose="sag-kenar" ust="orta" boyut={240} koyu zemin="#702B3A" hiz={1.6} />
          <DevreHatlari kose="sol-alt" boyut={220} koyu zemin="#702B3A" hiz={1.6} />
          <span className="etiket gs-ust">Hazır ol</span>
          <span key={geriSayimSayi} className="sayi">
            {geriSayimSayi}
          </span>
        </div>
      )}
    </main>
  )
}
