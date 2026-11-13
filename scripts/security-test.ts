// Quizora güvenlik ve dayanıklılık testi.
// Kullanım: npx tsx scripts/security-test.ts   (önce: npx tsx scripts/seed-test-questions.ts)
// Ham supabase istemcileri (yetki/RLS denemeleri) ve createApi (oyun akışı) birlikte kullanılır.
// Geçici olarak: app_settings.min_players (madde 4) ve fen_lgs.aktif (madde 11) değiştirilir; sonda geri alınır.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createApi, type Istemci } from '../src/lib/api.ts'
import type { QuizoraApi, Secenek } from '../src/types.ts'
import { TUM_TABLOLAR } from './lib-sorular.ts'

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

// =====================================================================
// Ortak durum ve yardımcılar
// =====================================================================
const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
const istemciler: Istemci[] = []
const kullanicilar: string[] = []
const oyunlar: string[] = []
const yuklenenDosyalar: Array<{ kova: string; yol: string }> = []

// Geçici değişiklikler (temizlikte geri alınır)
let minPlayersEski: string | null | undefined
let deaktifEdilenSorular: string[] = []
let baslangicMinPlayers: string | undefined // test başında app_settings.min_players değeri

const SIFIR_UUID = '00000000-0000-0000-0000-000000000000'
const SIKLAR: Secenek[] = ['A', 'B', 'C', 'D', 'E']

interface Oyuncu {
  ad: string
  api: QuizoraApi
  client: Istemci
  id: string
}

// Takılan bir istek (ör. kilitlenme) testi dakikalarca bekletmesin: her HTTP isteğine zaman aşımı
const ISTEK_ZAMAN_ASIMI_MS = 25_000

function yeniIstemci(): Istemci {
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(ISTEK_ZAMAN_ASIMI_MS) }) },
  })
  istemciler.push(c)
  return c
}

async function oyuncuOlustur(ad: string): Promise<Oyuncu> {
  const client = yeniIstemci()
  const api = createApi(client)
  const id = await api.ensureSession()
  kullanicilar.push(id)
  await api.saveProfile({ displayName: ad, avatarKey: 'avatar-1' })
  return { ad, api, client, id }
}

// Yetki hatası: Postgres 42501 / "permission denied" / RLS ihlali
interface HamHata {
  message: string
  code?: string
}
const yetkiHatasi = (e: HamHata | null): boolean =>
  !!e && (e.code === '42501' || /permission denied|row-level security|violates/i.test(e.message))

// Okuma engellendi: hata VEYA boş sonuç
const okumaEngellendi = (r: { data: unknown; error: HamHata | null }): boolean =>
  r.error !== null || (Array.isArray(r.data) && r.data.length === 0)

// Yazma engellendi: hata VEYA etkilenen satır yok
const yazmaEngellendi = okumaEngellendi

