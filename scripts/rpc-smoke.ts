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
