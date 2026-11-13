import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
const kullanicilar: string[] = []
const oyunlar: string[] = []

async function kullaniciOlustur(ad: string): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.user) throw new Error(`${ad} anonim giriş: ${error?.message}`)
  kullanicilar.push(data.user.id)
  const { error: pErr } = await client
    .from('profiles')
    .insert({ id: data.user.id, display_name: `Test ${ad}` })
  if (pErr) throw new Error(`${ad} profil: ${pErr.message}`)
  return { client, id: data.user.id }
}

async function temizle() {
  if (oyunlar.length > 0) await admin.from('games').delete().in('id', oyunlar)
  for (const id of kullanicilar) await admin.auth.admin.deleteUser(id)
}

type Kullanici = { client: SupabaseClient; id: string }
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Doğru şıkkı service role ile oku (istemci göremez)
async function dogruSik(id: string, pos: number): Promise<string> {
  const { data: gq, error } = await admin
    .from('game_questions')
    .select('source_table, question_id')
    .eq('game_id', id)
    .eq('position', pos)
    .single()
  if (error || !gq) throw new Error(`game_questions ${pos}: ${error?.message}`)
  const { data: q, error: qErr } = await admin.from(gq.source_table).select('dogru_sik').eq('id', gq.question_id).single()
  if (qErr || !q) throw new Error(`${gq.source_table} ${gq.question_id}: ${qErr?.message}`)
  return String(q.dogru_sik)
}

