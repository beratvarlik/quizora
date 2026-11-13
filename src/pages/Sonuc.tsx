import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import DevreHatlari from '../components/DevreHatlari'
import { BaglantiBandi, HataEkrani, Yukleniyor } from '../components/Durum'
import { Tac } from '../components/Ikon'
import KademeRozet from '../components/KademeRozet'
import { sinavEtiketi } from '../components/Kategoriler'
import { UstBar } from '../components/Logo'
import { hataMesaji } from '../hooks/hata'
import { finishGameYeniden } from '../hooks/useBitir'
import { useGame } from '../hooks/useGame'
import { useSes } from '../hooks/useSes'
import SoruInceleme from '../components/SoruInceleme'
import { api } from '../lib/client'
import type { GameResult, MyStats } from '../types'

export default function Sonuc() {
  const { code = '' } = useParams()
  const git = useNavigate()
  const konum = useLocation()
  const { snapshot, userId, loading, error } = useGame(code)
  const oyun = snapshot?.game
  const oyunId = oyun?.id
  // Oyun ekranı finishGame'i çağırıp sonucu buraya taşır; yoksa (yenileme / bağlantı) burada alınır.
  const gelen = (konum.state as { sonuc?: GameResult } | null)?.sonuc ?? null
  const [sonuc, setSonuc] = useState<GameResult | null>(gelen)
  const [stat, setStat] = useState<MyStats | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [bar, setBar] = useState(0)
  const [kuruluyor, setKuruluyor] = useState(false)
  const [deneme, setDeneme] = useState(0)
  const [isilti, setIsilti] = useState(0)
  const ses = useSes()
  const { toren, efekt } = ses
  const kilit = useRef(false)
  const bagli = useRef(true)
  useEffect(() => {
    bagli.current = true
    return () => {
      bagli.current = false
    }
  }, [])

  // Yalnızca oyun kimliğine bağlı: snapshot yenilendikçe (3 sn'de bir) yeniden başlamaz/iptal olmaz.
  useEffect(() => {
    if (!oyunId || kilit.current) return
    kilit.current = true
    ;(async () => {
      try {
        const r = sonuc ?? (await finishGameYeniden(oyunId))
        if (!bagli.current) return
        setSonuc(r)
        api.getMyStats().then(s => bagli.current && setStat(s), () => {})
      } catch (e) {
        if (!bagli.current) return
        kilit.current = false
        // Yarış sürüyorsa (doğrudan /sonuc açıldıysa) bekleme ekranına dön.
        if (/henüz bitmedi/i.test(hataMesaji(e))) git(`/oyun/${code}`, { replace: true })
        else setHata('Sonuçlar alınamadı, tekrar dene')
      }
    })()
  }, [oyunId, deneme, sonuc, code, git])

  // Tören sesleri: her sıra satırına "dum", gerilim, zafer fanfarı + tezahürat; sonra kutlama döngüsü.
  useEffect(() => {
    if (!sonuc || !oyunId) return
    const benim = sonuc.ranking.find(r => r.userId === userId)
    toren(oyunId, sonuc.ranking.length, benim?.rank ?? null, Boolean(benim?.rankedUp))
  }, [sonuc, oyunId, userId, toren])

  useEffect(() => {
    if (!stat) return
    const t = window.setTimeout(() => setBar(stat.progressPct), 250)
    return () => window.clearTimeout(t)
  }, [stat])

  async function tekrarOyna() {
    if (!oyun) return
    setKuruluyor(true)
    try {
      const { code: yeni } = await api.createGame(oyun.kategori)
      git(`/lobi/${yeni}`)
    } catch (e) {
      setHata(hataMesaji(e))
      setKuruluyor(false)
    }
  }

  if (loading) return <Yukleniyor />
  if (error || !oyun) return <HataEkrani mesaj={error ?? 'Oyun bulunamadı.'} />
  if (hata && !sonuc)
    return (
      <HataEkrani
        mesaj={hata}
        onTekrar={() => {
          setHata(null)
          setDeneme(d => d + 1)
        }}
      />
    )
  if (!sonuc) {
    return (
      <main className="sayfa">
        <BaglantiBandi />
        <UstBar />
        <div className="icerik px-5 pt-6">
          <h1 className="baslik">
            Sonuçlar
            <br />
            geliyor<em>…</em>
          </h1>
          <p className="alt-metin">Diğer oyuncular bitirince ya da süre dolunca sıralama açılacak.</p>
          <div className="yukleniyor" style={{ minHeight: 200 }}>
            <span />
          </div>
        </div>
      </main>
    )
  }

  const ranking = sonuc.ranking
  const kazanan = ranking.find(r => r.userId === sonuc.winnerId) ?? ranking[0]
  const ben = ranking.find(r => r.userId === userId)
  const benKazandim = kazanan?.userId === userId
  const b = sonuc.breakdown
  const xp = sonuc.xpBreakdown

  return (
    <main className="sayfa sn-sayfa">
      <BaglantiBandi />
      <div className="icerik">
        <section className="kazanan">
          <DevreHatlari kose="sag-ust" boyut={200} koyu zemin="#702B3A" />
          <UstBar sag={<span className="etiket">{sinavEtiketi(oyun.kategori)} · sonuç</span>} />
          {kazanan && (
            <div className="sat">
              <button
                type="button"
                className={`tac-av${isilti ? ' zipla' : ''}`}
                key={isilti}
                aria-label={`${kazanan.displayName}: kutla`}
                onClick={() => {
                  efekt('isilti')
                  setIsilti(i => i + 1)
                }}
              >
                <span className="tac">
                  <Tac />
                </span>
                <Avatar avatarKey={kazanan.avatarKey} photoUrl={kazanan.photoUrl} ad={kazanan.displayName} boyut={96} ben={benKazandim} />
              </button>
              <div className="min-w-0">
                <span className="etiket">Kazanan</span>
                <h1>{benKazandim ? 'Kazandın!' : kazanan.displayName}</h1>
                <div className="alt">
                  {kazanan.score} puan · {kazanan.correctCount} doğru
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="sn-panel">
        <h2 className="sn-baslik">Sonucum</h2>
        {ben && (
          <div className="puan-satir">
            <div>
              <span className="etiket">Puanın</span>
              <div className="puan-dev">{ben.score}</div>
            </div>
            <div className="sira-rozet">
              {ben.rank}. <small>/ {ranking.length} oyuncu</small>
            </div>
          </div>
        )}

        <div className="sayaclar">
          <div className="sayac-k sk-d">
            <b>{b.correct}</b>
            <span>Doğru</span>
          </div>
          <div className="sayac-k sk-y">
            <b>{b.wrong}</b>
            <span>Yanlış</span>
          </div>
          <div className="sayac-k sk-b">
            <b>{b.blank}</b>
            <span>Boş</span>
          </div>
        </div>

        <div className="fis kart">
          <div className="fis-satir">
            <span>Doğru cevaplar ({b.correct} × 100)</span>
            <b className="art">+{b.base}</b>
          </div>
          <div className="fis-satir">
            <span>Hız bonusu</span>
            <b className="art">+{b.bonus}</b>
          </div>
          <div className="fis-satir">
            <span>Yanlış cezası ({b.wrong} × 25)</span>
            <b className="eks">−{b.penalty}</b>
          </div>
          <div className="fis-satir top">
            <span>Toplam</span>
            <span>{b.base + b.bonus - b.penalty}</span>
          </div>
        </div>

        {oyunId && <SoruInceleme gameId={oyunId} />}

        {ben?.rankedUp && (
          <div className="rutbe-atladi" role="status">
            <KademeRozet rankKey={ben.rankKey} boyut={48} label={ben.rankLabelAfter} />
            <div>
              <b>Rütbe atladın!</b>
              <span>
                {ben.rankLabelBefore} → {ben.rankLabelAfter}
              </span>
            </div>
          </div>
        )}

        <div className="px-5" style={{ marginTop: 26 }}>
          <span className="etiket">Kazandığın XP</span>
        </div>
        <div className="fis kart" style={{ marginTop: 10 }}>
          {xp.total === 0 ? (
            <div className="fis-satir" style={{ border: 0 }}>
              <span>XP için en az 2 oyunculu bir yarışta en az 1 soru cevaplamalısın.</span>
            </div>
          ) : (
            <>
              <div className="fis-satir">
                <span>Katılım</span>
                <b className="art">+{xp.participation}</b>
              </div>
              <div className="fis-satir">
                <span>Puan (puan ÷ 10)</span>
                <b className="art">+{xp.points}</b>
              </div>
              {xp.placement > 0 && (
                <div className="fis-satir">
                  <span>Sıralama ({ben?.rank}.)</span>
                  <b className="art">+{xp.placement}</b>
                </div>
              )}
              {xp.firstFinisher > 0 && (
                <div className="fis-satir">
                  <span>İlk bitiren</span>
                  <b className="art">+{xp.firstFinisher}</b>
                </div>
              )}
              <div className="fis-satir top">
                <span>Toplam</span>
                <span>+{xp.total} XP</span>
              </div>
            </>
          )}
          {stat && (
            <div style={{ padding: '4px 0 8px' }}>
              <div className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <KademeRozet rankKey={stat.rankKey} label={stat.rankLabel} />
                  {stat.rankLabel} · {stat.xp} XP
                </span>
                <span className="text-[color:var(--soluk)]">{stat.nextRankLabel ? `${stat.nextRankLabel} için ${stat.xpToNext}` : 'En üst rütbe'}</span>
              </div>
              <div className="xp-cubuk">
                <i style={{ width: `${bar}%` }} />
              </div>
            </div>
          )}
        </div>
        </div>

        <div className="px-5 sn-siralama-etiket" style={{ marginTop: 26 }}>
          <span className="etiket">Sıralama</span>
        </div>
        <div className="sira-liste">
          {ranking.map((r, i) => (
            <div key={r.userId} className={`sira-satir${r.rank === 1 ? ' bir' : ''}${r.userId === userId ? ' ben' : ''}`} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
              <span className="no">{r.rank}</span>
              <Avatar avatarKey={r.avatarKey} photoUrl={r.photoUrl} ad={r.displayName} boyut={40} ben={r.userId === userId} />
              <div className="min-w-0">
                <div className="ad truncate">
                  {r.displayName}
                  {r.userId === userId ? ' (sen)' : ''}
                </div>
                <div className="alt2 flex items-center gap-1">
                  <KademeRozet rankKey={r.rankKey} label={r.rankLabel} boyut={14} />
                  {r.rankLabel} · {r.correctCount}D {r.wrongCount}Y
                </div>
              </div>
              <div className="p">
                {r.score}
                {r.xpGained > 0 && <small>+{r.xpGained} XP</small>}
              </div>
            </div>
          ))}
        </div>

        {hata && <div className="hata-kutu" role="alert">{hata}</div>}
        <div className="alt-bosluk" style={{ height: 170 }} />
      </div>

      <div className="alt-cta">
        <div className="flex flex-col gap-3">
          <Button onClick={tekrarOyna} disabled={kuruluyor}>
            {kuruluyor ? 'Lobi kuruluyor…' : 'Tekrar oyna'}
          </Button>
          <Button tur="uc" onClick={() => git('/menu')}>
            Ana menüye dön
          </Button>
        </div>
      </div>
    </main>
  )
}
