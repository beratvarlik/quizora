// Quizora uçtan uca simülasyon: N sanal oyuncu createApi ile gerçek bir yarışı baştan sona oynar.
// Kullanım:
//   npx tsx scripts/e2e-sim.ts                      (2 oyuncu, sayisal + lgs_sozel + lgs_sayisal)
//   npx tsx scripts/e2e-sim.ts --oyuncu 5           (5 oyuncu; 2-5 arası)
//   npx tsx scripts/e2e-sim.ts --kategori tyt       (yalnızca o kategori)
//   npx tsx scripts/e2e-sim.ts --hizli              (oyuncular quickJoin ile girer; host olmadan startIfReady ile başlar)
// Test soruları için önce: npx tsx scripts/seed-test-questions.ts
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createApi, type Istemci } from '../src/lib/api.ts'
import { remainingMs, scorePoints } from '../src/lib/scoring.ts'
import type { AnswerResult, GameResult, GameSnapshot, Kategori, QuizoraApi, RankedPlayer, Secenek } from '../src/types.ts'

config({ path: '.env.local' })

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const missing = [
  ['VITE_SUPABASE_URL', url],
  ['VITE_SUPABASE_ANON_KEY', anonKey],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  console.error(`HATA: .env.local içinde eksik değişken: ${missing.join(', ')}`)
  process.exit(1)
}

// =====================================================================
// Argümanlar
// =====================================================================
const KATEGORILER: Kategori[] = ['sayisal', 'esit_agirlik', 'sozel', 'tyt', 'lgs_sozel', 'lgs_sayisal']
const SIKLAR: Secenek[] = ['A', 'B', 'C', 'D', 'E']

function argumanOku(ad: string): string | undefined {
  const i = process.argv.indexOf(ad)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const oyuncuSayisi = Number(argumanOku('--oyuncu') ?? '2')
const kategoriArg = argumanOku('--kategori')
const hizli = process.argv.includes('--hizli')
if (!Number.isInteger(oyuncuSayisi) || oyuncuSayisi < 2 || oyuncuSayisi > 5) {
  console.error('HATA: --oyuncu 2 ile 5 arasında bir sayı olmalı')
  process.exit(1)
}
if (kategoriArg !== undefined && !KATEGORILER.includes(kategoriArg as Kategori)) {
  console.error(`HATA: --kategori şunlardan biri olmalı: ${KATEGORILER.join(', ')}`)
  process.exit(1)
}

// =====================================================================
// Rapor
// =====================================================================
interface Kayit {
  ad: string
  gecti: boolean
  ms: number
  ayrinti: string
}
const kayitlar: Kayit[] = []

function kontrol(kosul: boolean, mesaj: string): void {
  if (!kosul) throw new Error(mesaj)
}

async function adim(ad: string, is: () => Promise<string | void>): Promise<boolean> {
  const t0 = Date.now()
  let gecti = true
  let ayrinti = ''
  try {
    ayrinti = (await is()) ?? ''
  } catch (e) {
    gecti = false
    ayrinti = e instanceof Error ? e.message : String(e)
  }
  const ms = Date.now() - t0
  kayitlar.push({ ad, gecti, ms, ayrinti })
  console.log(`${gecti ? 'geçti' : 'KALDI'} — ${ad} (${ms} ms)${ayrinti ? ` — ${ayrinti}` : ''}`)
  return gecti
}

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms))
const rastgele = (min: number, max: number) => min + Math.random() * (max - min)

// =====================================================================
// Ortak durum ve yardımcılar
// =====================================================================
const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
const istemciler: Istemci[] = []
const kullanicilar: string[] = []
const oyunlar: string[] = []
let rankTablosu: Array<{ min_xp: number; rank_label: string }> = []

interface Oyuncu {
  ad: string
  api: QuizoraApi
  id: string
}

async function oyuncuOlustur(ad: string): Promise<Oyuncu> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  istemciler.push(client)
  const api = createApi(client)
  const id = await api.ensureSession()
  kullanicilar.push(id)
  await api.saveProfile({ displayName: ad, avatarKey: 'avatar-1' })
  return { ad, api, id }
}

async function statAyarla(id: string, xp: number): Promise<void> {
  const { error } = await admin.from('player_stats').upsert({ user_id: id, xp, wins: 0, games_played: 0 })
  if (error) throw new Error(`player_stats ayarı: ${error.message}`)
}

interface StatSatiri {
  user_id: string
  xp: number
  wins: number
  games_played: number
}
async function statOku(idler: string[]): Promise<Record<string, StatSatiri>> {
  const { data, error } = await admin.from('player_stats').select('user_id, xp, wins, games_played').in('user_id', idler)
  if (error) throw new Error(`player_stats okuma: ${error.message}`)
  const harita: Record<string, StatSatiri> = {}
  for (const r of (data ?? []) as StatSatiri[]) harita[r.user_id] = r
  return harita
}

// Doğru şıklar (service role): game_questions + ilgili soru tablosu; dizi indeksi = pozisyon
async function dogruSiklariOku(gameId: string): Promise<Secenek[]> {
  const { data, error } = await admin
    .from('game_questions')
    .select('position, source_table, question_id')
    .eq('game_id', gameId)
    .order('position')
  if (error || !data) throw new Error(`game_questions: ${error?.message}`)
  return Promise.all(
    data.map(async (g) => {
      const { data: q, error: qErr } = await admin.from(g.source_table).select('dogru_sik').eq('id', g.question_id).single()
      if (qErr || !q) throw new Error(`${g.source_table}: ${qErr?.message}`)
      return String(q.dogru_sik) as Secenek
    }),
  )
}

