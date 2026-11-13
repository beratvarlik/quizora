import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Alevler from '../components/Alevler'
import CanliSerit from '../components/CanliSerit'
import DevreHatlari from '../components/DevreHatlari'
import DikeySiralama from '../components/DikeySiralama'
import { BaglantiBandi, HataEkrani, Yukleniyor } from '../components/Durum'
import HizBildirimi from '../components/HizBildirimi'
import HizRozeti from '../components/HizRozeti'
import { IkCarpi, IkTik } from '../components/Ikon'
import { sinavEtiketi, sinavHarfleri } from '../components/Kategoriler'
import SesButonu from '../components/SesButonu'
import SureHalkasi from '../components/SureHalkasi'
import { gorevAnlikKaydet } from '../hooks/gorevler'
import { hataMesaji } from '../hooks/hata'
import { useBitir } from '../hooks/useBitir'
import { useCountdown } from '../hooks/useCountdown'
import { useSes } from '../hooks/useSes'
import { useGame } from '../hooks/useGame'
import { api } from '../lib/client'
import type { AnswerResult, PlayerState, Question, Secenek } from '../types'

const GERI_BILDIRIM_MS = 1500
const CIKIS_MS = 250
/** "Tarih (AYT)" → "Tarih": çipte yalnızca ders adı. */
const dersAdi = (d: string) => d.replace(/\s*\((AYT|TYT|LGS)\)\s*$/, '')

type Sonuc = 'd' | 'y' | 'b'
interface Geri { secenek: Secenek | null; sonuc: AnswerResult }