// get_question + submit_answer testleri (0004_rpc_game.sql). Oyun 'playing' ve başlamış olmalı.
async function soruCevapTesti(A: Kullanici, B: Kullanici, id: string) {
  const al = (u: Kullanici, pos: number) => u.client.rpc('get_question', { p_game_id: id, p_position: pos })
  const ver = (u: Kullanici, pos: number, s: string | null) =>
    u.client.rpc('submit_answer', { p_game_id: id, p_position: pos, p_secenek: s })

  // Başlangıç geri sayımı bitsin (start_game started_at = now() + 3 sn)
  await bekle(3500)

  // Sıra dışı soru istenemez
  const sd = await al(B, 3)
  rapor('sıra dışı get_question reddedildi', sd.error?.message === 'Sıra dışı soru', sd.error?.message)

  // Soru henüz getirilmeden cevap verilemez
  const once = await ver(B, 0, 'A')
  rapor('get_question öncesi submit_answer reddedildi', once.error?.message === 'Önce soruyu getir', once.error?.message)

  // B 0. soruyu alır: doğru şık/açıklama sızmamalı
  const q0 = await al(B, 0)
  const anahtarlar = Object.keys(q0.data ?? {}).sort().join(',')
  const metin = JSON.stringify(q0.data ?? {})
  rapor(
    'B get_question(0): doğru şık/açıklama yok',
    !q0.error &&
      anahtarlar === 'ders,image_url,options,position,text' &&
      Object.keys(q0.data.options).sort().join('') === 'ABCDE' &&
      !/dogru|aciklama|aktif|correct/i.test(metin),
    q0.error?.message ?? anahtarlar,
  )
  rapor("get_question ders etiketi '(AYT)' içeriyor", String(q0.data?.ders).includes('(AYT)'), q0.data?.ders)

  // Aynı soruyu tekrar istemek süreyi sıfırlamamalı (q_started_at aynı kalır)
  const { data: gp1 } = await admin.from('game_players').select('q_started_at').eq('game_id', id).eq('user_id', B.id).single()
  await bekle(300)
  const q0b = await al(B, 0)
  const { data: gp2 } = await admin.from('game_players').select('q_started_at').eq('game_id', id).eq('user_id', B.id).single()
  rapor(
    'aynı soru tekrar istenince q_started_at değişmedi',
    !q0b.error && !!gp1?.q_started_at && gp1.q_started_at === gp2?.q_started_at,
    q0b.error?.message,
  )

  // Geçersiz şık
  const gs = await ver(B, 0, 'Z')
  rapor('geçersiz şık reddedildi', gs.error?.message === 'Geçersiz şık', gs.error?.message)

  // Hemen doğru cevap >= 190
  const d0 = await dogruSik(id, 0)
  const r0 = await ver(B, 0, d0)
  rapor(
    'hemen doğru cevap >= 190 puan',
    !r0.error && r0.data?.correct === true && r0.data?.points >= 190 && r0.data?.points <= 200 &&
      r0.data?.correct_option === d0 && r0.data?.new_score === r0.data?.points &&
      r0.data?.finished === false && r0.data?.speedup_triggered === false,
    r0.error?.message ?? JSON.stringify(r0.data),
  )
  let skor = Number(r0.data?.points)

  // Aynı pozisyona ikinci cevap ve sıra dışı pozisyon
  const ikinci = await ver(B, 0, d0)
  rapor('aynı pozisyona ikinci cevap reddedildi', ikinci.error?.message === 'Bu soru zaten cevaplandı', ikinci.error?.message)
  const sdc = await ver(B, 5, 'A')
  rapor('sıra dışı submit_answer reddedildi', sdc.error?.message === 'Sıra dışı soru', sdc.error?.message)

  // Yavaş (8 sn) doğru cevap ≈ 160 (±10)
  await al(B, 1)
  const d1 = await dogruSik(id, 1)
  await bekle(8000)
  const r1 = await ver(B, 1, d1)
  rapor(
    'yavaş (8 sn) doğru cevap ≈ 160 (±10)',
    !r1.error && r1.data?.correct === true && Math.abs(r1.data?.points - 160) <= 10,
    r1.error?.message ?? `${r1.data?.points}`,
  )
  skor += Number(r1.data?.points)

  // Yanlış cevap −25
  await al(B, 2)
  const d2 = await dogruSik(id, 2)
  const yanlis = ['A', 'B', 'C', 'D', 'E'].find((s) => s !== d2)!
  const r2 = await ver(B, 2, yanlis)
  rapor(
    'yanlış cevap −25',
    !r2.error && r2.data?.correct === false && r2.data?.points === -25 && r2.data?.correct_option === d2,
    r2.error?.message ?? JSON.stringify(r2.data),
  )
  skor -= 25

  // Boş cevap 0 puan
  await al(B, 3)
  const r3 = await ver(B, 3, null)
  rapor('boş cevap 0 puan', !r3.error && r3.data?.points === 0 && r3.data?.correct === false, r3.error?.message)

  // B kalan soruları (4..9) boş geçer; 10. soruyu bitiren B ilk bitirendir
  let son: { data: any } = { data: null }
  for (let pos = 4; pos <= 9; pos++) {
    const g = await al(B, pos)
    if (g.error) throw new Error(`B get_question(${pos}): ${g.error.message}`)
    son = await ver(B, pos, null)
  }
  rapor(
    'B 10. soruyu bitirdi: finished ve speedup_triggered',
    son.data?.finished === true && son.data?.speedup_triggered === true,
    JSON.stringify(son.data),
  )

  // Oyuncu ve oyun satırları
  const { data: bp } = await admin
    .from('game_players')
    .select('score, correct_count, wrong_count, current_q, finished_at, q_started_at')
    .eq('game_id', id).eq('user_id', B.id).single()
  rapor(
    'B satırı: puan/doğru/yanlış/finished_at',
    bp?.score === skor && bp?.correct_count === 2 && bp?.wrong_count === 1 && bp?.current_q === 10 &&
      !!bp?.finished_at && bp?.q_started_at === null,
    JSON.stringify(bp),
  )
  const { data: g1 } = await admin.from('games').select('speedup_at, speedup_remaining_ms, speedup_by').eq('id', id).single()
  rapor(
    'speedup_at dolu, speedup_remaining_ms > 0, speedup_by = B',
    !!g1?.speedup_at && Number(g1?.speedup_remaining_ms) > 0 && g1?.speedup_by === B.id,
    JSON.stringify(g1),
  )

  // Bitirmiş oyuncu soru isteyemez
  const bitmis = await al(B, 9)
  rapor('bitiren oyuncu yeni soru isteyemiyor', bitmis.error?.message === 'Sıra dışı soru', bitmis.error?.message)

  // A da bitirir; speedup_by B olarak kalmalı, ikinci bitiren tetiklemez
  let aSon: { data: any } = { data: null }
  for (let pos = 0; pos <= 9; pos++) {
    const g = await al(A, pos)
    if (g.error) throw new Error(`A get_question(${pos}): ${g.error.message}`)
    aSon = await ver(A, pos, null)
  }
  const { data: g2 } = await admin.from('games').select('speedup_at, speedup_remaining_ms, speedup_by').eq('id', id).single()
  rapor(
    'ikinci bitiren speedup değerlerini değiştirmedi',
    aSon.data?.finished === true && aSon.data?.speedup_triggered === false &&
      g2?.speedup_by === B.id && g2?.speedup_at === g1?.speedup_at && g2?.speedup_remaining_ms === g1?.speedup_remaining_ms,
    JSON.stringify({ aSon: aSon.data, g2 }),
  )

  // LGS oyununda ders etiketi '(LGS)'; başlamadan önce 'Oyun başlamadı'
  const lg = await A.client.rpc('create_game', { p_kategori: 'lgs_sayisal' })
  if (lg.data?.game_id) oyunlar.push(lg.data.game_id)
  if (lg.error || !lg.data?.game_id) {
    rapor("lgs_sayisal oyunu kuruldu (get_question testi)", false, lg.error?.message)
    return
  }
  const lj = await B.client.rpc('join_game', { p_code: lg.data.code })
  const ls = await A.client.rpc('start_game', { p_game_id: lg.data.game_id })
  rapor('LGS oyunu B katıldı ve A başlattı', !lj.error && !ls.error, lj.error?.message ?? ls.error?.message)
  const erken = await B.client.rpc('get_question', { p_game_id: lg.data.game_id, p_position: 0 })
  rapor('geri sayım bitmeden get_question reddedildi', erken.error?.message === 'Oyun başlamadı', erken.error?.message)
  await bekle(3500)
  const lq = await B.client.rpc('get_question', { p_game_id: lg.data.game_id, p_position: 0 })
  rapor(
    "LGS get_question ders etiketinde '(LGS)' geçiyor",
    !lq.error && /Matematik \(LGS\)|Fen Bilimleri \(LGS\)/.test(String(lq.data?.ders)),
    lq.error?.message ?? lq.data?.ders,
  )
}