const rankEtiketi = (xp: number): string | undefined => rankTablosu.find((t) => xp >= t.min_xp)?.rank_label
const yerlesimXp = (rank: number): number => (rank === 1 ? 30 : rank === 2 ? 15 : rank === 3 ? 8 : 0)
const beklenenXp = (puan: number, rank: number, ilkBitiren: boolean): number =>
  20 + Math.max(0, Math.floor(puan / 10)) + yerlesimXp(rank) + (ilkBitiren ? 10 : 0)

// Sunucudaki puan formülünün tam tamsayı karşılığı (yarım yukarı yuvarlama)
const tamPuan = (dogru: boolean | null, sureMs: number): number =>
  dogru === null ? 0 : dogru ? 100 + Math.floor((Math.max(0, 20000 - sureMs) + 100) / 200) : -25

// Süreyi geçmişe çek: yarış süresi dolmuş sayılır (hız modu varsa o da)
async function sureyiBitir(gameId: string): Promise<void> {
  const gecmis = new Date(Date.now() - 300_000).toISOString()
  const { data: g } = await admin.from('games').select('speedup_at').eq('id', gameId).single()
  const { error } = await admin
    .from('games')
    .update(g?.speedup_at ? { started_at: gecmis, speedup_at: gecmis } : { started_at: gecmis })
    .eq('id', gameId)
  if (error) throw new Error(`started_at geçmişe çekilemedi: ${error.message}`)
}

// Oyun kur, katıl, başlat, geri sayımı bekle (hızlı yardımcı; ayrıntılı adımlar ana turda)
async function oyunKur(oyuncular: Oyuncu[], kategori: Kategori): Promise<{ gameId: string; code: string }> {
  const [host, ...digerleri] = oyuncular
  const { gameId, code } = await host.api.createGame(kategori)
  oyunlar.push(gameId)
  for (const o of digerleri) await o.api.joinGame(code)
  await host.api.startGame(gameId)
  await bekle(3300)
  return { gameId, code }
}

// =====================================================================
// Oyun çözümü
// =====================================================================
interface Davranis {
  tur: 'hizli' | 'yavas' | 'rastgele'
  yanlis: number[] // bu pozisyonlar bilerek yanlış cevaplanır (rastgele için yok sayılır)
}

interface CozumKaydi {
  pos: number
  dogru: boolean
  sonuc: AnswerResult
  sunucuSnTahmini: number // get_question ile submit_answer'ın sunucuda işlendiği an arasındaki tahmini süre (sn)
}

interface Cozum {
  kayitlar: CozumKaydi[]
  sizinti: string | null // get_question çıktısında beklenmeyen alan varsa açıklama
  bitirdi: boolean
  hizTetikledi: boolean
}

async function coz(o: Oyuncu, gameId: string, siklar: Secenek[], d: Davranis): Promise<Cozum> {
  const kayitlar: CozumKaydi[] = []
  let sizinti: string | null = null
  let hizTetikledi = false
  for (let pos = 0; pos < 10; pos++) {
    const g0 = Date.now()
    const soru = await o.api.getQuestion(gameId, pos)
    const g1 = Date.now()
    const anahtarlar = Object.keys(soru).sort().join(',')
    // LGS soruları 4 şıklı (A-D), YKS soruları 5 şıklı (A-E)
    const beklenenSiklar = soru.ders.includes('(LGS)') ? 'ABCD' : 'ABCDE'
    if (anahtarlar !== 'ders,imageUrl,options,position,text' || Object.keys(soru.options).sort().join('') !== beklenenSiklar) {
      sizinti = `beklenmeyen alanlar: ${anahtarlar}; şıklar '${Object.keys(soru.options).sort().join('')}' (beklenen '${beklenenSiklar}', ders '${soru.ders}')`
    }
    // Yasaklı alan ADLARI aranır; soru metninin içeriğine bakılmaz (gerçek sorularda "radyoaktif" gibi sözcükler geçer)
    const yasakli = [...Object.keys(soru), ...Object.keys(soru.options)].filter((k) => /dogru|aciklama|aktif|correct/i.test(k))
    if (yasakli.length > 0) sizinti = `doğru şık/açıklama alanı sızdı: ${yasakli.join(', ')}`

    const beklemeMs = d.tur === 'hizli' ? 0 : d.tur === 'yavas' ? rastgele(2000, 3000) : rastgele(300, 1500)
    if (beklemeMs > 0) await bekle(beklemeMs)

    const dogruMu = d.tur === 'rastgele' ? Math.random() < 0.5 : !d.yanlis.includes(pos)
    const secenek = dogruMu ? siklar[pos] : SIKLAR.find((s) => s !== siklar[pos])!
    const s0 = Date.now()
    const sonuc = await o.api.submitAnswer(gameId, pos, secenek)
    const s1 = Date.now()
    if (sonuc.speedupTriggered) hizTetikledi = true
    kayitlar.push({ pos, dogru: dogruMu, sonuc, sunucuSnTahmini: ((s0 + s1) / 2 - (g0 + g1) / 2) / 1000 })
  }
  return { kayitlar, sizinti, bitirdi: kayitlar[kayitlar.length - 1]?.sonuc.finished === true, hizTetikledi }
}

const toplamPuan = (c: Cozum): number => c.kayitlar[c.kayitlar.length - 1]?.sonuc.newScore ?? 0

// =====================================================================
// Hız modu gözlemcisi: ilk bitirenden sonra speedupAt dolunca 1 sn arayla iki ölçüm
// =====================================================================
interface HizOlcumu {
  snap1: GameSnapshot
  r1: number
  r2: number
  aralikMs: number
}