async function mesaj(is: () => PromiseLike<unknown>): Promise<string | null> {
  try {
    await is()
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

// Aşamalı çalıştır: hata mesajına aşama adı ve süresi eklenir (hangi adımda takıldığı görünsün)
async function faz<T>(ad: string, is: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    return await is()
  } catch (e) {
    throw new Error(`[${ad}, ${Date.now() - t0} ms] ${e instanceof Error ? e.message : String(e)}`)
  }
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

async function sureyiBitir(gameId: string): Promise<void> {
  const gecmis = new Date(Date.now() - 300_000).toISOString()
  const { data: g } = await admin.from('games').select('speedup_at').eq('id', gameId).single()
  const { error } = await admin
    .from('games')
    .update(g?.speedup_at ? { started_at: gecmis, speedup_at: gecmis } : { started_at: gecmis })
    .eq('id', gameId)
  if (error) throw new Error(`started_at geçmişe çekilemedi: ${error.message}`)
}

// Lobi kur: host kurar, diğerleri katılır (başlatmaz)
async function lobiKur(oyuncular: Oyuncu[], kategori = 'tyt'): Promise<{ gameId: string; code: string }> {
  const [host, ...digerleri] = oyuncular
  const { gameId, code } = await host.api.createGame(kategori as never)
  oyunlar.push(gameId)
  for (const o of digerleri) await o.api.joinGame(code)
  return { gameId, code }
}

async function baslat(host: Oyuncu, gameId: string): Promise<void> {
  await host.api.startGame(gameId)
  await bekle(3300) // 3 sn geri sayım
}

// İlk `adet` soruyu çöz (hepsi doğru ya da hepsi yanlış)
async function oyna(o: Oyuncu, gameId: string, siklar: Secenek[], baslangic: number, bitis: number, dogru = true): Promise<void> {
  for (let pos = baslangic; pos < bitis; pos++) {
    await o.api.getQuestion(gameId, pos)
    const secenek = dogru ? siklar[pos] : SIKLAR.find((s) => s !== siklar[pos])!
    await o.api.submitAnswer(gameId, pos, secenek)
  }
}

// =====================================================================
// Temizlik
// =====================================================================
async function geriYukle(): Promise<void> {
  if (minPlayersEski !== undefined) {
    await admin.from('app_settings').update({ value: minPlayersEski ?? '2' }).eq('key', 'min_players')
    minPlayersEski = undefined
  }
  if (deaktifEdilenSorular.length > 0) {
    for (let i = 0; i < deaktifEdilenSorular.length; i += 100) {
      await admin.from('fen_lgs').update({ aktif: true }).in('id', deaktifEdilenSorular.slice(i, i + 100))
    }
    deaktifEdilenSorular = []
  }
}

async function temizle(): Promise<void> {
  await adim('temizlik: geçici ayarlar geri alındı; oyunlar, istatistikler, profiller ve dosyalar silindi', async () => {
    // Önce her şeyi sil/geri al; doğrulamalar EN SONDA (bir doğrulama hatası temizliği yarıda bırakmasın)
    await geriYukle()
    for (const d of yuklenenDosyalar) await admin.storage.from(d.kova).remove([d.yol])
    let silmeHatasi = ''
    if (oyunlar.length > 0) {
      const { error } = await admin.from('games').delete().in('id', oyunlar)
      if (error) silmeHatasi = `games: ${error.message}`
    }
    if (kullanicilar.length > 0) {
      await admin.from('player_stats').delete().in('user_id', kullanicilar)
      await admin.from('profiles').delete().in('id', kullanicilar)
      for (const id of kullanicilar) await admin.auth.admin.deleteUser(id)
    }
    for (const c of istemciler) await c.removeAllChannels()
    kontrol(silmeHatasi === '', silmeHatasi)
    // min_players TEST ÖNCESİ değerine dönmüş olmalı (geliştirmede 1 olabilir; 2'ye zorlanmaz)
    const { data: ayar } = await admin.from('app_settings').select('value').eq('key', 'min_players').single()
    kontrol(ayar?.value === baslangicMinPlayers, `min_players '${ayar?.value}' (test öncesi '${baslangicMinPlayers}')`)
    return `${oyunlar.length} oyun, ${kullanicilar.length} kullanıcı, ${yuklenenDosyalar.length} dosya; min_players '${ayar?.value}'`
  })
}

process.on('SIGINT', () => {
  void geriYukle().finally(() => process.exit(130))
})

// =====================================================================
// Testler
// =====================================================================
async function testler(): Promise<void> {
  // ---- Hazırlık: 6 oyuncu (A-E oyuncu, F fazladan) ----
  baslangicMinPlayers = (await admin.from('app_settings').select('value').eq('key', 'min_players').single()).data?.value
  let P: Oyuncu[] = []
  if (!(await adim('0. hazırlık: 6 bağımsız oyuncu', async () => {
    P = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map((h) => oyuncuOlustur(`SEC ${h}`)))
    for (const o of P) await statAyarla(o.id, 0)
    return P.map((o) => o.ad).join(', ')
  }))) return
  const [A, B, C, D, E, F] = P

  // ===== 1. Oturumsuz (anon) =====
  const anon = yeniIstemci()
  await adim('1a. anon: 24 soru tablosu (LGS dahil) okunamıyor', async () => {
    const sizan: string[] = []
    for (const t of TUM_TABLOLAR) {
      const r = await anon.from(t).select('id, dogru_sik').limit(1)
      if (!okumaEngellendi(r)) sizan.push(t)
    }
    kontrol(sizan.length === 0, `okunabilen tablolar: ${sizan.join(', ')}`)
    return `${TUM_TABLOLAR.length} tablo`
  })
  await adim('1a2. anon: soru tablolarından cozum_aciklamasi okunamıyor', async () => {
    const sizan: string[] = []
    for (const t of TUM_TABLOLAR) {
      const r = await anon.from(t).select('cozum_aciklamasi').limit(1)
      if (!okumaEngellendi(r)) sizan.push(t)
    }
    for (const t of TUM_TABLOLAR) {
      const r = await anon.from(t).select('topic').limit(1)
      if (!okumaEngellendi(r)) sizan.push(`${t}.topic`)
    }
    kontrol(sizan.length === 0, `cozum_aciklamasi/topic okunabilen tablolar: ${sizan.join(', ')}`)
    return `${TUM_TABLOLAR.length} tablo`
  })
  await adim('1b. anon: games, game_players, answers, game_questions ve diğer tablolar okunamıyor', async () => {
    const tablolar = ['games', 'game_players', 'answers', 'game_questions', 'profiles', 'player_stats', 'rank_tiers', 'global_scores', 'app_settings', 'mistake_book', 'mistake_games']
    const sizan: string[] = []
    for (const t of tablolar) {
      const r = await anon.from(t).select('*').limit(1)
      if (!okumaEngellendi(r)) sizan.push(t)
    }
    kontrol(sizan.length === 0, `okunabilen tablolar: ${sizan.join(', ')}`)
    return `${tablolar.length} tablo`
  })
  await adim('1c. anon: tüm RPC\'ler reddediliyor (get_my_stats dahil)', async () => {
    const liste: Array<[string, Record<string, unknown>]> = [
      ['server_time', {}],
      ['create_game', { p_kategori: 'tyt' }],
      ['join_game', { p_code: 'QZ-AAAA' }],
      ['start_game', { p_game_id: SIFIR_UUID }],
      ['get_game', { p_code: 'QZ-AAAA' }],
      ['get_game_by_id', { p_game_id: SIFIR_UUID }],
      ['get_question', { p_game_id: SIFIR_UUID, p_position: 0 }],
      ['submit_answer', { p_game_id: SIFIR_UUID, p_position: 0, p_secenek: 'A' }],
      ['finish_game', { p_game_id: SIFIR_UUID }],
      ['get_game_review', { p_game_id: SIFIR_UUID }],
      ['quick_join', { p_kategori: 'tyt' }],
      ['start_if_ready', { p_game_id: SIFIR_UUID }],
      ['leave_game', { p_game_id: SIFIR_UUID }],
      ['_create_game_internal', { p_kategori: 'tyt', p_host: SIFIR_UUID, p_public: true }],
      ['get_mistake_summary', {}],
      ['get_mistakes', { p_exam: null, p_subject: null, p_limit: 5 }],
      ['practice_answer', { p_question_id: SIFIR_UUID, p_selected: 'A' }],
      ['remove_mistake', { p_question_id: SIFIR_UUID }],
      ['_game_mistakes', { p_game_id: SIFIR_UUID }],
      ['_apply_mistakes', { p_game_id: SIFIR_UUID }],
      ['get_performance', { p_exam: null, p_days: 30 }],
      ['_perf_rows', { p_uid: SIFIR_UUID, p_since: '2000-01-01T00:00:00Z', p_exam: null }],
      ['get_global_leaderboard', {}],
      ['get_my_stats', {}],
      ['rank_of', { p_xp: 0 }],
      ['next_rank_of', { p_xp: 0 }],
      ['min_players', {}],
      ['question_label', { source_table: 'fen_lgs' }],
      ['game_snapshot', { p_game_id: SIFIR_UUID }],
      ['is_member', { gid: SIFIR_UUID }],
    ]
    const acik: string[] = []
    for (const [ad, args] of liste) {
      const r = await anon.rpc(ad, args)
      if (!yetkiHatasi(r.error)) acik.push(`${ad} → ${r.error ? `${r.error.code}: ${r.error.message}` : 'ÇAĞRI BAŞARILI'}`)
    }
    kontrol(acik.length === 0, `anon tarafından çağrılabilen: ${acik.join(' | ')}`)
    return `${liste.length} RPC`
  })

  // ===== Oyun 1: A (host) + B, lobi aşamasında =====
  let g1 = ''
  let kod1 = ''
  if (!(await adim('oyun 1 kuruldu (A, B)', async () => {
    const l = await lobiKur([A, B])
    g1 = l.gameId
    kod1 = l.code
    return kod1
  }))) return

  // ===== 2. Üye olmayan C =====
  await adim('2a. C: get_game_by_id, get_question, submit_answer, finish_game, get_game reddedildi', async () => {
    const sonuclar = await Promise.all([
      mesaj(() => C.api.getGameByCode(kod1)),
      mesaj(() => C.client.rpc('get_game_by_id', { p_game_id: g1 }).then((r) => { if (r.error) throw new Error(r.error.message) })),
      mesaj(() => C.api.getQuestion(g1, 0)),
      mesaj(() => C.api.submitAnswer(g1, 0, 'A')),
      mesaj(() => C.api.finishGame(g1)),
    ])
    kontrol(sonuclar.every((m) => m === 'Bu oyuna erişimin yok'), `mesajlar: ${JSON.stringify(sonuclar)}`)
  })
  await adim('2a2. get_game_review: üye olmayan C reddedildi; üye A için oyun bitmeden "Yarış henüz bitmedi"', async () => {
    const mC = await mesaj(() => C.client.rpc('get_game_review', { p_game_id: g1 }).then((r) => { if (r.error) throw new Error(r.error.message) }))
    kontrol(mC === 'Bu oyuna erişimin yok', `C mesajı: '${mC}'`)
    const mA = await mesaj(() => A.client.rpc('get_game_review', { p_game_id: g1 }).then((r) => { if (r.error) throw new Error(r.error.message) }))
    kontrol(mA === 'Yarış henüz bitmedi', `A mesajı: '${mA}'`)
    // C: authenticated rolü de soru tablolarından cozum_aciklamasi okuyamaz
    const sizan: string[] = []
    for (const t of TUM_TABLOLAR) {
      const r = await C.client.from(t).select('cozum_aciklamasi').limit(1)
      if (!okumaEngellendi(r)) sizan.push(t)
    }
    kontrol(sizan.length === 0, `authenticated okuyabildi: ${sizan.join(', ')}`)
  })
  await adim('2a3. Hemen Katıl: üye olmayan C start_if_ready/leave_game çağıramaz; istemci is_public/auto_start_at değiştiremez; _create_game_internal kapalı', async () => {
    const m1 = await mesaj(() => C.client.rpc('start_if_ready', { p_game_id: g1 }).then((r) => { if (r.error) throw new Error(r.error.message) }))
    const m2 = await mesaj(() => C.client.rpc('leave_game', { p_game_id: g1 }).then((r) => { if (r.error) throw new Error(r.error.message) }))
    kontrol(m1 === 'Bu oyuna erişimin yok' && m2 === 'Bu oyuna erişimin yok', `mesajlar: '${m1}' / '${m2}'`)
    // Üye A bile kendi lobisinde bu alanları doğrudan değiştiremez
    const gec = new Date(Date.now() - 60_000).toISOString()
    const u = await A.client.from('games').update({ is_public: true, auto_start_at: gec }).eq('id', g1).select()
    kontrol(!!u.error || (u.data ?? []).length === 0, `games güncellenebildi: ${JSON.stringify(u.data)}`)
    const { data: satir } = await admin.from('games').select('is_public, auto_start_at, status').eq('id', g1).single()
    kontrol(satir?.is_public === false && satir?.auto_start_at === null && satir?.status === 'lobby', `satır değişti: ${JSON.stringify(satir)}`)
    // Özel lobi: herkese açık olmadığından start_if_ready (üye olsa bile) hiçbir şey yapmaz
    await admin.from('games').update({ auto_start_at: gec }).eq('id', g1)
    const r = await A.client.rpc('start_if_ready', { p_game_id: g1 })
    const { data: sonra } = await admin.from('games').select('status').eq('id', g1).single()
    kontrol(!r.error && sonra?.status === 'lobby', `özel lobi başladı: ${r.error?.message ?? sonra?.status}`)
    await admin.from('games').update({ auto_start_at: null }).eq('id', g1)
    const ic = await C.client.rpc('_create_game_internal', { p_kategori: 'tyt', p_host: C.id, p_public: true })
    kontrol(!!ic.error, '_create_game_internal istemciden çağrılabildi!')
  })
  await adim('2a4. Yanlışlarım defteri: başkasının satırı görünmez/değiştirilemez; istemci tabloya yazamaz; iç yardımcılar kapalı', async () => {
    // A'nın defterine service role ile bir satır koy (gerçek bir soru id'siyle)
    const { data: soru } = await admin.from('matematik_tyt').select('id').limit(1).single()
    kontrol(!!soru, 'matematik_tyt boş: önce seed-test-questions çalıştırın')
    const qid = soru!.id as string
    const { error: eIns } = await admin.from('mistake_book').insert({ user_id: A.id, question_id: qid, source_table: 'matematik_tyt', wrong_count: 1, last_answer: 'A' })
    kontrol(!eIns, `hazırlık satırı eklenemedi: ${eIns?.message}`)
    try {
      // A kendi satırını okuyabilir; C göremez
      const okuA = await A.client.from('mistake_book').select('question_id').eq('question_id', qid)
      const okuC = await C.client.from('mistake_book').select('question_id').eq('question_id', qid)
      kontrol(!okuA.error && (okuA.data ?? []).length === 1, `A kendi satırını okuyamadı: ${okuA.error?.message}`)
      kontrol(okumaEngellendi(okuC), `C başkasının satırını okudu: ${JSON.stringify(okuC.data)}`)
      const tumC = await C.client.from('mistake_book').select('*')
      kontrol(!(tumC.data ?? []).some((x: { user_id: string }) => x.user_id === A.id), 'C tüm satırlarda A’nın verisini gördü')
      // mistake_games: policy yok
      const mg = await C.client.from('mistake_games').select('*').limit(1)
      kontrol(okumaEngellendi(mg), `mistake_games okunabildi: ${JSON.stringify(mg.data)}`)
      // İstemci doğrudan yazamaz (kendi satırı dahil)
      const ekle = await C.client.from('mistake_book').insert({ user_id: C.id, question_id: qid, source_table: 'matematik_tyt' }).select()
      kontrol(!!ekle.error || (ekle.data ?? []).length === 0, 'C kendi adına satır ekleyebildi!')
      const guncelle = await A.client.from('mistake_book').update({ wrong_count: 99, resolved_at: new Date().toISOString() }).eq('question_id', qid).select()
      kontrol(!!guncelle.error || (guncelle.data ?? []).length === 0, 'A kendi satırını doğrudan güncelleyebildi!')
      const sil = await A.client.from('mistake_book').delete().eq('question_id', qid).select()
      kontrol(!!sil.error || (sil.data ?? []).length === 0, 'A kendi satırını doğrudan silebildi!')
      const { data: satir } = await admin.from('mistake_book').select('wrong_count, resolved_at').eq('user_id', A.id).eq('question_id', qid).single()
      kontrol(satir?.wrong_count === 1 && satir?.resolved_at === null, `satır değişti: ${JSON.stringify(satir)}`)
      // RPC'ler başkasının satırına dokunamaz
      const pc = await mesaj(() => C.client.rpc('practice_answer', { p_question_id: qid, p_selected: 'A' }).then((r) => { if (r.error) throw new Error(r.error.message) }))
      const rc = await mesaj(() => C.client.rpc('remove_mistake', { p_question_id: qid }).then((r) => { if (r.error) throw new Error(r.error.message) }))
      kontrol(pc === 'Bu soru defterinde yok' && rc === 'Bu soru defterinde yok', `practice/remove mesajları: '${pc}' / '${rc}'`)
      const sc = await C.client.rpc('get_mistake_summary')
      const lc = await C.client.rpc('get_mistakes', { p_exam: null, p_subject: null, p_limit: 50 })
      kontrol(!sc.error && sc.data.total === 0 && !lc.error && lc.data.items.length === 0, 'C başkasının defterini RPC ile gördü')
      const { data: sonra } = await admin.from('mistake_book').select('resolved_at').eq('user_id', A.id).eq('question_id', qid).single()
      kontrol(sonra?.resolved_at === null, 'A’nın satırı C tarafından değiştirildi')
      // İç yardımcılar istemciden çağrılamaz
      const i1 = await C.client.rpc('_game_mistakes', { p_game_id: g1 })
      const i2 = await C.client.rpc('_apply_mistakes', { p_game_id: g1 })
      kontrol(!!i1.error && !!i2.error, '_game_mistakes/_apply_mistakes istemciden çağrılabildi!')
    } finally {
      await admin.from('mistake_book').delete().eq('user_id', A.id).eq('question_id', qid)
    }
  })
  await adim('2a5. Akıllı analiz: _perf_rows istemciden çağrılamaz (başkasının verisi); get_performance yalnızca çağıranın verisini döndürür; soru tablolarında topic okunamaz', async () => {
    const ic = await C.client.rpc('_perf_rows', { p_uid: A.id, p_since: '2000-01-01T00:00:00Z', p_exam: null })
    kontrol(!!ic.error, '_perf_rows istemciden çağrılabildi (başkasının verisi okunabilir)!')
    const pc = await C.client.rpc('get_performance', { p_exam: null, p_days: 365 })
    kontrol(!pc.error && pc.data.totals.games === 0 && pc.data.totals.answered === 0 && pc.data.by_topic.length === 0, `C boş olmalıydı: ${pc.error?.message ?? JSON.stringify(pc.data?.totals)}`)
    const kotu = await mesaj(() => C.client.rpc('get_performance', { p_exam: 'xyz', p_days: 30 }).then((r) => { if (r.error) throw new Error(r.error.message) }))
    kontrol(kotu === 'Geçersiz sınav', `geçersiz exam mesajı: '${kotu}'`)
    const t = await C.client.from('matematik_tyt').select('topic').limit(1)
    kontrol(okumaEngellendi(t), `authenticated topic okuyabildi: ${JSON.stringify(t.data)}`)
  })
  await adim('2b. C: başkasının oyununu start_game ile başlatamıyor', async () => {
    const m = await mesaj(() => C.api.startGame(g1))
    kontrol(m !== null, 'start_game başarılı oldu!')
    const { data } = await admin.from('games').select('status').eq('id', g1).single()
    kontrol(data?.status === 'lobby', `oyun durumu ${data?.status}`)
    return m ?? ''
  })
  await adim('2c. C: games/game_players doğrudan okunamıyor; answers, game_questions ve soru tabloları reddediliyor', async () => {
    const g = await C.client.from('games').select('*').eq('id', g1)
    const gp = await C.client.from('game_players').select('*').eq('game_id', g1)
    kontrol(okumaEngellendi(g) && okumaEngellendi(gp), `games ${JSON.stringify(g.data)} / game_players ${JSON.stringify(gp.data)}`)
    const a = await C.client.from('answers').select('*').limit(1)
    const q = await C.client.from('game_questions').select('*').limit(1)
    kontrol(okumaEngellendi(a) && okumaEngellendi(q), 'answers/game_questions okunabildi')
    const sizan: string[] = []
    for (const t of TUM_TABLOLAR) {
      const r = await C.client.from(t).select('id, dogru_sik').limit(1)
      if (!okumaEngellendi(r)) sizan.push(t)
    }
    kontrol(sizan.length === 0, `giriş yapmış kullanıcı şu tabloları okuyabildi: ${sizan.join(', ')}`)
  })
  await adim('2d. giriş yapmış kullanıcı iç yardımcı fonksiyonları (min_players, question_label, game_snapshot) çağıramıyor', async () => {
    const acik: string[] = []
    for (const [ad, args] of [
      ['min_players', {}],
      ['question_label', { source_table: 'fen_lgs' }],
      ['game_snapshot', { p_game_id: g1 }],
    ] as Array<[string, Record<string, unknown>]>) {
      const r = await C.client.rpc(ad, args)
      if (!yetkiHatasi(r.error)) acik.push(ad)
    }
    kontrol(acik.length === 0, `çağrılabilen: ${acik.join(', ')}`)
  })

  // ===== 3. Doğrudan yazma =====
  await adim('3a. A: player_stats, rank_tiers, global_scores tablolarına yazamıyor', async () => {
    // Her tablo için gerçekten var olan bir sütunla filtrele (olmayan sütun hatası sahte "engellendi" sonucu verir)
    const tablolar: Array<{ t: string; kolon: string; ekle: Record<string, unknown>; guncelle: Record<string, unknown> }> = [
      { t: 'player_stats', kolon: 'user_id', ekle: { user_id: A.id, xp: 99999 }, guncelle: { xp: 99999 } },
      { t: 'rank_tiers', kolon: 'min_xp', ekle: { min_xp: 99999, rank_key: 'x', rank_label: 'X' }, guncelle: { rank_label: 'X' } },
      { t: 'global_scores', kolon: 'user_id', ekle: { user_id: A.id, total_points: 99999 }, guncelle: { total_points: 99999 } },
    ]
    const denemeler: Array<[string, { error: HamHata | null; data: unknown }]> = []
    for (const { t, kolon, ekle, guncelle } of tablolar) {
      denemeler.push([`${t} insert`, await A.client.from(t).insert(ekle).select()])
      denemeler.push([`${t} update`, await A.client.from(t).update(guncelle).not(kolon, 'is', null).select()])
      denemeler.push([`${t} delete`, await A.client.from(t).delete().not(kolon, 'is', null).select()])
    }
    const gecenler = denemeler.filter(([, r]) => !yazmaEngellendi(r)).map(([ad]) => ad)
    kontrol(gecenler.length === 0, `engellenmeyen yazmalar: ${gecenler.join(', ')}`)
    // Hata nedeni gerçekten yetki mi (sütun/sözdizimi hatası değil)?
    const yetkiDisi = denemeler
      .filter(([, r]) => r.error !== null && !yetkiHatasi(r.error))
      .map(([ad, r]) => `${ad}: ${r.error?.message}`)
    kontrol(yetkiDisi.length === 0, `yetki dışı hata (test geçersiz olabilir): ${yetkiDisi.join(' | ')}`)
    const st = await statOku([A.id])
    kontrol(st[A.id]?.xp === 0, `A'nın XP'si değişti: ${st[A.id]?.xp}`)
    const { count } = await admin.from('rank_tiers').select('*', { count: 'exact', head: true })
    kontrol(count === 14, `rank_tiers ${count} satır (beklenen 14)`)
    return `${denemeler.length} deneme engellendi`
  })
  await adim('3b. A: kendi game_players.score/xp_* alanlarını ve games/answers/game_questions tablolarını değiştiremiyor', async () => {
    const denemeler: Array<[string, { error: HamHata | null; data: unknown }]> = [
      ['game_players score', await A.client.from('game_players').update({ score: 99999 }).eq('game_id', g1).eq('user_id', A.id).select()],
      ['game_players xp', await A.client.from('game_players').update({ xp_gained: 999, xp_after: 999 }).eq('game_id', g1).eq('user_id', A.id).select()],
      ['game_players insert', await A.client.from('game_players').insert({ game_id: g1, user_id: C.id }).select()],
      ['game_players delete', await A.client.from('game_players').delete().eq('game_id', g1).eq('user_id', B.id).select()],
      ['games update', await A.client.from('games').update({ status: 'finished', winner_id: A.id }).eq('id', g1).select()],
      ['games delete', await A.client.from('games').delete().eq('id', g1).select()],
      ['answers insert', await A.client.from('answers').insert({ game_id: g1, user_id: A.id, position: 0, secenek: 'A', dogru: true, sure_ms: 1, puan: 200 }).select()],
      ['game_questions update', await A.client.from('game_questions').update({ question_id: SIFIR_UUID }).eq('game_id', g1).select()],
    ]
    const gecenler = denemeler.filter(([, r]) => !yazmaEngellendi(r)).map(([ad]) => ad)
    kontrol(gecenler.length === 0, `engellenmeyen yazmalar: ${gecenler.join(', ')}`)
    const { data: gp } = await admin.from('game_players').select('user_id, score, xp_gained').eq('game_id', g1)
    kontrol((gp ?? []).length === 2 && (gp ?? []).every((r) => r.score === 0 && r.xp_gained === null), `game_players değişti: ${JSON.stringify(gp)}`)
    const { data: g } = await admin.from('games').select('status, winner_id').eq('id', g1).single()
    kontrol(g?.status === 'lobby' && g?.winner_id === null, `games değişti: ${JSON.stringify(g)}`)
    return `${denemeler.length} deneme engellendi`
  })
  await adim('3c. A: başkasının profiles satırını güncelleyemiyor/silemiyor/ekleyemiyor', async () => {
    const guncelle = await A.client.from('profiles').update({ display_name: 'HACKED' }).eq('id', B.id).select()
    const sil = await A.client.from('profiles').delete().eq('id', B.id).select()
    const ekle = await A.client.from('profiles').insert({ id: B.id, display_name: 'HACKED2' }).select()
    kontrol(yazmaEngellendi(guncelle) && yazmaEngellendi(sil) && yazmaEngellendi(ekle), 'bir yazma geçti')
    const { data } = await admin.from('profiles').select('display_name').eq('id', B.id).single()
    kontrol(data?.display_name === 'SEC B', `B'nin adı '${data?.display_name}' oldu`)
    // Kendi satırını güncelleyebilmeli (RLS doğru çalışıyor, her şeyi kapatmıyor)
    const kendi = await A.client.from('profiles').update({ display_name: 'SEC A' }).eq('id', A.id).select()
    kontrol(!kendi.error && (kendi.data ?? []).length === 1, 'kendi profilini güncelleyemedi')
  })

  // ===== 6a. Oyun başlamadan =====
  await adim("6a. oyun başlamadan get_question/submit_answer → 'Oyun başlamadı'", async () => {
    const m1 = await mesaj(() => A.api.getQuestion(g1, 0))
    const m2 = await mesaj(() => A.api.submitAnswer(g1, 0, 'A'))
    kontrol(m1 === 'Oyun başlamadı' && m2 === 'Oyun başlamadı', `${m1} / ${m2}`)
  })

  // ---- Oyunu başlat ----
  await A.api.startGame(g1)
  await adim("6b. geri sayım sürerken get_question → 'Oyun başlamadı'", async () => {
    const m = await mesaj(() => B.api.getQuestion(g1, 0))
    kontrol(m === 'Oyun başlamadı', `${m}`)
  })
  await bekle(3300)
  const siklar1 = await dogruSiklariOku(g1)

  await adim("6c. gelecek position → 'Sıra dışı soru' (get_question ve submit_answer)", async () => {
    const m1 = await mesaj(() => A.api.getQuestion(g1, 5))
    const m2 = await mesaj(() => A.api.submitAnswer(g1, 5, 'A'))
    kontrol(m1 === 'Sıra dışı soru' && m2 === 'Sıra dışı soru', `${m1} / ${m2}`)
  })
  await adim("6d. get_question çağrılmadan submit_answer → 'Önce soruyu getir'", async () => {
    const m = await mesaj(() => A.api.submitAnswer(g1, 0, 'A'))
    kontrol(m === 'Önce soruyu getir', `${m}`)
  })
  await adim("6e. geçersiz şık ('Z') → 'Geçersiz şık'", async () => {
    await A.api.getQuestion(g1, 0)
    const m = await mesaj(() => A.api.submitAnswer(g1, 0, 'Z' as Secenek))
    kontrol(m === 'Geçersiz şık', `${m}`)
  })
  await adim("6f. aynı soruya ikinci cevap → 'Bu soru zaten cevaplandı'", async () => {
    const r = await A.api.submitAnswer(g1, 0, siklar1[0])
    kontrol(r.correct && r.points >= 100, `ilk cevap ${JSON.stringify(r)}`)
    const m = await mesaj(() => A.api.submitAnswer(g1, 0, siklar1[0]))
    kontrol(m === 'Bu soru zaten cevaplandı', `${m}`)
    const { count } = await admin.from('answers').select('*', { count: 'exact', head: true }).eq('game_id', g1).eq('user_id', A.id)
    kontrol(count === 1, `${count} cevap kaydı`)
  })

  // ===== 8. Yenileme / yeniden bağlanma =====
  await adim('8. yenileme: aynı oturum aynı id, currentQ\'dan devam, aynı soru q_started_at\'i değiştirmiyor', async () => {
    await oyna(B, g1, siklar1, 0, 3) // B 3 soru çözdü
    const sess = (await B.client.auth.getSession()).data.session
    kontrol(!!sess, 'B oturumu yok')
    const yeni = yeniIstemci()
    const { error } = await yeni.auth.setSession({ access_token: sess!.access_token, refresh_token: sess!.refresh_token })
    kontrol(!error, `setSession: ${error?.message}`)
    const api2 = createApi(yeni)
    const id2 = await api2.ensureSession()
    kontrol(id2 === B.id, `yeni istemci id ${id2} ≠ ${B.id}`)
    const snap = await api2.getGameByCode(kod1)
    const ben = snap.players.find((p) => p.userId === B.id)
    kontrol(ben?.currentQ === 3, `currentQ ${ben?.currentQ} (beklenen 3)`)
    await api2.getQuestion(g1, 3)
    const oku = async () =>
      (await admin.from('game_players').select('q_started_at').eq('game_id', g1).eq('user_id', B.id).single()).data?.q_started_at as string | null
    const t1 = await oku()
    await bekle(500)
    await api2.getQuestion(g1, 3) // sayfa yenilendi, aynı soru tekrar istendi
    const t2 = await oku()
    kontrol(!!t1 && t1 === t2, `q_started_at değişti: ${t1} → ${t2}`)
    const r = await api2.submitAnswer(g1, 3, siklar1[3]) // kaldığı yerden devam
    kontrol(r.correct, 'devam eden cevap doğru sayılmadı')
    return `currentQ 3 → devam`
  })

  // ===== 7. Süre kuralı =====
  await adim('7. süre bitince submit_answer BOŞ sayar (0 puan), get_question \'Süre doldu\' der', async () => {
    await A.api.getQuestion(g1, 1) // A'nın sayacı başladı
    await sureyiBitir(g1)
    const r = await A.api.submitAnswer(g1, 1, siklar1[1]) // doğru şık, ama süre bitti
    kontrol(r.points === 0 && r.correct === false, `geç cevap sonucu ${JSON.stringify(r)}`)
    const { data } = await admin.from('answers').select('secenek, dogru, puan').eq('game_id', g1).eq('user_id', A.id).eq('position', 1).single()
    kontrol(data?.secenek === null && data?.dogru === null && data?.puan === 0, `answers kaydı ${JSON.stringify(data)}`)
    const m = await mesaj(() => A.api.getQuestion(g1, 2))
    const mB = await mesaj(() => B.api.getQuestion(g1, 4))
    kontrol(m === 'Süre doldu' && mB === 'Süre doldu', `${m} / ${mB}`)
  })

  // ===== 4. XP hileleri =====
  let g4 = ''
  await adim('4a. yarış bitmeden finish_game → \'Yarış henüz bitmedi\', XP verilmez', async () => {
    await statAyarla(A.id, 0)
    await statAyarla(B.id, 0)
    await statAyarla(C.id, 0)
    g4 = (await lobiKur([A, B])).gameId
    await baslat(A, g4)
    const siklar = await dogruSiklariOku(g4)
    await oyna(A, g4, siklar, 0, 10) // A bitirdi, B başlamadı
    const m = await mesaj(() => A.api.finishGame(g4))
    kontrol(m === 'Yarış henüz bitmedi', `${m}`)
    const st = await statOku([A.id, B.id])
    kontrol(st[A.id].xp === 0 && st[B.id].xp === 0 && st[A.id].games_played === 0, `XP verildi: ${JSON.stringify(st)}`)
    await oyna(B, g4, siklar, 0, 10, false)
  })
  await adim('4b. üye olmayan C finish_game ile XP kazanamıyor', async () => {
    const m = await mesaj(() => C.api.finishGame(g4))
    kontrol(m === 'Bu oyuna erişimin yok', `${m}`)
    const st = await statOku([C.id])
    kontrol(st[C.id]?.xp === 0 && st[C.id]?.games_played === 0, `C'nin istatistiği değişti: ${JSON.stringify(st[C.id])}`)
  })
  await adim('4c. finish_game tekrar tekrar (ardışık ve eşzamanlı) çağrılınca XP yalnızca bir kez eklenir', async () => {
    const ilk = await A.api.finishGame(g4)
    const sonra1 = await statOku([A.id, B.id])
    const xpA = ilk.ranking.find((r) => r.userId === A.id)!.xpGained
    kontrol(xpA > 0 && sonra1[A.id].xp === xpA && sonra1[A.id].games_played === 1, `ilk çağrı: ${JSON.stringify(sonra1[A.id])}, xpGained ${xpA}`)
    for (let i = 0; i < 4; i++) await B.api.finishGame(g4)
    await Promise.all([...Array(5).keys()].flatMap(() => [A.api.finishGame(g4), B.api.finishGame(g4)]))
    const sonra2 = await statOku([A.id, B.id])
    kontrol(JSON.stringify(sonra2) === JSON.stringify(sonra1), `XP değişti: ${JSON.stringify(sonra1)} → ${JSON.stringify(sonra2)}`)
    return `11 ek çağrı, XP ${xpA} sabit`
  })
  await adim('4d. tek oyunculu yarışta XP verilmez (min_players=1, sonra geri alınır)', async () => {
    const { data: eski } = await admin.from('app_settings').select('value').eq('key', 'min_players').single()
    minPlayersEski = eski?.value ?? null
    try {
      await admin.from('app_settings').update({ value: '1' }).eq('key', 'min_players')
      await statAyarla(C.id, 40)
      const { gameId } = await lobiKur([C])
      await baslat(C, gameId)
      const siklar = await dogruSiklariOku(gameId)
      await oyna(C, gameId, siklar, 0, 2)
      await sureyiBitir(gameId)
      const r = await C.api.finishGame(gameId)
      const s = r.ranking[0]
      kontrol(r.ranking.length === 1 && s.xpGained === 0 && s.xpAfter === 40, `sonuç ${JSON.stringify(s)}`)
      const st = await statOku([C.id])
      kontrol(st[C.id].xp === 40 && st[C.id].games_played === 0 && st[C.id].wins === 0, `istatistik ${JSON.stringify(st[C.id])}`)
    } finally {
      await geriYukle()
    }
    const { data: son } = await admin.from('app_settings').select('value').eq('key', 'min_players').single()
    kontrol(son?.value === (eski?.value ?? '2'), `min_players geri alınmadı: ${son?.value}`)
    return `min_players ${son?.value}'e geri alındı`
  })

  // ===== 9 + 10. 5 oyuncu: lobi sınırları ve eşzamanlılık =====
  let g9 = ''
  let kod9 = ''
  await adim('10a. 6. oyuncu \'Lobi dolu\'; üye yeniden joinGame aynı gameId\'yi alır', async () => {
    for (const o of [A, B, C, D, E]) await statAyarla(o.id, 0)
    const l = await lobiKur([A, B, C, D, E])
    g9 = l.gameId
    kod9 = l.code
    const m = await mesaj(() => F.api.joinGame(kod9))
    kontrol(m === 'Lobi dolu', `${m}`)
    const tekrar = await Promise.all([B.api.joinGame(kod9), A.api.joinGame(kod9)])
    kontrol(tekrar.every((t) => t.gameId === g9), 'yeniden katılımda farklı gameId döndü')
    const { count } = await admin.from('game_players').select('*', { count: 'exact', head: true }).eq('game_id', g9)
    kontrol(count === 5, `${count} oyuncu kaydı`)
  })
  await adim('10b. başlamış oyuna yeni oyuncu → \'Oyun başladı\'; üye yine de yeniden bağlanabilir', async () => {
    await baslat(A, g9)
    const m = await mesaj(() => F.api.joinGame(kod9))
    kontrol(m === 'Oyun başladı', `${m}`)
    const r = await C.api.joinGame(kod9)
    kontrol(r.gameId === g9, 'üye başlamış oyuna yeniden bağlanamadı')
  })
  await adim('9. 5 oyuncu son soruyu AYNI anda gönderir, sonra AYNI anda finish_game: kilitlenme yok, speedup bir kez, XP bir kez', async () => {
    const siklar = await dogruSiklariOku(g9)
    const oyuncular = [A, B, C, D, E]
    await faz('0-8. sorular (paralel)', () => Promise.all(oyuncular.map((o) => oyna(o, g9, siklar, 0, 9))))
    await faz('9. soruyu alma (paralel)', () => Promise.all(oyuncular.map((o) => o.api.getQuestion(g9, 9))))

    // 5 oyuncu son soruyu AYNI anda gönderir; her birinin sonucu ayrı raporlanır
    const sonHam = await faz('son cevap (eşzamanlı)', () => Promise.allSettled(oyuncular.map((o) => o.api.submitAnswer(g9, 9, siklar[9]))))
    const sonHatalar = sonHam.flatMap((r, i) => (r.status === 'rejected' ? [`${oyuncular[i].ad}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`] : []))
    kontrol(sonHatalar.length === 0, `son cevap hataları: ${sonHatalar.join(' | ')}`)
    const son = sonHam.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    const tetik = oyuncular.filter((_, i) => son[i].speedupTriggered)
    kontrol(son.every((s) => s.finished), 'bir oyuncu bitiremedi')
    kontrol(tetik.length === 1, `${tetik.length} oyuncu speedup'ı tetikledi (beklenen 1)`)
    const { data: g } = await admin.from('games').select('speedup_at, speedup_by, speedup_remaining_ms').eq('id', g9).single()
    kontrol(!!g?.speedup_at && g?.speedup_by === tetik[0].id && Number(g?.speedup_remaining_ms) > 0, `games ${JSON.stringify(g)}, tetikleyen ${tetik[0].id}`)

    const t0 = Date.now()
    const bitis = await faz('finish_game (eşzamanlı)', () => Promise.all(oyuncular.map((o) => mesaj(() => o.api.finishGame(g9)))))
    kontrol(bitis.every((m) => m === null), `finish_game hataları (kilitlenme?): ${JSON.stringify(bitis)}`)
    const sonuc = await faz('finish_game (ikinci eşzamanlı tur)', () => Promise.all(oyuncular.map((o) => o.api.finishGame(g9))))
    kontrol(Date.now() - t0 < 15_000, `finish_game ${Date.now() - t0} ms sürdü`)
    const ref = JSON.stringify(sonuc[0].ranking)
    kontrol(sonuc.every((s) => s.winnerId === sonuc[0].winnerId && JSON.stringify(s.ranking) === ref), 'farklı sonuçlar döndü')

    const st = await statOku(oyuncular.map((o) => o.id))
    for (const o of oyuncular) {
      const satir = sonuc[0].ranking.find((r) => r.userId === o.id)!
      kontrol(st[o.id].games_played === 1 && st[o.id].xp === satir.xpGained, `${o.ad}: games_played ${st[o.id].games_played}, xp ${st[o.id].xp} (xpGained ${satir.xpGained})`)
    }
    kontrol(sonuc[0].ranking.reduce((t, r) => t + (r.xpBefore === 0 && r.xpAfter === r.xpGained ? 1 : 0), 0) === 5, 'xpBefore/xpAfter tutarsız')
    const sonrasi = await Promise.all(oyuncular.map((o) => o.api.finishGame(g9)))
    const st2 = await statOku(oyuncular.map((o) => o.id))
    kontrol(sonrasi.length === 5 && JSON.stringify(st2) === JSON.stringify(st), 'ikinci eşzamanlı tur XP\'yi değiştirdi')
    return `ilk bitiren ${tetik[0].ad}, ${Date.now() - t0} ms`
  })

  // ===== 11. Kategori doğrulaması =====
  await adim("11a. geçersiz kategori ('lgs') → 'Geçersiz kategori'", async () => {
    const m = await mesaj(() => A.api.createGame('lgs' as never))
    kontrol(m === 'Geçersiz kategori', `${m}`)
  })
  await adim("11b. yeterli soru yoksa anlaşılır hata ('Bu kategori için yeterli soru yok: fen_lgs'); sorular geri açılır", async () => {
    const { data: kapanan, error } = await admin.from('fen_lgs').update({ aktif: false }).eq('aktif', true).select('id')
    if (error) throw new Error(`fen_lgs kapatılamadı: ${error.message}`)
    deaktifEdilenSorular = (kapanan ?? []).map((r) => r.id as string)
    try {
      const m = await mesaj(() => A.api.createGame('lgs_sayisal'))
      kontrol(m === 'Bu kategori için yeterli soru yok: fen_lgs', `${m}`)
    } finally {
      await geriYukle()
    }
    const { count } = await admin.from('fen_lgs').select('*', { count: 'exact', head: true }).eq('aktif', true)
    kontrol((count ?? 0) === deaktifEdilenSorular.length || (count ?? 0) > 0, `fen_lgs aktif ${count}`)
    return `${(kapanan ?? []).length} soru geçici kapatılıp geri açıldı`
  })

  // ===== 12. LGS soruları 4 şıklı (0007_lgs_4_sik.sql) =====
  await adim('12a. veritabanı kısıtları: LGS\'de secenek_e boş ve dogru_sik yalnız A-D; YKS\'de 5 şık zorunlu, dogru_sik A-E', async () => {
    const etiket = `[TEST] 4sik-kontrol ${Date.now()}`
    const govde = { secenek_a: 'a', secenek_b: 'b', secenek_c: 'c', secenek_d: 'd' }
    const eklenenler: Array<{ tablo: string; id: string }> = []
    const ekle = async (tablo: string, ek: Record<string, unknown>) => {
      const r = await admin.from(tablo).insert({ soru_metni: `${etiket} ${tablo}`, ...govde, ...ek }).select('id')
      if (!r.error && r.data?.[0]) eklenenler.push({ tablo, id: r.data[0].id as string })
      return r
    }
    try {
      const lgsE = await ekle('fen_lgs', { secenek_e: null, dogru_sik: 'E' })
      kontrol(!!lgsE.error, "LGS'ye dogru_sik='E' eklenebildi!")
      const lgsOk = await ekle('fen_lgs', { secenek_e: null, dogru_sik: 'D' })
      kontrol(!lgsOk.error, `LGS 4 şıklı soru eklenemedi: ${lgsOk.error?.message}`)
      const yksBos = await ekle('fizik_ayt', { secenek_e: null, dogru_sik: 'A' })
      kontrol(!!yksBos.error, "YKS'ye secenek_e boş soru eklenebildi (5 şık zorunlu olmalı)!")
      const yksOk = await ekle('fizik_ayt', { secenek_e: 'e', dogru_sik: 'E' })
      kontrol(!yksOk.error, `YKS 5 şıklı (doğru E) soru eklenemedi: ${yksOk.error?.message}`)
      return "LGS: E boş ✓, doğru E ✗; YKS: E zorunlu ✓, doğru E ✓"
    } finally {
      for (const e of eklenenler) await admin.from(e.tablo).delete().eq('id', e.id)
    }
  })
  await adim("12b. LGS oyununda soru 4 şıklı (options'ta E yok); E gönderilirse 'Geçersiz şık', kayıt yazılmaz; geçerli şık hâlâ çalışır", async () => {
    const g = (await lobiKur([A, B], 'lgs_sozel')).gameId
    await baslat(A, g)
    const siklar = await dogruSiklariOku(g)
    kontrol(siklar.every((s) => 'ABCD'.includes(s)), `LGS doğru şıklar A-D dışında: ${siklar.join('')}`)
    const soru = await A.api.getQuestion(g, 0)
    kontrol(Object.keys(soru.options).sort().join('') === 'ABCD', `options anahtarları: ${Object.keys(soru.options).join('')}`)
    kontrol(!('E' in soru.options), "options içinde 'E' var")
    const m = await mesaj(() => A.api.submitAnswer(g, 0, 'E'))
    kontrol(m === 'Geçersiz şık', `E cevabı: ${m}`)
    const { count } = await admin.from('answers').select('*', { count: 'exact', head: true }).eq('game_id', g).eq('user_id', A.id)
    const { data: gp } = await admin.from('game_players').select('current_q, q_started_at, score').eq('game_id', g).eq('user_id', A.id).single()
    kontrol(count === 0 && gp?.current_q === 0 && gp?.score === 0 && gp?.q_started_at !== null, `geçersiz şık kayıt bıraktı: answers ${count}, ${JSON.stringify(gp)}`)
    const r = await A.api.submitAnswer(g, 0, siklar[0])
    kontrol(r.correct && r.points >= 100 && 'ABCD'.includes(r.correctOption), `geçerli cevap: ${JSON.stringify(r)}`)
    return `options ${Object.keys(soru.options).join('')}`
  })
  await adim("12c. YKS oyununda soru 5 şıklı; 'E' hâlâ geçerli bir cevap", async () => {
    const g = (await lobiKur([A, B], 'tyt')).gameId
    await baslat(A, g)
    const soru = await A.api.getQuestion(g, 0)
    kontrol(Object.keys(soru.options).sort().join('') === 'ABCDE', `options anahtarları: ${Object.keys(soru.options).join('')}`)
    const r = await A.api.submitAnswer(g, 0, 'E')
    kontrol(/^[A-E]$/.test(r.correctOption) && (r.points === -25 || r.points >= 100), `E cevabı: ${JSON.stringify(r)}`)
  })

  // ===== 5. Storage =====
  await adim('5. storage: kendi klasörüne yükleyebilir; başkasının klasörüne, kök dizine ve soru-gorselleri\'ne yazamaz', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
    const secenek = { contentType: 'image/png', upsert: false }
    const zaman = Date.now()

    const kendi = `${A.id}/avatar-${zaman}.png`
    const ok = await A.client.storage.from('avatars').upload(kendi, png, secenek)
    if (!ok.error) yuklenenDosyalar.push({ kova: 'avatars', yol: kendi })
    kontrol(!ok.error, `kendi klasörüne yükleyemedi: ${ok.error?.message}`)

    // B kendi dosyasını yükler; A bunu ezmeye/silmeye çalışır
    const bDosya = `${B.id}/avatar-${zaman}.png`
    const bOk = await B.client.storage.from('avatars').upload(bDosya, png, secenek)
    kontrol(!bOk.error, `B yükleyemedi: ${bOk.error?.message}`)
    yuklenenDosyalar.push({ kova: 'avatars', yol: bDosya })

    const hack = `${B.id}/hack-${zaman}.png`
    const r1 = await A.client.storage.from('avatars').upload(hack, png, secenek)
    if (!r1.error) yuklenenDosyalar.push({ kova: 'avatars', yol: hack })
    kontrol(!!r1.error, "A, B'nin klasörüne yükleyebildi!")
    const r2 = await A.client.storage.from('avatars').upload(bDosya, png, { ...secenek, upsert: true })
    kontrol(!!r2.error, "A, B'nin dosyasının üzerine yazabildi!")
    const r3 = await A.client.storage.from('avatars').remove([bDosya])
    const { data: liste } = await admin.storage.from('avatars').list(B.id)
    kontrol((liste ?? []).some((f) => f.name === `avatar-${zaman}.png`), `A, B'nin dosyasını sildi (${JSON.stringify(r3.data)})`)
    const kok = `kok-${zaman}.png`
    const r4 = await A.client.storage.from('avatars').upload(kok, png, secenek)
    if (!r4.error) yuklenenDosyalar.push({ kova: 'avatars', yol: kok })
    kontrol(!!r4.error, 'A, avatars kök dizinine yükleyebildi!')

    const soru = `${A.id}/soru-${zaman}.png`
    const r5 = await A.client.storage.from('soru-gorselleri').upload(soru, png, secenek)
    if (!r5.error) yuklenenDosyalar.push({ kova: 'soru-gorselleri', yol: soru })
    kontrol(!!r5.error, 'A, soru-gorselleri kovasına yazabildi!')
    const r6 = await A.client.storage.from('soru-gorselleri').upload(`${zaman}.png`, png, secenek)
    if (!r6.error) yuklenenDosyalar.push({ kova: 'soru-gorselleri', yol: `${zaman}.png` })
    kontrol(!!r6.error, 'A, soru-gorselleri köküne yazabildi!')

    const anonYol = `${A.id}/anon-${zaman}.png`
    const r7 = await anon.storage.from('avatars').upload(anonYol, png, secenek)
    if (!r7.error) yuklenenDosyalar.push({ kova: 'avatars', yol: anonYol })
    kontrol(!!r7.error, 'anon avatars kovasına yükleyebildi!')
    return '7 deneme'
  })
}