async function main() {
  const A = await kullaniciOlustur('A')
  const B = await kullaniciOlustur('B')
  rapor('iki anonim kullanıcı ve profil oluşturuldu', true)

  // server_time
  const st = await A.client.rpc('server_time')
  rapor('server_time', !st.error && Math.abs(Number(st.data) - Date.now()) < 60000, st.error?.message)

  // A create_game
  const cg = await A.client.rpc('create_game', { p_kategori: 'sayisal' })
  const gameId: string | undefined = cg.data?.game_id
  const code: string | undefined = cg.data?.code
  if (gameId) oyunlar.push(gameId)
  rapor(
    "A create_game('sayisal')",
    !cg.error && /^QZ-[A-HJ-NP-Z2-9]{4}$/.test(code ?? ''),
    cg.error ? `${cg.error.message} — soru yoksa önce: npx tsx scripts/seed-test-questions.ts` : code,
  )
  if (!gameId || !code) return

  const { count } = await admin
    .from('game_questions')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
  rapor('oyuna 10 soru atandı', count === 10, `${count}`)

  // Geçersiz kategori
  const bad = await A.client.rpc('create_game', { p_kategori: 'xyz' })
  rapor('geçersiz kategori reddedildi', bad.error?.message === 'Geçersiz kategori', bad.error?.message)

  // B join (küçük harf + boşlukla; trim/upper denemesi)
  const jg = await B.client.rpc('join_game', { p_code: ` ${code.toLowerCase()} ` })
  rapor('B join_game(kod)', !jg.error && jg.data?.game_id === gameId, jg.error?.message)

  // Yeniden katılım aynı game_id'yi döndürmeli
  const jg2 = await B.client.rpc('join_game', { p_code: code })
  rapor('B tekrar join_game aynı oyunu döndürdü', !jg2.error && jg2.data?.game_id === gameId, jg2.error?.message)

  // get_game
  const gg = await A.client.rpc('get_game', { p_code: code })
  const oyuncular: unknown[] = gg.data?.players ?? []
  rapor('get_game 2 oyuncu', !gg.error && oyuncular.length === 2, gg.error?.message ?? `${oyuncular.length}`)
  rapor('get_game durumu lobby', gg.data?.game?.status === 'lobby')

  const gbi = await B.client.rpc('get_game_by_id', { p_game_id: gameId })
  rapor('B get_game_by_id', !gbi.error && gbi.data?.players?.length === 2, gbi.error?.message)

  // (d) game.sinav ve oyuncu rank alanları
  rapor("YKS oyununda game.sinav 'yks'", gg.data?.game?.sinav === 'yks', gg.data?.game?.sinav)
  const rankliOyuncular = (gg.data?.players ?? []) as Array<{ rank_key?: string; rank_label?: string }>
  rapor(
    "oyuncularda rank_key 'caylak' / rank_label 'Çaylak'",
    rankliOyuncular.length === 2 &&
      rankliOyuncular.every((p) => p.rank_key === 'caylak' && p.rank_label === 'Çaylak'),
    JSON.stringify(rankliOyuncular.map((p) => [p.rank_key, p.rank_label])),
  )

  // Üye olmayan görememeli
  const C = await kullaniciOlustur('C')
  const gc = await C.client.rpc('get_game', { p_code: code })
  rapor('üye olmayan get_game göremiyor', gc.error?.message === 'Bu oyuna erişimin yok', gc.error?.message)

  // B start_game: reddedilmeli
  const sb = await B.client.rpc('start_game', { p_game_id: gameId })
  rapor('B start_game reddedildi', sb.error?.message === 'Sadece host başlatabilir', sb.error?.message)

  // A start_game
  const sa = await A.client.rpc('start_game', { p_game_id: gameId })
  rapor('A start_game', !sa.error, sa.error?.message)

  const gp = await A.client.rpc('get_game', { p_code: code })
  rapor('durum playing', gp.data?.game?.status === 'playing' && !!gp.data?.game?.started_at, gp.data?.game?.status)

  // Başlamış oyuna yeni katılım olmamalı
  const D = await kullaniciOlustur('D')
  const jd = await D.client.rpc('join_game', { p_code: code })
  rapor('başlamış oyuna yeni oyuncu alınmadı', jd.error?.message === 'Oyun başladı', jd.error?.message)

  // ---- LGS ve XP/rank (0003_lgs_xp.sql) ----

  // Bir oyunun sorularının tablo bazında dağılımı
  const dagilim = async (id: string) => {
    const { data } = await admin.from('game_questions').select('source_table').eq('game_id', id)
    const sonuc: Record<string, number> = {}
    for (const r of data ?? []) sonuc[r.source_table] = (sonuc[r.source_table] ?? 0) + 1
    return sonuc
  }
  const ayni = (a: Record<string, number>, b: Record<string, number>) =>
    Object.keys(a).length === Object.keys(b).length && Object.keys(b).every((k) => a[k] === b[k])

  // (a) lgs_sozel: 10 soru, ders etiketlerinde '(LGS)', dağılım 4/2/2/2
  const ls = await A.client.rpc('create_game', { p_kategori: 'lgs_sozel' })
  if (ls.data?.game_id) oyunlar.push(ls.data.game_id)
  rapor(
    "create_game('lgs_sozel')",
    !ls.error && !!ls.data?.game_id,
    ls.error ? `${ls.error.message} — soru yoksa önce: npx tsx scripts/seed-test-questions.ts` : ls.data?.code,
  )
  if (ls.data?.game_id) {
    const d = await dagilim(ls.data.game_id)
    rapor('lgs_sozel 10 soru', Object.values(d).reduce((a, b) => a + b, 0) === 10, JSON.stringify(d))
    rapor(
      'lgs_sozel dağılımı 4/2/2/2',
      ayni(d, { turkce_lgs: 4, inkilap_lgs: 2, din_kulturu_lgs: 2, ingilizce_lgs: 2 }),
      JSON.stringify(d),
    )
    const etiketler = await Promise.all(
      Object.keys(d).map((t) => admin.rpc('question_label', { source_table: t })),
    )
    rapor(
      "lgs_sozel ders etiketlerinde '(LGS)' geçiyor",
      etiketler.every((e) => !e.error && String(e.data).includes('(LGS)')),
      etiketler.map((e) => e.error?.message ?? e.data).join(' | '),
    )
    const gl = await A.client.rpc('get_game', { p_code: ls.data.code })
    rapor("LGS oyununda game.sinav 'lgs'", !gl.error && gl.data?.game?.sinav === 'lgs', gl.error?.message ?? gl.data?.game?.sinav)
  }

  // (b) lgs_sayisal: 5 Matematik + 5 Fen
  const lsa = await A.client.rpc('create_game', { p_kategori: 'lgs_sayisal' })
  if (lsa.data?.game_id) oyunlar.push(lsa.data.game_id)
  rapor("create_game('lgs_sayisal')", !lsa.error && !!lsa.data?.game_id, lsa.error?.message)
  if (lsa.data?.game_id) {
    const d = await dagilim(lsa.data.game_id)
    rapor('lgs_sayisal 5 Matematik + 5 Fen', ayni(d, { matematik_lgs: 5, fen_lgs: 5 }), JSON.stringify(d))
  }

  // (c) YKS gerilemesi: sayisal hâlâ çalışıyor, dağılım değişmedi
  const ys = await A.client.rpc('create_game', { p_kategori: 'sayisal' })
  if (ys.data?.game_id) oyunlar.push(ys.data.game_id)
  rapor("YKS gerilemesi: create_game('sayisal')", !ys.error && !!ys.data?.game_id, ys.error?.message)
  if (ys.data?.game_id) {
    const d = await dagilim(ys.data.game_id)
    rapor(
      'sayisal dağılımı değişmedi',
      ayni(d, { fizik_ayt: 2, kimya_ayt: 2, biyoloji_ayt: 2, matematik_ayt: 4 }),
      JSON.stringify(d),
    )
  }

  // (e) get_my_stats: yeni kullanıcı
  const E = await kullaniciOlustur('E')
  const ms = await E.client.rpc('get_my_stats')
  const s = ms.data as
    | { xp: number; rank_key: string; rank_label: string; next_rank_label: string | null; xp_to_next: number | null; progress_pct: number; wins: number; games_played: number }
    | null
  rapor(
    "get_my_stats: yeni kullanıcı xp 0, 'Çaylak', sonraki 'Bronz I', 100 XP kaldı",
    !ms.error &&
      s?.xp === 0 &&
      s.rank_label === 'Çaylak' &&
      s.rank_key === 'caylak' &&
      s.next_rank_label === 'Bronz I' &&
      s.xp_to_next === 100 &&
      s.progress_pct === 0 &&
      s.wins === 0 &&
      s.games_played === 0,
    ms.error?.message ?? JSON.stringify(s),
  )

  // XP çubuğu hesabı: 125 XP → Bronz I (100) ile Bronz II (150) arası %50
  await admin.from('player_stats').update({ xp: 125 }).eq('user_id', E.id)
  const ms2 = await E.client.rpc('get_my_stats')
  rapor(
    "get_my_stats: 125 XP → 'Bronz I', ilerleme %50, 25 XP kaldı",
    !ms2.error && ms2.data?.rank_label === 'Bronz I' && ms2.data?.progress_pct === 50 && ms2.data?.xp_to_next === 25,
    ms2.error?.message ?? JSON.stringify(ms2.data),
  )

  // En üst rank: Efsane'de sonraki rank yok, ilerleme 100
  await admin.from('player_stats').update({ xp: 1500 }).eq('user_id', E.id)
  const ms3 = await E.client.rpc('get_my_stats')
  rapor(
    "get_my_stats: 1500 XP → 'Efsane', sonraki yok, ilerleme 100",
    !ms3.error &&
      ms3.data?.rank_label === 'Efsane' &&
      ms3.data?.next_rank_label === null &&
      ms3.data?.xp_to_next === null &&
      ms3.data?.progress_pct === 100,
    ms3.error?.message ?? JSON.stringify(ms3.data),
  )

  // Oyuncunun rank'ı get_game çıktısına da yansıyor
  const rg = await E.client.rpc('create_game', { p_kategori: 'tyt' })
  if (rg.data?.game_id) oyunlar.push(rg.data.game_id)
  const rgg = rg.data?.code ? await E.client.rpc('get_game', { p_code: rg.data.code }) : null
  rapor(
    "get_game: 1500 XP'li oyuncu 'efsane' / 'Efsane'",
    rgg?.data?.players?.[0]?.rank_key === 'efsane' && rgg?.data?.players?.[0]?.rank_label === 'Efsane',
    rg.error?.message ?? rgg?.error?.message ?? JSON.stringify(rgg?.data?.players?.[0]),
  )

  // (f) geçersiz kategori (LGS eklendikten sonra da reddedilmeli)
  const bad2 = await A.client.rpc('create_game', { p_kategori: 'lgs_xyz' })
  rapor("geçersiz kategori 'Geçersiz kategori' der", bad2.error?.message === 'Geçersiz kategori', bad2.error?.message)

  // ---- get_question / submit_answer (0004_rpc_game.sql): ilk oyun (A + B, playing) ----
  await soruCevapTesti(A, B, gameId)
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
  })