async function hizGozle(host: Oyuncu, code: string, ofsetMs: number): Promise<HizOlcumu> {
  const bitis = Date.now() + 60_000
  while (Date.now() < bitis) {
    const a0 = Date.now()
    const snap1 = await host.api.getGameByCode(code)
    const a1 = Date.now()
    if (snap1.game.speedupAt !== null) {
      const t1 = a1
      const r1 = remainingMs(snap1.game, t1 + ofsetMs)
      await bekle(Math.max(0, 1000 - (a1 - a0))) // gecikmeyi telafi et: ikinci yanıt ≈ t1 + 1 sn gelsin
      const snap2 = await host.api.getGameByCode(code)
      const t2 = Date.now()
      return { snap1, r1, r2: remainingMs(snap2.game, t2 + ofsetMs), aralikMs: t2 - t1 }
    }
    await bekle(200)
  }
  throw new Error('hız modu 60 sn içinde başlamadı')
}

// =====================================================================
// Ana tur: 1-8. adımlar (tam = true ise rank atlama ve zaman aşımı da çalışır)
// =====================================================================
async function tur(n: number, kategori: Kategori, tam: boolean): Promise<void> {
  const e = `[${kategori} ×${n}]`
  const beklenenSinav = kategori.startsWith('lgs_') ? 'lgs' : 'yks'
  let oyuncular: Oyuncu[] = []
  let gameId = ''
  let code = ''

  // 1. Bağımsız istemciler
  if (
    !(await adim(`${e} 1. ${n} bağımsız istemci: ensureSession + saveProfile`, async () => {
      oyuncular = await Promise.all(Array.from({ length: n }, (_, i) => oyuncuOlustur(`E2E ${kategori.slice(0, 5)} ${i + 1}`)))
      kontrol(new Set(oyuncular.map((o) => o.id)).size === n, 'kullanıcı id\'leri benzersiz değil')
      for (const o of oyuncular) await statAyarla(o.id, 0) // temiz başlangıç: xp 0, wins 0, games_played 0
      return `${n} oyuncu`
    }))
  ) return

  // 2. Lobi
  if (
    !(await adim(`${e} 2. createGame, joinGame, getGameByCode (${n} oyuncu, sinav '${beklenenSinav}')`, async () => {
      if (hizli) {
        // Önceki denemelerden kalan herkese açık lobiler eşleşmeyi bozmasın: bayatlat
        await admin.from('games').update({ last_activity_at: new Date(Date.now() - 600_000).toISOString() })
          .eq('status', 'lobby').eq('is_public', true).eq('kategori', kategori)
        const ilk = await oyuncular[0].api.quickJoin(kategori)
        kontrol(ilk.created === true, 'ilk quickJoin yeni lobi açmadı')
        gameId = ilk.gameId
        code = ilk.code
        oyunlar.push(gameId)
        for (const o of oyuncular.slice(1)) {
          const r = await o.api.quickJoin(kategori)
          kontrol(r.gameId === gameId && r.created === false, `quickJoin farklı lobi verdi (${r.gameId}, created=${r.created})`)
        }
      } else {
        const olusan = await oyuncular[0].api.createGame(kategori)
        gameId = olusan.gameId
        code = olusan.code
        oyunlar.push(gameId)
        for (const o of oyuncular.slice(1)) await o.api.joinGame(code)
      }
      const snap = await oyuncular[0].api.getGameByCode(code)
      kontrol(snap.players.length === n, `${snap.players.length} oyuncu görünüyor (beklenen ${n})`)
      kontrol(snap.game.sinav === beklenenSinav, `sinav '${snap.game.sinav}' (beklenen '${beklenenSinav}')`)
      kontrol(snap.game.kategori === kategori && snap.game.status === 'lobby', 'kategori/durum yanlış')
      kontrol(snap.game.hostId === oyuncular[0].id, 'host ilk oyuncu değil')
      if (hizli) {
        kontrol(snap.game.isPublic === true && snap.game.autoStartAt !== null, `isPublic/autoStartAt: ${snap.game.isPublic}/${snap.game.autoStartAt}`)
      }
      return code
    }))
  ) return

  if (n === 5) {
    await adim(`${e} 2b. 6. kişi katılırsa 'Lobi dolu'`, async () => {
      const altinci = await oyuncuOlustur('E2E altinci')
      let mesaj = ''
      try {
        await altinci.api.joinGame(code)
      } catch (err) {
        mesaj = err instanceof Error ? err.message : String(err)
      }
      kontrol(mesaj === 'Lobi dolu', `hata: '${mesaj}'`)
    })
  }

  // 3. Başlatma
  const ofsetMs = await oyuncular[0].api.getServerOffsetMs()
  if (hizli) {
    if (
      !(await adim(`${e} 3. host olmadan: autoStartAt dolunca startIfReady herkesten aynı anda; startedAt ≈ şimdi+3 sn, tek başlama`, async () => {
        const snap0 = await oyuncular[0].api.getGameByCode(code)
        const hedefMs = new Date(snap0.game.autoStartAt!).getTime()
        if (n < 5) {
          // Süre dolmadan startIfReady hiçbir şey yapmaz (hata da vermez)
          await oyuncular[1].api.startIfReady(gameId)
          const erken = await oyuncular[0].api.getGameByCode(code)
          kontrol(erken.game.status === 'lobby', `erken startIfReady oyunu başlattı (${erken.game.status})`)
        }
        await bekle(Math.max(0, hedefMs - (Date.now() + ofsetMs)) + 400)
        const t0 = Date.now() + ofsetMs
        await Promise.all(oyuncular.map((o) => o.api.startIfReady(gameId)))
        const snap = await oyuncular[0].api.getGameByCode(code)
        kontrol(snap.game.status === 'playing' && snap.game.startedAt !== null, `oyun playing değil (${snap.game.status})`)
        const fark = new Date(snap.game.startedAt!).getTime() - t0
        kontrol(fark >= 1500 && fark <= 4500, `startedAt şimdi+${fark} ms`)
        await oyuncular[1].api.startIfReady(gameId) // ikinci tur: durumu bozmaz
        const tekrar = await oyuncular[0].api.getGameByCode(code)
        kontrol(tekrar.game.startedAt === snap.game.startedAt, 'ikinci startIfReady startedAt değiştirdi')
        await bekle(3300) // geri sayım
        return `startedAt = şimdi+${fark} ms`
      }))
    ) return
  } else if (
    !(await adim(`${e} 3. host dışı startGame hata verir; host başlatır, startedAt ≈ şimdi+3 sn`, async () => {
      let mesaj = ''
      try {
        await oyuncular[1].api.startGame(gameId)
      } catch (err) {
        mesaj = err instanceof Error ? err.message : String(err)
      }
      kontrol(mesaj === 'Sadece host başlatabilir', `host dışı hata: '${mesaj}'`)
      const t0 = Date.now() + ofsetMs
      await oyuncular[0].api.startGame(gameId)
      const snap = await oyuncular[0].api.getGameByCode(code)
      kontrol(snap.game.status === 'playing' && snap.game.startedAt !== null, 'oyun playing değil')
      const fark = new Date(snap.game.startedAt!).getTime() - t0
      kontrol(fark >= 2000 && fark <= 4000, `startedAt şimdi+${fark} ms`)
      await bekle(3300) // geri sayım
      return `startedAt = şimdi+${fark} ms`
    }))
  ) return

  // 4-5. Eşzamanlı oyun: 1. hızlı ve hep doğru, 2. yavaş ve 3 yanlış, diğerleri rastgele; gözlemci hız modunu ölçer
  const siklar = await dogruSiklariOku(gameId)
  const davranislar: Davranis[] = oyuncular.map((_, i) =>
    i === 0 ? { tur: 'hizli', yanlis: [] } : i === 1 ? { tur: 'yavas', yanlis: [2, 5, 8] } : { tur: 'rastgele', yanlis: [] },
  )
  let cozumler: Cozum[] = []
  let hiz: HizOlcumu | null = null
  const oyunBasarili = await adim(`${e} 4. ${n} oyuncu 10 soruyu eşzamanlı çözdü`, async () => {
    const [sonuclar, olcum] = await Promise.all([
      Promise.all(oyuncular.map((o, i) => coz(o, gameId, siklar, davranislar[i]))),
      hizGozle(oyuncular[0], code, ofsetMs),
    ])
    cozumler = sonuclar
    hiz = olcum
    kontrol(sonuclar.every((c) => c.bitirdi), 'bir oyuncu 10. soruyu bitirmedi')
    return sonuclar.map((c, i) => `${i + 1}. oyuncu ${toplamPuan(c)} puan`).join(', ')
  })
  if (!oyunBasarili) return

  await adim(`${e} 4a. getQuestion çıktısında doğru şık/açıklama yok`, async () => {
    const sizan = cozumler.find((c) => c.sizinti !== null)
    kontrol(!sizan, sizan?.sizinti ?? '')
  })

  await adim(`${e} 4a2. şık sayısı: ${beklenenSinav === 'lgs' ? 'LGS soruları 4 şıklı (A-D)' : 'YKS soruları 5 şıklı (A-E)'}`, async () => {
    const izinli = beklenenSinav === 'lgs' ? 'ABCD' : 'ABCDE'
    kontrol(siklar.length === 10 && siklar.every((s) => izinli.includes(s)), `doğru şıklar: ${siklar.join('')} (izinli ${izinli})`)
    return `doğru şıklar ${siklar.join('')}`
  })

  await adim(`${e} 4b. hızlı oyuncunun puanı ≥ 1800`, async () => {
    const puan = toplamPuan(cozumler[0])
    kontrol(puan >= 1800, `${puan} puan (sunucu süreleri: ${cozumler[0].kayitlar.map((k) => k.sunucuSnTahmini.toFixed(1)).join(' ')})`)
    kontrol(cozumler[0].kayitlar.every((k) => k.sonuc.correct), 'hızlı oyuncu bir soruyu yanlış bildi')
    return `${puan} puan`
  })

  await adim(`${e} 4c. yavaş oyuncunun puanı scoring.ts formülüyle beklenenle ±15`, async () => {
    const c = cozumler[1]
    const beklenen = c.kayitlar.reduce((t, k) => t + (k.dogru ? scorePoints(true, k.sunucuSnTahmini) : scorePoints(false, 0)), 0)
    const gercek = toplamPuan(c)
    kontrol(Math.abs(gercek - beklenen) <= 15, `gerçek ${gercek}, beklenen ${beklenen}`)
    kontrol(c.kayitlar.filter((k) => !k.dogru).length === 3 && c.kayitlar.filter((k) => !k.sonuc.correct).length === 3, 'yanlış sayısı 3 değil')
    return `gerçek ${gercek}, beklenen ${beklenen}`
  })

  await adim(`${e} 4d. tüm cevapların puanı, kayıtlı süreyle sunucu formülüne birebir uyuyor`, async () => {
    const { data, error } = await admin.from('answers').select('user_id, position, dogru, sure_ms, puan').eq('game_id', gameId)
    if (error || !data) throw new Error(`answers: ${error?.message}`)
    kontrol(data.length === n * 10, `${data.length} cevap kaydı (beklenen ${n * 10})`)
    const yanlis = data.filter((r) => r.puan !== tamPuan(r.dogru as boolean | null, Number(r.sure_ms)))
    kontrol(yanlis.length === 0, `uyuşmayan: ${JSON.stringify(yanlis.slice(0, 2))}`)
  })

  // Hız modu: exactly-one tetikleyici, speedupBy o oyuncu, 2x formülü
  const tetikleyenler = oyuncular.filter((_, i) => cozumler[i].hizTetikledi)
  await adim(`${e} 5. ilk bitirenden sonra speedupAt dolu, speedupRemainingMs > 0, speedupBy = ilk bitiren`, async () => {
    kontrol(tetikleyenler.length === 1, `${tetikleyenler.length} oyuncu hız modunu tetikledi (beklenen 1)`)
    const snap = (hiz as HizOlcumu | null)?.snap1
    kontrol(!!snap, 'hız ölçümü alınamadı')
    kontrol(snap!.game.speedupAt !== null, 'speedupAt boş')
    kontrol((snap!.game.speedupRemainingMs ?? 0) > 0, `speedupRemainingMs ${snap!.game.speedupRemainingMs}`)
    kontrol(snap!.game.speedupBy === tetikleyenler[0].id, `speedupBy ${snap!.game.speedupBy} ≠ ilk bitiren ${tetikleyenler[0].id}`)
    return `ilk bitiren: ${tetikleyenler[0].ad}`
  })
  await adim(`${e} 5b. remainingMs 2× hız: 1 sn arayla iki değer arasındaki fark ≈ 2 sn (±0,3)`, async () => {
    const h = hiz as HizOlcumu | null
    kontrol(!!h, 'hız ölçümü alınamadı')
    const fark = h!.r1 - h!.r2
    kontrol(h!.r1 > 0 && h!.r2 > 0, `kalan süre ${h!.r1} / ${h!.r2}`)
    // 2× kuralı: kalan süre, gerçek süre geçtikçe 2 kat hızlı azalır → fark ≈ 2 × ölçüm aralığı.
    // (Ağ gecikmesi ölçüm aralığını 1 sn'den biraz saptırabilir; bu yüzden mutlak 2000 ms değil oran sınanır.)
    kontrol(h!.aralikMs >= 700 && h!.aralikMs <= 1600, `ölçüm aralığı 1 sn'den çok saptı: ${h!.aralikMs} ms`)
    kontrol(Math.abs(fark - 2 * h!.aralikMs) <= 300, `fark ${Math.round(fark)} ms, beklenen 2 × ${h!.aralikMs} = ${2 * h!.aralikMs} ms (±300)`)
    return `fark ${Math.round(fark)} ms (aralık ${h!.aralikMs} ms, oran ${(fark / h!.aralikMs).toFixed(2)})`
  })

  // 6. Yarışı bitir: önce biri, sonra aynı anda birden çok istemci
  let ilkSonuc: GameResult | null = null
  let esZamanli: GameResult[] = []
  if (
    !(await adim(`${e} 6. finishGame; ardından aynı anda ${Math.max(n, 3)} çağrı: aynı winnerId, sıralama ve XP`, async () => {
      ilkSonuc = await oyuncular[0].api.finishGame(gameId)
      const cagrilar = oyuncular.map((o) => o.api.finishGame(gameId))
      if (n < 3) cagrilar.push(oyuncular[0].api.finishGame(gameId)) // en az 3 eşzamanlı çağrı
      esZamanli = await Promise.all(cagrilar)
      const referans = JSON.stringify(ilkSonuc.ranking)
      for (const s of esZamanli) {
        kontrol(s.winnerId === ilkSonuc.winnerId, `winnerId ${s.winnerId} ≠ ${ilkSonuc.winnerId}`)
        kontrol(JSON.stringify(s.ranking) === referans, 'sıralama/XP değerleri farklı döndü')
      }
      kontrol(ilkSonuc.ranking.length === n, `${ilkSonuc.ranking.length} satır (beklenen ${n})`)
      kontrol(ilkSonuc.winnerId === oyuncular[0].id, 'kazanan hızlı ve hep doğru bilen oyuncu değil')
      return `kazanan ${oyuncular[0].ad}`
    }))
  ) return
  const sonuc = ilkSonuc as GameResult | null
  if (!sonuc) return
  const satir = (id: string): RankedPlayer => {
    const s = sonuc.ranking.find((r) => r.userId === id)
    if (!s) throw new Error(`sıralamada oyuncu yok: ${id}`)
    return s
  }

  await adim(`${e} 6a. getGameReview: finishGame ile tutarlı (puan toplamı, doğru/yanlış/boş sayıları)`, async () => {
    for (const [i, o] of oyuncular.entries()) {
      const inc = await o.api.getGameReview(gameId)
      kontrol(inc.items.length === 10 && inc.items.every((x, k) => x.position === k), `${o.ad}: ${inc.items.length} öğe / sıra bozuk`)
      const bd = esZamanli[i].breakdown
      const say = (t: string) => inc.items.filter((x) => x.outcome === t).length
      kontrol(say('correct') === bd.correct && say('wrong') === bd.wrong && say('blank') === bd.blank,
        `${o.ad}: ${say('correct')}/${say('wrong')}/${say('blank')} ≠ ${bd.correct}/${bd.wrong}/${bd.blank}`)
      const top = inc.items.reduce((t, x) => t + x.points, 0)
      kontrol(top === satir(o.id).score, `${o.ad}: puan toplamı ${top} ≠ skor ${satir(o.id).score}`)
      const izinli = beklenenSinav === 'lgs' ? 'ABCD' : 'ABCDE'
      kontrol(inc.items.every((x) => Object.keys(x.options).sort().join('') === izinli && x.correctOption in x.options),
        `${o.ad}: options anahtarları ${Object.keys(inc.items[0]?.options ?? {}).join('')} (beklenen ${izinli})`)
    }
  })

  // Yanlışlarım defteri: yanlış + boş sorular deftere girmiş olmalı; api üzerinden çöz / çıkar
  await adim(`${e} 6a2. Yanlışlarım defteri: addedToNotebook = yanlış + boş; özet/liste tutarlı; practiceAnswer ve removeMistake`, async () => {
    for (const o of oyuncular) {
      const inc = await o.api.getGameReview(gameId)
      const yanlisBos = inc.items.filter((x) => x.outcome !== 'correct')
      kontrol(inc.addedToNotebook === yanlisBos.length, `${o.ad}: addedToNotebook ${inc.addedToNotebook} ≠ ${yanlisBos.length}`)
      const ozet = await o.api.getMistakeSummary()
      const liste = await o.api.getMistakes({ limit: 50 })
      kontrol(ozet.total === yanlisBos.length && ozet.resolvedTotal === 0, `${o.ad}: özet ${ozet.total}/${ozet.resolvedTotal} ≠ ${yanlisBos.length}/0`)
      kontrol(liste.length === yanlisBos.length, `${o.ad}: liste ${liste.length} ≠ ${yanlisBos.length}`)
      kontrol(ozet.bySubject.reduce((t, x) => t + x.count, 0) === ozet.total && ozet.bySubject.every((x) => x.exam === beklenenSinav),
        `${o.ad}: bySubject toplamı/sınav tutarsız`)
      const izinli = beklenenSinav === 'lgs' ? 'ABCD' : 'ABCDE'
      kontrol(liste.every((x) => Object.keys(x.options).sort().join('') === izinli && !('correctOption' in x) && !('explanation' in x)),
        `${o.ad}: liste şıkları/alanları beklenmedik`)
      if (liste.length >= 2) {
        // Soruyu incelemeden eşleştir: metin → doğru şık
        const dogru = (metin: string) => inc.items.find((x) => x.text === metin)!.correctOption
        const ilk = liste[0]
        const pd = await o.api.practiceAnswer(ilk.questionId, dogru(ilk.text))
        kontrol(pd.isCorrect && pd.resolved, `${o.ad}: doğru şıkla çözülmedi`)
        const ikinci = liste[1]
        await o.api.removeMistake(ikinci.questionId)
        const son = await o.api.getMistakeSummary()
        kontrol(son.total === yanlisBos.length - 2 && son.resolvedTotal === 2, `${o.ad}: çözüm/çıkarma sonrası ${son.total}/${son.resolvedTotal}`)
      }
    }
  })

  // Akıllı analiz: getPerformance, yarış incelemesiyle tutarlı olmalı; incelemede topic alanı var
  await adim(`${e} 6a3. getPerformance: totals incelemeyle tutarlı, byTopic/bySubject toplamları, daily bugün, streak 1; review'da topic alanı`, async () => {
    for (const o of oyuncular) {
      const inc = await o.api.getGameReview(gameId)
      kontrol(inc.items.every((x) => 'topic' in x && (x.topic === null || typeof x.topic === 'string')), `${o.ad}: review topic alanı yok`)
      const say = (t: string) => inc.items.filter((x) => x.outcome === t).length
      const pf = await o.api.getPerformance({ days: 30 })
      kontrol(pf.totals.games === 1, `${o.ad}: games ${pf.totals.games}`)
      kontrol(pf.totals.correct === say('correct') && pf.totals.wrong === say('wrong') && pf.totals.blank === say('blank') && pf.totals.answered === say('correct') + say('wrong'),
        `${o.ad}: totals ${JSON.stringify(pf.totals)} ≠ ${say('correct')}/${say('wrong')}/${say('blank')}`)
      const acc = pf.totals.answered > 0 ? Math.round((1000 * pf.totals.correct) / pf.totals.answered) / 10 : 0
      kontrol(pf.totals.accuracy === acc, `${o.ad}: accuracy ${pf.totals.accuracy} ≠ ${acc}`)
      kontrol(pf.bySubject.reduce((t, x) => t + x.answered, 0) === pf.totals.answered && pf.byTopic.reduce((t, x) => t + x.answered, 0) === pf.totals.answered,
        `${o.ad}: bySubject/byTopic toplamı answered ile aynı değil`)
      kontrol(pf.byTopic.every((x) => x.exam === beklenenSinav && x.lowSample === x.answered < 3), `${o.ad}: byTopic exam/lowSample hatalı`)
      kontrol(pf.daily.length === 7 && pf.daily[6].answered === pf.totals.answered && pf.daily[6].correct === pf.totals.correct, `${o.ad}: daily bugün ${JSON.stringify(pf.daily[6])}`)
      kontrol(pf.streakDays === 1, `${o.ad}: streakDays ${pf.streakDays}`)
      const lg = await o.api.getPerformance({ exam: beklenenSinav === 'lgs' ? 'yks' : 'lgs' })
      kontrol(lg.totals.games === 0 && lg.byTopic.length === 0, `${o.ad}: karşı sınav filtresi boş olmalı`)
    }
  })

  await adim(`${e} 6b. XP yalnızca BİR kez arttı (player_stats ve getMyStats), wins/gamesPlayed doğru`, async () => {
    const stat = await statOku(oyuncular.map((o) => o.id))
    for (const o of oyuncular) {
      const s = satir(o.id)
      const st = stat[o.id]
      kontrol(st?.xp === s.xpGained, `${o.ad}: player_stats xp ${st?.xp} ≠ xpGained ${s.xpGained}`)
      kontrol(st.games_played === 1, `${o.ad}: games_played ${st.games_played}`)
      kontrol(st.wins === (o.id === sonuc.winnerId ? 1 : 0), `${o.ad}: wins ${st.wins}`)
      const ms = await o.api.getMyStats()
      kontrol(ms.xp === s.xpGained && ms.gamesPlayed === 1, `${o.ad}: getMyStats xp ${ms.xp}, gamesPlayed ${ms.gamesPlayed}`)
      kontrol(ms.wins === (o.id === sonuc.winnerId ? 1 : 0), `${o.ad}: getMyStats wins ${ms.wins}`)
    }
  })

  // 7. XP doğrulaması
  await adim(`${e} 7. XP: xpGained formülle birebir, xpBreakdown.total, xpAfter = xpBefore + xpGained, rank etiketleri`, async () => {
    const ilkId = tetikleyenler[0].id
    const ozet: string[] = []
    oyuncular.forEach((o, i) => {
      const s = satir(o.id)
      const bk = esZamanli[i].xpBreakdown
      const beklenen = beklenenXp(s.score, s.rank, o.id === ilkId)
      kontrol(s.xpGained === beklenen, `${o.ad}: xpGained ${s.xpGained} ≠ beklenen ${beklenen} (puan ${s.score}, sıra ${s.rank})`)
      kontrol(bk.total === s.xpGained, `${o.ad}: xpBreakdown.total ${bk.total} ≠ ${s.xpGained}`)
      kontrol(
        bk.participation === 20 && bk.points === Math.max(0, Math.floor(s.score / 10)) && bk.placement === yerlesimXp(s.rank) &&
          bk.firstFinisher === (o.id === ilkId ? 10 : 0),
        `${o.ad}: xpBreakdown parçaları ${JSON.stringify(bk)}`,
      )
      kontrol(s.xpAfter === s.xpBefore + s.xpGained, `${o.ad}: xpAfter ${s.xpAfter} ≠ ${s.xpBefore} + ${s.xpGained}`)
      kontrol(s.rankLabelAfter === rankEtiketi(s.xpAfter) && s.rankLabel === s.rankLabelAfter, `${o.ad}: rankLabelAfter '${s.rankLabelAfter}' (beklenen '${rankEtiketi(s.xpAfter)}')`)
      kontrol(s.rankLabelBefore === rankEtiketi(s.xpBefore), `${o.ad}: rankLabelBefore '${s.rankLabelBefore}'`)
      kontrol(s.rankedUp === (s.rankLabelBefore !== s.rankLabelAfter), `${o.ad}: rankedUp ${s.rankedUp}`)
      ozet.push(`${i + 1}.→+${s.xpGained}`)
    })
    kontrol(sonuc.ranking.every((r, i, a) => i === 0 || a[i - 1].score >= r.score), 'sıralama puana göre azalan değil')
    return ozet.join(' ')
  })

  // 8. Liderlik ve puan dökümü
  await adim(`${e} 8. getGlobalLeaderboard XP sıralı; breakdown: base + bonus − penalty = score`, async () => {
    const lb = await oyuncular[0].api.getGlobalLeaderboard()
    kontrol(lb.length > 0 && lb.length <= 20, `${lb.length} satır`)
    kontrol(lb.every((r, i) => i === 0 || lb[i - 1].xp > r.xp || (lb[i - 1].xp === r.xp && lb[i - 1].wins >= r.wins)), 'XP sıralı değil')
    kontrol(lb.every((r) => !!r.rankLabel && r.rankLabel === rankEtiketi(r.xp)), 'rank etiketleri tabloyla uyumsuz')
    oyuncular.forEach((o, i) => {
      const b = esZamanli[i].breakdown
      const s = satir(o.id)
      kontrol(b.base + b.bonus - b.penalty === s.score, `${o.ad}: base ${b.base} + bonus ${b.bonus} − ceza ${b.penalty} = ${b.base + b.bonus - b.penalty} ≠ puan ${s.score}`)
      kontrol(b.correct + b.wrong + b.blank === 10, `${o.ad}: doğru+yanlış+boş = ${b.correct + b.wrong + b.blank}`)
    })
    return `${lb.length} satır`
  })

  if (!tam) return

  // 9. Rank atlama: oyuncu 1'in XP'si 95 → yeni yarışı kazanır
  await adim(`${e} 9. rank atlama: XP 95 → yarışı kazanınca rankedUp, rankLabelBefore 'Çaylak'`, async () => {
    const [p0, p1] = oyuncular
    await statAyarla(p0.id, 95)
    await statAyarla(p1.id, 0)
    const { gameId: g2 } = await oyunKur([p0, p1], kategori)
    const s2 = await dogruSiklariOku(g2)
    await Promise.all([
      coz(p0, g2, s2, { tur: 'hizli', yanlis: [] }),
      coz(p1, g2, s2, { tur: 'hizli', yanlis: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }),
    ])
    const r = await p0.api.finishGame(g2)
    const a = r.ranking.find((x) => x.userId === p0.id)!
    const b = r.ranking.find((x) => x.userId === p1.id)!
    kontrol(r.winnerId === p0.id, 'kazanan p0 değil')
    kontrol(a.xpBefore === 95 && a.rankLabelBefore === 'Çaylak', `önce ${a.xpBefore} / '${a.rankLabelBefore}'`)
    kontrol(a.rankedUp === true && a.rankLabelAfter !== 'Çaylak' && a.rankLabelAfter === rankEtiketi(a.xpAfter), `sonra ${a.xpAfter} '${a.rankLabelAfter}' rankedUp ${a.rankedUp}`)
    kontrol(b.rankedUp === false, `2. oyuncu rankedUp ${b.rankedUp}`)
    const ms = await p0.api.getMyStats()
    kontrol(ms.rankLabel === a.rankLabelAfter && ms.xp === a.xpAfter, `getMyStats '${ms.rankLabel}' ${ms.xp}`)
    return `Çaylak → ${a.rankLabelAfter} (${a.xpBefore} → ${a.xpAfter} XP)`
  })

  // 10. Zaman aşımı: started_at geçmişe çekilir, finishGame başarılı, tüm sorular boş
  await adim(`${e} 10. zaman aşımı: started_at geçmişe, eşzamanlı finishGame başarılı, tüm sorular boş`, async () => {
    const [p0, p1] = oyuncular
    const { gameId: g3 } = await (async () => {
      const olusan = await p0.api.createGame(kategori)
      oyunlar.push(olusan.gameId)
      await p1.api.joinGame(olusan.code)
      await p0.api.startGame(olusan.gameId)
      return olusan
    })()
    await sureyiBitir(g3)
    const once = await statOku([p0.id, p1.id])
    const [r0, r1] = await Promise.all([p0.api.finishGame(g3), p1.api.finishGame(g3)])
    kontrol(r0.winnerId === r1.winnerId && JSON.stringify(r0.ranking) === JSON.stringify(r1.ranking), 'eşzamanlı çağrılar farklı sonuç döndürdü')
    kontrol(r0.ranking.length === 2 && r0.ranking.every((x) => x.score === 0 && x.currentQ === 0 && x.finished), 'cevapsız oyuncular sıralamada puan 0 ile yer almalı')
    kontrol(r0.ranking.every((x) => x.xpGained === 0), 'cevap vermeyenler XP almamalı')
    kontrol(r0.breakdown.blank === 10 && r0.breakdown.correct === 0 && r0.breakdown.wrong === 0, `breakdown ${JSON.stringify(r0.breakdown)}`)
    const sonra = await statOku([p0.id, p1.id])
    kontrol(JSON.stringify(once) === JSON.stringify(sonra), 'cevapsız yarış player_stats değiştirdi')
    const { data: o } = await admin.from('games').select('status, xp_applied').eq('id', g3).single()
    kontrol(o?.status === 'finished' && o?.xp_applied === true, `oyun durumu ${JSON.stringify(o)}`)
  })
}