// =====================================================================
async function main(): Promise<void> {
  await testler()
}

main()
  .catch((e) => {
    kayitlar.push({ ad: 'beklenmeyen hata', gecti: false, ms: 0, ayrinti: e instanceof Error ? e.message : String(e) })
    console.error(`KALDI — beklenmeyen hata — ${e instanceof Error ? e.message : String(e)}`)
  })
  .finally(async () => {
    await temizle()
    const ad = Math.max(4, ...kayitlar.map((k) => Math.min(k.ad.length, 110)))
    console.log(`\n${'ADIM'.padEnd(ad)}  SONUÇ  SÜRE (ms)`)
    console.log(`${'-'.repeat(ad)}  -----  ---------`)
    for (const k of kayitlar) console.log(`${k.ad.slice(0, 110).padEnd(ad)}  ${(k.gecti ? 'geçti' : 'KALDI').padEnd(5)}  ${String(k.ms).padStart(9)}`)
    const kalanlar = kayitlar.filter((k) => !k.gecti)
    if (kalanlar.length > 0) {
      console.error(`\n${kalanlar.length} ADIM KALDI:`)
      for (const k of kalanlar) console.error(`  - ${k.ad}: ${k.ayrinti}`)
      console.error("\nBir güvenlik açığı görüyorsan düzeltmeyi yeni bir migration (0006_fix_*.sql) olarak yaz; eski migration'ları değiştirme.")
      process.exit(1)
    }
    console.log('\nTÜM GÜVENLİK TESTLERİ GEÇTİ')
    process.exit(0)
  })
