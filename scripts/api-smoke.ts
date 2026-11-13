import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createApi, type Istemci } from '../src/lib/api.ts'
import type { GameSnapshot, GlobalRow, QuizoraApi } from '../src/types.ts'

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

let basarisiz = 0
function rapor(ad: string, gecti: boolean, ayrinti = '') {
  if (!gecti) basarisiz++
  console.log(`${gecti ? 'geçti' : 'KALDI'} — ${ad}${ayrinti ? ` (${ayrinti})` : ''}`)
}

const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
const istemciler: Istemci[] = []
const kullanicilar: string[] = []
const oyunlar: string[] = []
const abonelikler: Array<() => void> = []

// Her kullanıcı için bağımsız bir istemci (kendi oturumu) ve ona bağlı QuizoraApi
function apiOlustur(): QuizoraApi {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  istemciler.push(client)
  return createApi(client)
}

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Koşul sağlanana kadar bekler (en geç zamanAsimiMs)
async function bekleKosul(kosul: () => boolean, zamanAsimiMs = 5000): Promise<boolean> {
  const bitis = Date.now() + zamanAsimiMs
  while (Date.now() < bitis) {
    if (kosul()) return true
    await bekle(50)
  }
  return kosul()
}

async function hataMesaji(is: () => Promise<unknown>): Promise<string | null> {
  try {
    await is()
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

async function temizle() {
  for (const durdur of abonelikler) durdur()
  if (oyunlar.length > 0) await admin.from('games').delete().in('id', oyunlar)
  for (const id of kullanicilar) await admin.auth.admin.deleteUser(id)
  for (const c of istemciler) await c.removeAllChannels()
}

async function main() {
  const A = apiOlustur()
  const B = apiOlustur()

  // Oturum: her istemci kendi anonim kullanıcısı; ikinci çağrı aynı kullanıcıyı döndürür
  const idA = await A.ensureSession()
  const idB = await B.ensureSession()
  kullanicilar.push(idA, idB)
  rapor('iki bağımsız oturum açıldı', !!idA && !!idB && idA !== idB)
  rapor('ensureSession tekrar çağrılınca aynı kullanıcı', (await A.ensureSession()) === idA)

  // Profil: doğrulama ve kayıt
  const kisa = await hataMesaji(() => A.saveProfile({ displayName: 'a', avatarKey: null }))
  rapor("saveProfile kısa isim → 'İsim 2-20 karakter olmalı'", kisa === 'İsim 2-20 karakter olmalı', kisa ?? 'hata yok')
  const buyuk = await hataMesaji(() =>
    A.saveProfile({ displayName: 'Api A', avatarKey: null, photoFile: new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.png') }),
  )
  rapor("saveProfile büyük fotoğraf → 'Fotoğraf çok büyük'", buyuk === 'Fotoğraf çok büyük', buyuk ?? 'hata yok')

  const profA = await A.saveProfile({ displayName: 'Api A', avatarKey: 'avatar-1' })
  const profB = await B.saveProfile({ displayName: 'Api B', avatarKey: 'avatar-2' })
  rapor('saveProfile A ve B', profA.id === idA && profA.displayName === 'Api A' && profB.id === idB, JSON.stringify(profA))
  const okunan = await A.getProfile()
  rapor('getProfile kaydedileni döndürür', okunan?.displayName === 'Api A' && okunan.avatarKey === 'avatar-1', JSON.stringify(okunan))

  // Sunucu saati farkı
  const ofset = await A.getServerOffsetMs()
  rapor('getServerOffsetMs makul bir sayı', Number.isFinite(ofset) && Math.abs(ofset) < 60_000, `${ofset} ms`)

  // Yeni kullanıcı istatistikleri
  const st = await A.getMyStats()
  rapor(
    "getMyStats yeni kullanıcı: xp 0, 'Çaylak', sonraki 'Bronz I'",
    st.xp === 0 && st.rankLabel === 'Çaylak' && st.rankKey === 'caylak' && st.nextRankLabel === 'Bronz I' &&
      st.xpToNext === 100 && st.progressPct === 0 && st.wins === 0 && st.gamesPlayed === 0,
    JSON.stringify(st),
  )

  // Oyun: A kurar (LGS), B katılır
  const { gameId, code } = await A.createGame('lgs_sozel')
  oyunlar.push(gameId)
  rapor('A createGame(lgs_sozel)', /^QZ-[A-HJ-NP-Z2-9]{4}$/.test(code), code)
  const kotuKod = await hataMesaji(() => B.joinGame('QZ-0000'))
  rapor("geçersiz kodla joinGame → 'Kod bulunamadı'", kotuKod === 'Kod bulunamadı', kotuKod ?? 'hata yok')
  const katil = await B.joinGame(code)
  rapor('B joinGame', katil.gameId === gameId)

  // B subscribeGame: 2 oyuncu, sinav lgs, oyuncularda rankLabel (en geç 5 sn)
  const izle: { son: GameSnapshot | null; gelen: number } = { son: null, gelen: 0 }
  abonelikler.push(
    B.subscribeGame(gameId, (s) => {
      izle.son = s
      izle.gelen++
    }),
  )
  const goruldu = await bekleKosul(
    () => izle.son?.players.length === 2,
    5000,
  )
  const s1 = izle.son
  rapor(
    'subscribeGame: B 2 oyuncu görüyor (≤5 sn)',
    goruldu && s1 !== null && s1.players.length === 2,
    s1 ? `${s1.players.length} oyuncu` : 'snapshot gelmedi',
  )
  rapor("snapshot game.sinav 'lgs', kategori 'lgs_sozel', status 'lobby'", s1?.game.sinav === 'lgs' && s1.game.kategori === 'lgs_sozel' && s1.game.status === 'lobby', JSON.stringify(s1?.game))
  rapor(
    "oyuncularda rankLabel 'Çaylak' (camelCase eşleme)",
    !!s1 && s1.players.every((p) => p.rankLabel === 'Çaylak' && p.rankKey === 'caylak' && typeof p.displayName === 'string'),
    JSON.stringify(s1?.players.map((p) => [p.displayName, p.rankLabel])),
  )

  // getGameByCode aynı oyunu verir
  const byCode = await A.getGameByCode(code)
  rapor('getGameByCode', byCode.game.id === gameId && byCode.game.hostId === idA && byCode.players.length === 2)

  // A başlatır: B'nin aboneliği 'playing' durumunu almalı (realtime veya 3 sn'lik güvenlik ağı)
  const oncekiGelen = izle.gelen
  await A.startGame(gameId)
  const basladi = await bekleKosul(() => izle.son?.game.status === 'playing', 5000)
  rapor('A startGame; B aboneliği playing durumunu aldı (≤5 sn)', basladi && izle.gelen > oncekiGelen, `${izle.gelen - oncekiGelen} yeni snapshot`)
  rapor('startedAt dolu', !!izle.son?.game.startedAt)

  // Soru: geri sayımdan sonra B 0. soruyu alır, doğru şık yok, camelCase
  await bekle(3500)
  const soru = await B.getQuestion(gameId, 0)
  rapor(
    "getQuestion: ders '(LGS)', 4 şık (A-D, E yok), doğru şık yok",
    soru.position === 0 && soru.ders.includes('(LGS)') && Object.keys(soru.options).sort().join('') === 'ABCD' &&
      !('dogru_sik' in soru) && !('correctOption' in soru) && soru.imageUrl === null,
    soru.ders,
  )
  const cevap = await B.submitAnswer(gameId, 0, null)
  rapor('submitAnswer (boş) camelCase sonuç', cevap.points === 0 && cevap.correct === false && cevap.newScore === 0 && cevap.finished === false && cevap.speedupTriggered === false && /^[A-E]$/.test(cevap.correctOption), JSON.stringify(cevap))
  const tekrar = await hataMesaji(() => B.submitAnswer(gameId, 0, 'A'))
  rapor('aynı soruya ikinci cevap hatası olduğu gibi iletildi', tekrar === 'Bu soru zaten cevaplandı', tekrar ?? 'hata yok')

  // Genel liderlik
  const lb: GlobalRow[] = await A.getGlobalLeaderboard()
  rapor('getGlobalLeaderboard dizi döndürür', Array.isArray(lb) && lb.every((r) => typeof r.rankLabel === 'string' && typeof r.xp === 'number' && typeof r.gamesPlayed === 'number'), `${lb.length} satır`)
  const lbIzle: { rows: GlobalRow[] | null } = { rows: null }
  abonelikler.push(A.subscribeGlobalLeaderboard((rows) => { lbIzle.rows = rows }))
  const lbGeldi = await bekleKosul(() => lbIzle.rows !== null, 5000)
  rapor('subscribeGlobalLeaderboard ilk veriyi verdi (≤5 sn)', lbGeldi && Array.isArray(lbIzle.rows))

  // Oturumsuz istemci: anlaşılır hata
  const oturumsuz = createApi(createClient(url!, anonKey!, { auth: { persistSession: false } }))
  istemciler.push(createClient(url!, anonKey!, { auth: { persistSession: false } }))
  const oturumHata = await hataMesaji(() => oturumsuz.getProfile())
  rapor("oturumsuz getProfile → 'Oturum yok'", oturumHata === 'Oturum yok', oturumHata ?? 'hata yok')
  const oturumHata2 = await hataMesaji(() => oturumsuz.createGame('tyt'))
  rapor("oturumsuz createGame → 'Oturum yok'", oturumHata2 === 'Oturum yok', oturumHata2 ?? 'hata yok')
}

main()
  .catch((e) => rapor('beklenmeyen hata', false, e instanceof Error ? e.message : String(e)))
  .finally(async () => {
    await temizle()
    if (basarisiz > 0) {
      console.error(`\nHATA: ${basarisiz} adım kaldı`)
      process.exit(1)
    }
    console.log('\nOK — tüm adımlar geçti')
    process.exit(0)
  })