// =====================================================================
// Temizlik (adım 11)
// =====================================================================
async function temizle(): Promise<void> {
  await adim('11. temizlik: oyunlar, player_stats ve profiller silindi', async () => {
    if (oyunlar.length > 0) {
      const { error } = await admin.from('games').delete().in('id', oyunlar)
      if (error) throw new Error(`games: ${error.message}`)
    }
    if (kullanicilar.length > 0) {
      const { error: e1 } = await admin.from('player_stats').delete().in('user_id', kullanicilar)
      if (e1) throw new Error(`player_stats: ${e1.message}`)
      const { error: e2 } = await admin.from('profiles').delete().in('id', kullanicilar)
      if (e2) throw new Error(`profiles: ${e2.message}`)
      for (const id of kullanicilar) await admin.auth.admin.deleteUser(id)
    }
    for (const c of istemciler) await c.removeAllChannels()
    return `${oyunlar.length} oyun, ${kullanicilar.length} kullanıcı`
  })
}

function tabloYazdir(): void {
  const ad = Math.max(4, ...kayitlar.map((k) => k.ad.length))
  console.log(`\n${'ADIM'.padEnd(ad)}  SONUÇ  SÜRE (ms)`)
  console.log(`${'-'.repeat(ad)}  -----  ---------`)
  for (const k of kayitlar) {
    console.log(`${k.ad.padEnd(ad)}  ${(k.gecti ? 'geçti' : 'KALDI').padEnd(5)}  ${String(k.ms).padStart(9)}`)
  }
}