const sureYazi = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Oyun() {
  const { code = '' } = useParams()
  const git = useNavigate()
  const { snapshot, me, userId, offsetMs, loading, error } = useGame(code)
  const oyun = snapshot?.game
  const sayac = useCountdown(oyun, offsetMs)
  const ses = useSes()
  const { baslangicPlanla, oyunDurumu, sayac: sesSayac, hizGecisi, boguk, oyunBitti, efekt } = ses

  const [pos, setPos] = useState<number | null>(null) // şu an çözülen soru (0..9)
  const [soru, setSoru] = useState<Question | null>(null)
  const [secili, setSecili] = useState<Secenek | null>(null)
  const [geri, setGeri] = useState<Geri | null>(null)
  const [sonuclar, setSonuclar] = useState<Record<number, Sonuc>>({})
  const [puan, setPuan] = useState<number | null>(null)
  const [bitirdim, setBitirdim] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [hizAni, setHizAni] = useState<PlayerState | null>(null)
  const [deneme, setDeneme] = useState(0)
  const [cikiyor, setCikiyor] = useState(false)
  const isteniyor = useRef<number | null>(null)
  const gonderiliyor = useRef(false)
  const oncekiHiz = useRef<string | null | undefined>(undefined)
  const rozet = useRef<HTMLSpanElement>(null)
  const ekran = useRef<HTMLDivElement>(null)

  const toplam = oyun?.totalQuestions ?? 10

  // İlk yüklemede sunucudaki ilerlemeyle eşitle (sayfa yenilenirse kaldığı sorudan devam).
  // Sonrasında ilerlemeyi yerel akış yönetir; böylece geri bildirim bandı yarıda kesilmez.
  const esitlendi = useRef(false)
  useEffect(() => {
    if (!me || esitlendi.current) return
    esitlendi.current = true
    setPos(me.currentQ)
    setPuan(me.score)
    if (me.finished || me.currentQ >= toplam) setBitirdim(true)
  }, [me, toplam])

  // Faz yönlendirmeleri (ENTEGRASYON.md §7-8). Snapshot gelmeyebilir: sayaç (2× dahil) her 100 ms
  // yerel olarak hesaplanır; süre dolunca ya da herkes bitirince finishGame (tek sefer, yeniden
  // denemeli) çağrılır ve sonuca geçilir. Oyun zaten bitmişse (sayfa yenileme) doğrudan sonuca.
  const herkesBitti = Boolean(snapshot && snapshot.players.length > 0 && snapshot.players.every(p => p.finished))
  const { bitir, bekliyor: sonucBekleniyor, hata: bitirHata } = useBitir(oyun?.id, oyun?.code)
  const oyunId = oyun?.id
  // Günlük görevler: yarıştan önceki hâl (sonuç ekranı "Görev ilerledi" bandı için karşılaştırır)
  useEffect(() => {
    if (oyunId) void gorevAnlikKaydet(oyunId)
  }, [oyunId])
  const durum = oyun?.status
  const oyunKodu = oyun?.code
  const sureBitti = sayac.phase === 'bitti'
  useEffect(() => {
    if (!durum || !oyunKodu) return
    if (durum === 'lobby') {
      git(`/lobi/${oyunKodu}`, { replace: true })
      return
    }
    if (durum === 'finished') {
      // Müzik çalıyorsa bitiş kornası (kısa – kısa – UZUN) bitince sonuca geç; yenilemede korna yok.
      const t = window.setTimeout(() => git(`/sonuc/${oyunKodu}`, { replace: true }), oyunId ? oyunBitti(oyunId) : 0)
      return () => window.clearTimeout(t)
    }
    if (sureBitti || herkesBitti) {
      const t = window.setTimeout(() => void bitir(oyunId ? oyunBitti(oyunId) : 0), geri ? 900 : 0)
      return () => window.clearTimeout(t)
    }
  }, [durum, oyunKodu, oyunId, sureBitti, herkesBitti, geri, bitir, git, oyunBitti])

  // ---- Ses: başlama kornası, müzik seviyesi, son saniyeler, boğuk bekleme ----
  const baslangicZamani = oyun?.startedAt
  useEffect(() => {
    if (oyunId && baslangicZamani && (sayac.phase === 'gerisayim' || sayac.phase === 'oyun'))
      baslangicPlanla(oyunId, new Date(baslangicZamani).getTime(), offsetMs)
  }, [oyunId, baslangicZamani, sayac.phase, offsetMs, baslangicPlanla])
  const oyunSuruyor = sayac.phase === 'oyun' && durum === 'playing' && !herkesBitti
  const son20 = sayac.kalanMs <= 20000
  const son3 = sayac.kalanMs <= 3000
  useEffect(() => {
    if (oyunSuruyor) oyunDurumu({ hizli: sayac.hizli, son20, son3 })
  }, [oyunSuruyor, sayac.hizli, son20, son3, oyunDurumu])
  const ekranSaniye = Math.ceil(sayac.kalanMs / 1000)
  const kalanRef = useRef(sayac.kalanMs)
  kalanRef.current = sayac.kalanMs
  useEffect(() => {
    if (oyunSuruyor && oyunId) sesSayac(oyunId, kalanRef.current, sayac.hizli)
  }, [oyunSuruyor, oyunId, ekranSaniye, sayac.hizli, sesSayac])
  useEffect(() => {
    boguk(bitirdim && oyunSuruyor)
  }, [bitirdim, oyunSuruyor, boguk])
  useEffect(() => () => boguk(false), [boguk])

  // 2× anı: oyun sırasında speedupBy ilk kez dolunca bir kez oynat.
  useEffect(() => {
    if (!oyun || !snapshot) return
    const simdiki = oyun.speedupBy
    if (oncekiHiz.current === undefined) {
      oncekiHiz.current = simdiki // ilk yükleme: zaten 2× ise animasyon yok
      return
    }
    if (!oncekiHiz.current && simdiki) {
      const kim = snapshot.players.find(p => p.userId === simdiki)
      if (kim) setHizAni(kim)
      hizGecisi()
    }
    oncekiHiz.current = simdiki
  }, [oyun, snapshot, hizGecisi])

  // Sıradaki soruyu getir.
  const soruGetir = useCallback(
    async (p: number) => {
      if (!oyun || isteniyor.current === p) return
      isteniyor.current = p
      setHata(null)
      try {
        const q = await api.getQuestion(oyun.id, p)
        setSoru(q)
        setSecili(null)
      } catch (e) {
        const m = hataMesaji(e)
        isteniyor.current = null
        if (/başlamadı/i.test(m)) window.setTimeout(() => setDeneme(d => d + 1), 600) // saat farkı: biraz sonra yine dene
        else if (!/süre doldu|oyun bitti/i.test(m)) setHata(m)
      }
    },
    [oyun],
  )

  useEffect(() => {
    if (sayac.phase !== 'oyun' || pos === null || bitirdim || geri || pos >= toplam) return
    if (soru?.position === pos) return
    void soruGetir(pos)
  }, [sayac.phase, pos, bitirdim, geri, soru, toplam, soruGetir, deneme])

  async function cevapla(s: Secenek | null) {
    if (!oyun || !soru || geri || gonderiliyor.current || sayac.phase !== 'oyun') return
    gonderiliyor.current = true
    setSecili(s)
    efekt('tik')
    try {
      const r = await api.submitAnswer(oyun.id, soru.position, s)
      if (s !== null) efekt(r.correct ? 'dogru' : 'yanlis')
      setGeri({ secenek: s, sonuc: r })
      setPuan(r.newScore)
      setSonuclar(o => ({ ...o, [soru.position]: s === null ? 'b' : r.correct ? 'd' : 'y' }))
      // Geri bildirimden sonra eski kart sola kayıp solar (250 ms), ardından yenisi sağdan gelir.
      window.setTimeout(() => setCikiyor(true), GERI_BILDIRIM_MS)
      window.setTimeout(() => {
        setCikiyor(false)
        setGeri(null)
        setSecili(null)
        if (r.finished) setBitirdim(true)
        setPos(soru.position + 1)
      }, GERI_BILDIRIM_MS + CIKIS_MS)
    } catch (e) {
      const m = hataMesaji(e)
      setSecili(null)
      if (/zaten cevaplandı|sıra dışı/i.test(m)) {
        setPos(me ? Math.max(me.currentQ, soru.position + 1) : soru.position + 1) // sunucu önde: sıradakine geç
        if (me && me.currentQ >= toplam) setBitirdim(true)
      } else if (!/süre doldu|oyun bitti/i.test(m)) {
        setHata(m)
      }
    } finally {
      gonderiliyor.current = false
    }
  }

  if (loading) return <Yukleniyor />
  if (error || !snapshot || !oyun) return <HataEkrani mesaj={error ?? 'Oyun bulunamadı.'} />
  if (!me) return <HataEkrani mesaj="Bu yarışta değilsin." />

  const hizli = sayac.hizli
  const dogruSayisi = Object.values(sonuclar).filter(v => v === 'd').length
  const yanlisSayisi = Object.values(sonuclar).filter(v => v === 'y').length
  const benimPuan = puan ?? me.score
  const suAnki = pos ?? me.currentQ
  // Şık sayısı sorudan gelir (boş/null şık gösterilmez); LGS'de E asla gösterilmez.
  const harfler = soru ? sinavHarfleri(oyun.sinav).filter(h => soru.options[h]?.trim()) : []
  const bitiren = oyun.speedupBy ? snapshot.players.find(p => p.userId === oyun.speedupBy) : null

  return (
    <main className={`sayfa oy-sayfa${hizli ? ' koyu-ekran' : ''}`}>
      <BaglantiBandi />
      <DevreHatlari kose="sol-alt" boyut={180} soluk={!hizli} koyu={hizli} hiz={hizli ? 2.5 : 1} zemin={hizli ? '#1E0910' : undefined} />
      <DevreHatlari kose="sag-alt" boyut={180} soluk={!hizli} koyu={hizli} hiz={hizli ? 2.5 : 1} zemin={hizli ? '#1E0910' : undefined} />
      {hizli && <Alevler son10={sayac.kalanMs <= 10000} />}
      <div className="icerik oyun-ust" ref={ekran}>
        <CanliSerit oyuncular={snapshot.players} benId={userId ?? ''} koyu={hizli} hizli={hizli} toplamSoru={toplam} />

        <div className="durum-satir">
          <SureHalkasi kalanMs={sayac.kalanMs} toplamMs={oyun.durationMs} hizli={hizli} />
          <div className="ilerleme">
            <div className="ust2">
              <span className="soru-no">
                {bitirdim ? 'Bitti' : `Soru ${Math.min(suAnki + 1, toplam)}`} <span>/ {toplam}</span>
              </span>
              <span className="flex items-center gap-2">
                {hizli && <HizRozeti ref={rozet} gizli={Boolean(hizAni)} />}
                <SesButonu koyu={hizli} />
              </span>
            </div>
            <div className="segmentler" aria-hidden="true">
              {Array.from({ length: toplam }, (_, i) => {
                const s = sonuclar[i]
                const cls = s ?? (i < suAnki ? 'b' : i === suAnki && !bitirdim ? 'su' : '')
                return <span key={i} className={`seg ${cls}`} />
              })}
            </div>
          </div>
          <div className="puan-kutu">
            <b>{benimPuan}</b>
            <span className="etiket">Puan</span>
          </div>
        </div>

        {bitirdim ? (
          <div className="bekleme kart">
            <h2>
              Bitirdin<em className="text-[color:var(--orange)] not-italic">!</em>
            </h2>
            <p>
              {oyun.speedupBy === userId
                ? 'İlk bitiren sensin: rakiplerin için süre artık 2× hızlı akıyor.'
                : 'Diğer oyuncular bitirince ya da süre dolunca sonuçlar açılacak.'}
            </p>
            <div className="buyuk">{sureYazi(sayac.kalanMs)}</div>
            <p>
              {Math.max(me.correctCount, dogruSayisi)} doğru · {Math.max(me.wrongCount, yanlisSayisi)} yanlış
            </p>
            {sonucBekleniyor && <p>Sonuçlar hazırlanıyor…</p>}
            {bitirHata && (
              <div className="mt-4">
                <p className="text-[color:var(--yanlis)] font-semibold">{bitirHata}</p>
                <button type="button" className="btn btn-ana btn-blok mt-3" onClick={() => void bitir()}>
                  Tekrar dene
                </button>
              </div>
            )}
          </div>
        ) : sayac.phase === 'gerisayim' ? (
          <div className="bekleme kart">
            <h2>Hazır ol</h2>
            <div className="buyuk">{sayac.geriSayim}</div>
          </div>
        ) : !soru || soru.position !== suAnki ? (
          <div className="yukleniyor" style={{ minHeight: 260 }} role="status" aria-label="Soru yükleniyor">
            <span />
          </div>
        ) : (
          <div key={soru.position} className={`soru-sahne soru-gir${cikiyor ? ' cik' : ''}`}>
            <div className="soru-kart">
              <div className="soru-ust">
                <span className="ders-cip">{dersAdi(soru.ders)}</span>
                <span className="sinav-yazi">{sinavEtiketi(oyun.kategori)}</span>
              </div>
              {soru.imageUrl && <img src={soru.imageUrl} alt="" />}
              <div className="metin">{soru.text}</div>
            </div>
            <div className={`siklar${harfler.length <= 4 ? ' siklar-4' : ''}`} role="group" aria-label="Şıklar">
              {harfler.map((h, i) => {
                let cls = ''
                let ikon: 'tik' | 'carpi' | null = null
                if (geri) {
                  if (h === geri.secenek) {
                    cls = geri.sonuc.correct ? 'dogru' : 'yanlis'
                    ikon = geri.sonuc.correct ? 'tik' : 'carpi'
                  } else if (h === geri.sonuc.correctOption) {
                    cls = 'dogrusu'
                    ikon = 'tik'
                  } else cls = 'soluk'
                } else if (h === secili) cls = 'secili'
                return (
                  <button
                    key={h}
                    type="button"
                    className={`sik ${cls}`}
                    style={{ '--i': i } as React.CSSProperties}
                    disabled={Boolean(geri) || secili !== null}
                    onClick={() => cevapla(h)}
                  >
                    <span className="harf">{h}</span>
                    <span className="sik-metin">{soru.options[h]}</span>
                    {ikon && <span className="sik-ikon">{ikon === 'tik' ? <IkTik boyut={16} /> : <IkCarpi boyut={16} />}</span>}
                  </button>
                )
              })}
              <button type="button" className="bos-gec" disabled={Boolean(geri) || secili !== null} onClick={() => cevapla(null)}>
                Boş geç
              </button>
            </div>
          </div>
        )}
        {bitirHata && !bitirdim && (
          <div className="hata-kutu" role="alert">
            {bitirHata}{' '}
            <button type="button" className="underline" onClick={() => void bitir()}>
              Tekrar dene
            </button>
          </div>
        )}
        {hata && (
          <div className="hata-kutu" role="alert">
            {hata}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setHata(null)
                isteniyor.current = null
                setDeneme(d => d + 1)
              }}
            >
              Tekrar dene
            </button>
          </div>
        )}
        <DikeySiralama oyuncular={snapshot.players} benId={userId ?? ''} toplamSoru={toplam} />
      </div>

      {geri && (
        <div className={`bant ${geri.secenek === null ? 'b' : geri.sonuc.correct ? 'd' : 'y'}`} role="status" aria-live="polite">
          <span className="bant-ikon">{geri.sonuc.correct ? <IkTik boyut={22} /> : <IkCarpi boyut={22} />}</span>
          <div>
            <b>{geri.secenek === null ? 'Boş geçildi' : geri.sonuc.correct ? `Doğru! +${geri.sonuc.points}` : `Yanlış ${geri.sonuc.points}`}</b>
            <small>
              {geri.sonuc.correct
                ? 'Hızlı cevap, fazla puan.'
                : harfler.includes(geri.sonuc.correctOption)
                  ? `Doğru cevap: ${geri.sonuc.correctOption}`
                  : 'Bir sonraki soruya geçiliyor.'}
            </small>
          </div>
        </div>
      )}

      {hizAni && bitiren && (
        <HizBildirimi
          bitiren={{ ad: bitiren.userId === userId ? 'Sen' : bitiren.displayName, avatarKey: bitiren.avatarKey, photoUrl: bitiren.photoUrl }}
          hedef={rozet}
          sarsilacak={ekran}
          onBitti={() => setHizAni(null)}
        />
      )}
    </main>
  )
}