async function main(): Promise<void> {
  const { data: tiers, error } = await admin.from('rank_tiers').select('min_xp, rank_label').order('min_xp', { ascending: false })
  if (error || !tiers || tiers.length === 0) throw new Error(`rank_tiers okunamadı (0003 çalıştırıldı mı?): ${error?.message}`)
  rankTablosu = tiers as Array<{ min_xp: number; rank_label: string }>

  const ana = (kategoriArg as Kategori | undefined) ?? 'sayisal'
  await tur(oyuncuSayisi, ana, true)
  if (kategoriArg === undefined) {
    // Varsayılan çalıştırma: iki LGS kategorisinde 2 oyunculu birer tur daha
    await tur(2, 'lgs_sozel', false)
    await tur(2, 'lgs_sayisal', false)
  }
}

main()
  .catch((e) => {
    kayitlar.push({ ad: 'beklenmeyen hata', gecti: false, ms: 0, ayrinti: e instanceof Error ? e.message : String(e) })
    console.error(`KALDI — beklenmeyen hata — ${e instanceof Error ? e.message : String(e)}`)
  })
  .finally(async () => {
    await temizle()
    tabloYazdir()
    const kalanlar = kayitlar.filter((k) => !k.gecti)
    if (kalanlar.length > 0) {
      console.error(`\n${kalanlar.length} ADIM KALDI:`)
      for (const k of kalanlar) console.error(`  - ${k.ad}: ${k.ayrinti}`)
      console.error("\nBir RPC hatası görüyorsan düzeltmeyi yeni bir migration (0006_fix_*.sql) olarak yaz; eski migration'ları değiştirme.")
      process.exit(1)
    }
    console.log('\nTÜM TESTLER GEÇTİ')
    process.exit(0)
  })
