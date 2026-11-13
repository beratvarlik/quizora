import { createHash } from 'node:crypto'
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
  // Yasaklı alan ADLARI aranır (soru metninin içeriğine bakılmaz: gerçek sorularda "radyoaktif" gibi sözcükler geçer)
  const alanAdlari = [...Object.keys(q0.data ?? {}), ...Object.keys(q0.data?.options ?? {})]
  rapor(
    'B get_question(0): doğru şık/açıklama yok',
    !q0.error &&
      anahtarlar === 'ders,image_url,options,position,text' &&
      Object.keys(q0.data.options).sort().join('') === 'ABCDE' &&
      !alanAdlari.some((k) => /dogru|aciklama|aktif|correct|explanation|cozum/i.test(k)),
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
  // LGS soruları 4 şıklı: options içinde E anahtarı YOK; E gönderilirse 'Geçersiz şık'
  const lgsSiklar = Object.keys(lq.data?.options ?? {}).sort().join('')
  rapor('LGS get_question 4 şık: options yalnızca A-D (E anahtarı yok)', !lq.error && lgsSiklar === 'ABCD', lgsSiklar)
  const eCevap = await B.client.rpc('submit_answer', { p_game_id: lg.data.game_id, p_position: 0, p_secenek: 'E' })
  rapor("LGS 4 şıklı soruda 'E' → 'Geçersiz şık'", eCevap.error?.message === 'Geçersiz şık', eCevap.error?.message ?? 'hata yok')
  const geciciDogru = await dogruSik(lg.data.game_id, 0)
  rapor("LGS doğru şık A-D", ['A', 'B', 'C', 'D'].includes(geciciDogru), geciciDogru)
}

// ---- finish_game / get_global_leaderboard testleri (0005_rpc_finish.sql) ----

const SIKLAR = ['A', 'B', 'C', 'D', 'E']

// Oyun kur: host kurar, diğerleri katılır, host başlatır, geri sayım bitene kadar bekler
async function oyunKur(host: Kullanici, digerleri: Kullanici[], kategori = 'tyt'): Promise<string> {
  const cg = await host.client.rpc('create_game', { p_kategori: kategori })
  if (cg.error || !cg.data?.game_id) throw new Error(`create_game(${kategori}): ${cg.error?.message}`)
  oyunlar.push(cg.data.game_id)
  for (const u of digerleri) {
    const j = await u.client.rpc('join_game', { p_code: cg.data.code })
    if (j.error) throw new Error(`join_game: ${j.error.message}`)
  }
  const s = await host.client.rpc('start_game', { p_game_id: cg.data.game_id })
  if (s.error) throw new Error(`start_game: ${s.error.message}`)
  await bekle(3500)
  return cg.data.game_id as string
}

// İlk `dogruAdet` soruyu doğru, kalanını yanlış cevaplar; `adet` soru çözer. Toplam puanı döner.
async function tamOyna(u: Kullanici, id: string, dogruAdet: number, adet = 10): Promise<number> {
  let toplam = 0
  for (let pos = 0; pos < adet; pos++) {
    const g = await u.client.rpc('get_question', { p_game_id: id, p_position: pos })
    if (g.error) throw new Error(`get_question(${pos}): ${g.error.message}`)
    const d = await dogruSik(id, pos)
    const secenek = pos < dogruAdet ? d : SIKLAR.find((s) => s !== d)!
    const r = await u.client.rpc('submit_answer', { p_game_id: id, p_position: pos, p_secenek: secenek })
    if (r.error) throw new Error(`submit_answer(${pos}): ${r.error.message}`)
    toplam += Number(r.data.points)
  }
  return toplam
}

async function statAyarla(u: Kullanici, xp: number) {
  const { error } = await admin.from('player_stats').upsert({ user_id: u.id, xp, wins: 0, games_played: 0 })
  if (error) throw new Error(`player_stats ayarı: ${error.message}`)
}

async function statOku(ids: string[]) {
  const { data } = await admin.from('player_stats').select('user_id, xp, wins, games_played').in('user_id', ids)
  const harita: Record<string, { xp: number; wins: number; games_played: number }> = {}
  for (const r of data ?? []) harita[r.user_id] = r
  return harita
}

// Yarışı bitmiş say: süreyi geçmişe al (hız modu varsa onu da)
async function sureyiBitir(id: string) {
  const gecmis = new Date(Date.now() - 300_000).toISOString()
  const { data: g } = await admin.from('games').select('speedup_at').eq('id', id).single()
  await admin
    .from('games')
    .update(g?.speedup_at ? { started_at: gecmis, speedup_at: gecmis } : { started_at: gecmis })
    .eq('id', id)
}

const beklenenXp = (score: number, yer: number, ilk: boolean) =>
  20 + Math.max(0, Math.floor(score / 10)) + yer + (ilk ? 10 : 0)

async function bitirmeTesti(A: Kullanici, B: Kullanici, C: Kullanici, D: Kullanici) {
  // ===== Oyun 1: A (10 doğru), B (5 doğru + 5 yanlış), C (hiç cevap vermez) =====
  await statAyarla(A, 0)
  await statAyarla(B, 0)
  await statAyarla(C, 0)
  const g1 = await oyunKur(A, [B, C])
  const [puanA, puanB] = await Promise.all([tamOyna(A, g1, 10), tamOyna(B, g1, 5)])

  // (f) C bitirmedi ve süre dolmadı: yarış bitmedi
  const erken = await A.client.rpc('finish_game', { p_game_id: g1 })
  rapor("(f) yarış bitmeden finish_game 'Yarış henüz bitmedi' der", erken.error?.message === 'Yarış henüz bitmedi', erken.error?.message)

  // Üye olmayan finish_game çağıramaz
  const uye = await D.client.rpc('finish_game', { p_game_id: g1 })
  rapor('üye olmayan finish_game çağıramıyor', uye.error?.message === 'Bu oyuna erişimin yok', uye.error?.message)

  // Süre dolsun; A bitirir
  await sureyiBitir(g1)
  const r1 = await A.client.rpc('finish_game', { p_game_id: g1 })
  rapor('A finish_game', !r1.error, r1.error?.message)
  if (r1.error) return
  const { data: oyun1 } = await admin.from('games').select('status, winner_id, speedup_by, xp_applied').eq('id', g1).single()
  rapor('oyun finished, winner A, xp_applied true', oyun1?.status === 'finished' && oyun1?.winner_id === A.id && oyun1?.xp_applied === true, JSON.stringify(oyun1))

  const sira = r1.data.ranking as Array<Record<string, any>>
  const rA = sira.find((r) => r.user_id === A.id)!
  const rB = sira.find((r) => r.user_id === B.id)!
  const rC = sira.find((r) => r.user_id === C.id)!
  rapor('kazanan A, 3 oyuncu sıralamada, puanlar sunucudakiyle aynı',
    r1.data.winner_id === A.id && sira.length === 3 && sira[0].user_id === A.id && sira[0].rank === 1 &&
      rA.score === puanA && rB.score === puanB && rB.rank === 2 && rC.rank === 3,
    JSON.stringify(sira.map((r) => [r.rank, r.score])))

  // (a) XP formülü
  const eA = beklenenXp(puanA, 30, oyun1?.speedup_by === A.id)
  const eB = beklenenXp(puanB, 15, oyun1?.speedup_by === B.id)
  rapor('(a) kazanan xp_gained = 20 + floor(puan/10) + 30 (+10 ilk bitirense)', rA.xp_gained === eA && rA.xp_before === 0 && rA.xp_after === eA, `${rA.xp_gained} beklenen ${eA}`)
  rapor('(a) ikinci xp_gained = 20 + floor(puan/10) + 15 (+10 ilk bitirense)', rB.xp_gained === eB && rB.xp_after === eB, `${rB.xp_gained} beklenen ${eB}`)
  const st1 = await statOku([A.id, B.id, C.id])
  rapor('(a) player_stats güncellendi; kazananın wins 1, games_played 1',
    st1[A.id]?.xp === eA && st1[A.id]?.wins === 1 && st1[A.id]?.games_played === 1 &&
      st1[B.id]?.xp === eB && st1[B.id]?.wins === 0 && st1[B.id]?.games_played === 1,
    JSON.stringify(st1))

  // (d) hiç cevap vermeyen C: 0 XP ama sıralamada
  rapor('(d) hiç cevap vermeyen oyuncu 0 XP alır ama sıralamada yer alır',
    rC.xp_gained === 0 && rC.current_q === 0 && rC.finished === true && st1[C.id]?.xp === 0 && st1[C.id]?.games_played === 0 && st1[C.id]?.wins === 0,
    JSON.stringify([rC, st1[C.id]]))

  // XP dökümü ve breakdown (çağıran oyuncu için)
  rapor('xp_breakdown A: toplam = xp_gained, parçalar formüle uygun',
    r1.data.xp_breakdown.participation === 20 && r1.data.xp_breakdown.points === Math.floor(puanA / 10) &&
      r1.data.xp_breakdown.placement === 30 && r1.data.xp_breakdown.first_finisher === (oyun1?.speedup_by === A.id ? 10 : 0) &&
      r1.data.xp_breakdown.total === eA,
    JSON.stringify(r1.data.xp_breakdown))
  rapor('breakdown A: 10 doğru, 0 yanlış, 0 boş',
    r1.data.breakdown.correct === 10 && r1.data.breakdown.wrong === 0 && r1.data.breakdown.blank === 0 &&
      r1.data.breakdown.base === 1000 && r1.data.breakdown.penalty === 0 && r1.data.breakdown.base + r1.data.breakdown.bonus === puanA,
    JSON.stringify(r1.data.breakdown))

  // (b) B'nin ikinci çağrısı: aynı sonuç, player_stats ikinci kez değişmez
  const r2 = await B.client.rpc('finish_game', { p_game_id: g1 })
  const st2 = await statOku([A.id, B.id, C.id])
  rapor('(b) B finish_game aynı winner_id ve aynı sıralama/XP değerleri',
    !r2.error && r2.data?.winner_id === r1.data.winner_id && JSON.stringify(r2.data?.ranking) === JSON.stringify(r1.data.ranking),
    r2.error?.message)
  rapor('(b) player_stats ikinci çağrıda DEĞİŞMEDİ', JSON.stringify(st2) === JSON.stringify(st1), JSON.stringify(st2))
  rapor('(b) B için breakdown kendi cevaplarından: 5 doğru, 5 yanlış, ceza 125',
    r2.data?.breakdown?.correct === 5 && r2.data?.breakdown?.wrong === 5 && r2.data?.breakdown?.blank === 0 &&
      r2.data?.breakdown?.penalty === 125 && r2.data?.breakdown?.base === 500 && r2.data?.xp_breakdown?.total === eB,
    JSON.stringify([r2.data?.breakdown, r2.data?.xp_breakdown]))
  // Bitmiş oyuna bile üçüncü kez: A tekrar çağırınca yine aynı
  const r3 = await A.client.rpc('finish_game', { p_game_id: g1 })
  rapor('A tekrar finish_game: XP tekrar eklenmedi', !r3.error && JSON.stringify((await statOku([A.id, B.id, C.id]))) === JSON.stringify(st1), r3.error?.message)

  // ===== Oyun 2 (c): rank atlama. A'nın XP'si 95 (Çaylak), yeni yarışta Bronz I veya üstü =====
  await statAyarla(A, 95)
  await statAyarla(B, 0)
  const g2 = await oyunKur(A, [B])
  const [pA2] = await Promise.all([tamOyna(A, g2, 10), tamOyna(B, g2, 3)])
  const f2 = await A.client.rpc('finish_game', { p_game_id: g2 })
  rapor('(c) rank atlama oyunu bitti', !f2.error, f2.error?.message)
  if (!f2.error) {
    const a2 = (f2.data.ranking as Array<Record<string, any>>).find((r) => r.user_id === A.id)!
    const { data: tiers } = await admin.from('rank_tiers').select('min_xp, rank_label').order('min_xp', { ascending: false })
    const beklenenRank = tiers?.find((t) => t.min_xp <= a2.xp_after)?.rank_label
    rapor(
      "(c) rank_label_before 'Çaylak', rank_label_after hak edilen rank, ranked_up true",
      a2.xp_before === 95 && a2.rank_label_before === 'Çaylak' && a2.rank_label_after === beklenenRank &&
        a2.rank_label_after !== 'Çaylak' && a2.ranked_up === true && a2.rank_label === beklenenRank,
      `${a2.xp_before}→${a2.xp_after} ${a2.rank_label_before}→${a2.rank_label_after} (beklenen ${beklenenRank}, puan ${pA2})`,
    )
    const b2 = (f2.data.ranking as Array<Record<string, any>>).find((r) => r.user_id === B.id)!
    rapor('(c) rank atlamayan oyuncuda ranked_up false', b2.ranked_up === false, `${b2.rank_label_before}→${b2.rank_label_after}`)
  }

  // ===== Oyun 3 (e): tek oyunculu oyun XP VERMEZ =====
  const { data: eski } = await admin.from('app_settings').select('value').eq('key', 'min_players').single()
  try {
    await admin.from('app_settings').update({ value: '1' }).eq('key', 'min_players')
    await statAyarla(D, 40)
    const g3 = await oyunKur(D, [])
    await tamOyna(D, g3, 2, 2) // 2 soru çözer (cevap vermiş sayılır)
    await sureyiBitir(g3)
    const f3 = await D.client.rpc('finish_game', { p_game_id: g3 })
    rapor('(e) tek oyunculu oyun bitti', !f3.error, f3.error?.message)
    if (!f3.error) {
      const d3 = f3.data.ranking[0]
      const st3 = await statOku([D.id])
      const { data: o3 } = await admin.from('games').select('xp_applied, status').eq('id', g3).single()
      rapor(
        '(e) tek oyunculu oyun XP VERMEZ (xp 40 kaldı, games_played 0), xp_applied true',
        d3.xp_gained === 0 && d3.xp_before === 40 && d3.xp_after === 40 && st3[D.id]?.xp === 40 &&
          st3[D.id]?.games_played === 0 && st3[D.id]?.wins === 0 && o3?.xp_applied === true && o3?.status === 'finished' &&
          f3.data.xp_breakdown.total === 0,
        JSON.stringify([d3, st3[D.id], o3]),
      )
    }
  } finally {
    // min_players'ı testten önceki değerine (varsayılan 2) geri al
    await admin.from('app_settings').update({ value: eski?.value ?? '2' }).eq('key', 'min_players')
  }
  const { data: son } = await admin.from('app_settings').select('value').eq('key', 'min_players').single()
  rapor("min_players eski değerine döndü", son?.value === (eski?.value ?? '2'), son?.value)

  // ===== (g) get_global_leaderboard =====
  await statAyarla(A, 999_999)
  await statAyarla(B, 500_000)
  const lb = await A.client.rpc('get_global_leaderboard')
  const satirlar = (lb.data ?? []) as Array<Record<string, any>>
  const sirali = satirlar.every((r, i) => i === 0 || satirlar[i - 1].xp > r.xp || (satirlar[i - 1].xp === r.xp && satirlar[i - 1].wins >= r.wins))
  rapor(
    '(g) get_global_leaderboard XP sırasına göre, rank etiketi içeriyor, en fazla 20 satır',
    !lb.error && satirlar.length >= 2 && satirlar.length <= 20 && sirali &&
      satirlar[0].user_id === A.id && satirlar[0].xp === 999_999 && satirlar[0].rank_label === 'Efsane' &&
      satirlar[1].user_id === B.id && satirlar[1].rank_key === 'efsane' && satirlar.every((r) => !!r.rank_label && !!r.display_name),
    lb.error?.message ?? JSON.stringify(satirlar.slice(0, 2)),
  )
}

// ---- get_game_review testleri (0008_cozum_aciklamasi.sql) ----

type Alan = Record<string, any>
const SIZINTI_ADI = /^(explanation|cozum_aciklamasi|correct_option|dogru_sik|aciklama)$/i // correct_count gibi meşru alanlar etkilenmez

// Bir JSON ağacındaki tüm alan ADLARINI toplar (metin içeriğine bakılmaz)
function tumAnahtarlar(v: unknown, cikti: string[] = []): string[] {
  if (Array.isArray(v)) {
    for (const x of v) tumAnahtarlar(x, cikti)
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      cikti.push(k)
      tumAnahtarlar(x, cikti)
    }
  }
  return cikti
}

// Plana göre oynar: plan[pos] = 'D' (doğru), 'Y' (yanlış), 'B' (boş). Toplam puanı döner.
// Oyun boyunca get_question / submit_answer yanıtlarında açıklama alan adı olmadığını da toplar.
async function planlaOyna(u: Kullanici, id: string, plan: string, sizinti: string[]): Promise<number> {
  let toplam = 0
  for (let pos = 0; pos < plan.length; pos++) {
    const g = await u.client.rpc('get_question', { p_game_id: id, p_position: pos })
    if (g.error) throw new Error(`get_question(${pos}): ${g.error.message}`)
    sizinti.push(...tumAnahtarlar(g.data).filter((k) => SIZINTI_ADI.test(k)))
    const d = await dogruSik(id, pos)
    const secenek = plan[pos] === 'D' ? d : plan[pos] === 'B' ? null : SIKLAR.find((x) => x !== d)!
    const r = await u.client.rpc('submit_answer', { p_game_id: id, p_position: pos, p_secenek: secenek })
    if (r.error) throw new Error(`submit_answer(${pos}): ${r.error.message}`)
    // submit_answer correct_option'ı cevap sonrası zaten döndürür; yalnızca açıklama alanı olmamalı
    sizinti.push(...tumAnahtarlar(r.data).filter((k) => /explanation|cozum/i.test(k)))
    toplam += Number(r.data.points)
  }
  return toplam
}

async function incelemeTesti(A: Kullanici, B: Kullanici, D: Kullanici) {
  const sizinti: string[] = []
  const ger = (u: Kullanici, id: string) => u.client.rpc('get_game_review', { p_game_id: id })

  // ===== Oyun: tyt, A + B =====
  const g = await oyunKur(A, [B])
  const erken = await ger(A, g)
  rapor("(a) oyun bitmeden get_game_review 'Yarış henüz bitmedi' der", erken.error?.message === 'Yarış henüz bitmedi', erken.error?.message)
  const yabanci = await ger(D, g)
  rapor('(b) üye olmayan get_game_review çağıramıyor', yabanci.error?.message === 'Bu oyuna erişimin yok', yabanci.error?.message)

  // A: 0 doğru, 1 yanlış, 2 boş, 3-9 doğru. B: 0 yanlış, 1-9 doğru.
  const planA = 'DYBDDDDDDD'
  const planB = 'YDDDDDDDDD'
  const [puanA, puanB] = await Promise.all([planlaOyna(A, g, planA, sizinti), planlaOyna(B, g, planB, sizinti)])

  // get_game / get_game_by_id yanıtlarında açıklama / doğru şık alan adı yok
  const { data: gRow } = await admin.from('games').select('code').eq('id', g).single()
  const gg = await A.client.rpc('get_game', { p_code: gRow?.code })
  const ggid = await A.client.rpc('get_game_by_id', { p_game_id: g })
  sizinti.push(...tumAnahtarlar(gg.data).filter((k) => SIZINTI_ADI.test(k)))
  sizinti.push(...tumAnahtarlar(ggid.data).filter((k) => SIZINTI_ADI.test(k)))
  rapor(
    'sızıntı: get_question, submit_answer, get_game, get_game_by_id yanıtlarında açıklama/doğru şık alan adı yok',
    !gg.error && !ggid.error && sizinti.length === 0,
    gg.error?.message ?? ggid.error?.message ?? [...new Set(sizinti)].join(','),
  )

  await sureyiBitir(g)
  const fa = await A.client.rpc('finish_game', { p_game_id: g })
  const fb = await B.client.rpc('finish_game', { p_game_id: g })
  rapor('inceleme oyunu finish_game', !fa.error && !fb.error, fa.error?.message ?? fb.error?.message)
  if (fa.error || fb.error) return

  // Açıklama: 4. pozisyonun sorusuna özel metin yaz (diğerleri veritabanındakiyle aynı olmalı)
  const { data: gqs } = await admin.from('game_questions').select('position, source_table, question_id').eq('game_id', g).order('position')
  const sorular = gqs ?? []
  const veriAciklama: Record<number, string | null> = {}
  for (const q of sorular) {
    const { data: r } = await admin.from(q.source_table).select('cozum_aciklamasi').eq('id', q.question_id).single()
    veriAciklama[q.position] = (r?.cozum_aciklamasi as string | null) ?? null
  }
  const q4 = sorular.find((q) => q.position === 4)!
  const ORNEK = '[TEST] İnceleme açıklaması: 2 + 2 = 4.'
  const eskiAciklama = veriAciklama[4]
  await admin.from(q4.source_table).update({ cozum_aciklamasi: ORNEK }).eq('id', q4.question_id)
  veriAciklama[4] = ORNEK

  try {
    const ra = await ger(A, g)
    const rb = await ger(B, g)
    const itA = (ra.data?.items ?? []) as Alan[]
    const itB = (rb.data?.items ?? []) as Alan[]
    rapor('(c) A için 10 öğe, position 0..9 sırasıyla', !ra.error && itA.length === 10 && itA.every((x, i) => x.position === i), ra.error?.message)

    const say = (it: Alan[], o: string) => it.filter((x) => x.outcome === o).length
    rapor(
      '(c) A outcome sayıları finish_game breakdown ile aynı (8 doğru, 1 yanlış, 1 boş)',
      say(itA, 'correct') === fa.data.breakdown.correct && say(itA, 'wrong') === fa.data.breakdown.wrong && say(itA, 'blank') === fa.data.breakdown.blank &&
        fa.data.breakdown.correct === 8 && fa.data.breakdown.wrong === 1 && fa.data.breakdown.blank === 1,
      `${say(itA, 'correct')}/${say(itA, 'wrong')}/${say(itA, 'blank')} — ${JSON.stringify(fa.data.breakdown)}`,
    )
    rapor(
      '(c) B outcome sayıları finish_game breakdown ile aynı (9 doğru, 1 yanlış)',
      say(itB, 'correct') === fb.data.breakdown.correct && say(itB, 'wrong') === fb.data.breakdown.wrong && say(itB, 'blank') === fb.data.breakdown.blank &&
        fb.data.breakdown.correct === 9 && fb.data.breakdown.wrong === 1,
      JSON.stringify(fb.data.breakdown),
    )

    const sira = fa.data.ranking as Alan[]
    const skorA = sira.find((r) => r.user_id === A.id)!.score
    const skorB = sira.find((r) => r.user_id === B.id)!.score
    const topA = itA.reduce((t, x) => t + x.points, 0)
    const topB = itB.reduce((t, x) => t + x.points, 0)
    rapor('(c) points toplamı oyuncunun skoruna eşit', topA === skorA && skorA === puanA && topB === skorB && skorB === puanB, `A ${topA}/${skorA} B ${topB}/${skorB}`)

    // selected / correct_option / outcome: gerçek doğru şıkla karşılaştır
    let tutarli = true
    let ayrinti = ''
    for (let i = 0; i < 10; i++) {
      const d = await dogruSik(g, i)
      const x = itA[i]
      const sonuc = planA[i] === 'D' ? 'correct' : planA[i] === 'B' ? 'blank' : 'wrong'
      const secimTamam = planA[i] === 'D' ? x?.selected === d : planA[i] === 'B' ? x?.selected === null : !!x?.selected && x.selected !== d
      if (!x || x.correct_option !== d || x.outcome !== sonuc || !secimTamam) {
        tutarli = false
        ayrinti = `pos ${i}: ${JSON.stringify(x)} (doğru ${d})`
        break
      }
    }
    rapor('(c) selected / correct_option / outcome doğru (A: doğru, yanlış, boş)', tutarli, ayrinti)

    rapor(
      '(c) time_ms cevaplananlarda dolu (tam sayı), boş soruda points 0',
      itA.every((x) => (x.outcome === 'blank' ? x.points === 0 : Number.isInteger(x.time_ms) && x.time_ms >= 0)),
      JSON.stringify(itA.map((x) => x.time_ms)),
    )
    rapor(
      'öğe alanları: ders, text, image_url, options (YKS: A-E)',
      itA.every((x) => typeof x.ders === 'string' && x.ders.length > 0 && typeof x.text === 'string' && 'image_url' in x && Object.keys(x.options).sort().join('') === 'ABCDE'),
      JSON.stringify(Object.keys(itA[0] ?? {})),
    )

    // (d) açıklama
    rapor(
      '(d) cozum_aciklamasi dolu soruda explanation dolu, diğerleri veritabanındakiyle aynı',
      itA[4]?.explanation === ORNEK && itA.every((x) => x.explanation === veriAciklama[x.position]),
      JSON.stringify(itA.map((x) => x.explanation)),
    )

    // (f) oyuncular birbirinin cevabını görmez
    rapor(
      '(f) A ve B yalnızca kendi selected değerlerini görür',
      itA[0].outcome === 'correct' && itB[0].outcome === 'wrong' && itA[1].outcome === 'wrong' && itB[1].outcome === 'correct' &&
        itA[2].selected === null && itB[2].selected !== null && itA[0].selected !== itB[0].selected,
      JSON.stringify([itA.slice(0, 3).map((x) => x.selected), itB.slice(0, 3).map((x) => x.selected)]),
    )

    const { data: ogr } = await admin.from('games').select('status').eq('id', g).single()
    rapor('get_game_review oyunu değiştirmedi (finished kaldı)', ogr?.status === 'finished')
  } finally {
    await admin.from(q4.source_table).update({ cozum_aciklamasi: eskiAciklama }).eq('id', q4.question_id)
  }

  // ===== (e) lgs_sayisal: options yalnızca A-D; B hiç cevap vermedi → tüm öğeler boş =====
  const lg = await oyunKur(A, [B], 'lgs_sayisal')
  await planlaOyna(A, lg, 'DYDYDYDYDY', [])
  await sureyiBitir(lg)
  const fl = await A.client.rpc('finish_game', { p_game_id: lg })
  if (fl.error) {
    rapor('(e) lgs_sayisal oyunu bitirildi', false, fl.error.message)
    return
  }
  const rl = await ger(A, lg)
  const itL = (rl.data?.items ?? []) as Alan[]
  rapor(
    '(e) lgs_sayisal incelemesi: 10 öğe, options yalnızca A-D',
    !rl.error && itL.length === 10 && itL.every((x) => Object.keys(x.options).sort().join('') === 'ABCD' && /LGS/.test(x.ders)),
    rl.error?.message ?? JSON.stringify(itL[0]?.options),
  )
  const rlb = await ger(B, lg)
  const itLB = (rlb.data?.items ?? []) as Alan[]
  rapor(
    'hiç cevap vermeyen oyuncu: 10 öğe, hepsi blank, selected null, points 0, time_ms null',
    !rlb.error && itLB.length === 10 && itLB.every((x) => x.outcome === 'blank' && x.selected === null && x.points === 0 && x.time_ms === null),
    rlb.error?.message ?? JSON.stringify(itLB[0]),
  )

  // ===== Silinen soru: o pozisyon atlanır, hata yok; test sonunda satır geri konur =====
  const { data: gq3 } = await admin.from('game_questions').select('source_table, question_id').eq('game_id', lg).eq('position', 3).single()
  if (gq3) {
    const { data: satir } = await admin.from(gq3.source_table).select('*').eq('id', gq3.question_id).single()
    if (satir) {
      try {
        await admin.from(gq3.source_table).delete().eq('id', gq3.question_id)
        const rs = await ger(A, lg)
        const itS = (rs.data?.items ?? []) as Alan[]
        rapor('silinmiş soru: hata yok, o pozisyon atlandı (9 öğe, 3. pozisyon yok)', !rs.error && itS.length === 9 && !itS.some((x) => x.position === 3), rs.error?.message ?? `${itS.length} öğe`)
      } finally {
        const { error: geriE } = await admin.from(gq3.source_table).insert(satir)
        rapor('silinen soru geri yüklendi', !geriE, geriE?.message)
      }
    }
  }
}

// ---- Hemen Katıl: quick_join / start_if_ready / leave_game (0009_hemen_katil.sql) ----

const HIZLI_KATEGORILER = ['sayisal', 'esit_agirlik', 'sozel', 'tyt', 'lgs_sozel', 'lgs_sayisal']

async function qj(u: Kullanici, kategori: string) {
  const r = await u.client.rpc('quick_join', { p_kategori: kategori })
  if (r.data?.game_id) oyunlar.push(r.data.game_id)
  return r
}

async function oyunSatiri(id: string) {
  const { data } = await admin.from('games').select('*').eq('id', id).maybeSingle()
  return data as Record<string, any> | null
}

async function oyuncuSayisi(id: string): Promise<number> {
  const { count } = await admin.from('game_players').select('*', { count: 'exact', head: true }).eq('game_id', id)
  return count ?? 0
}

// Senaryolar arasında temizlik: verilen oyunları sil
async function oyunlariSil(idler: string[]) {
  const liste = [...new Set(idler.filter(Boolean))]
  if (liste.length > 0) await admin.from('games').delete().in('id', liste)
}

async function hemenKatilTesti(A: Kullanici, B: Kullanici, C: Kullanici, D: Kullanici, E: Kullanici) {
  // Önceki denemelerden kalan herkese açık lobiler eşleşmeyi bozmasın: bayatlat
  await admin
    .from('games')
    .update({ last_activity_at: new Date(Date.now() - 3_600_000).toISOString() })
    .eq('status', 'lobby')
    .eq('is_public', true)
    .in('kategori', HIZLI_KATEGORILER)
  const X: Kullanici[] = []
  for (let i = 1; i <= 7; i++) X.push(await kullaniciOlustur(`X${i}`))
  const gecici: string[] = []

  // ===== 1. Temel eşleşme (tyt): A açar, B katılır, A tekrar çağırınca aynı lobi =====
  const q1 = await qj(A, 'tyt')
  rapor('quick_join: ilk oyuncu yeni herkese açık lobi açar (created=true)', !q1.error && q1.data?.created === true && !!q1.data?.game_id && /^QZ-/.test(q1.data?.code), q1.error?.message)
  const g1 = q1.data?.game_id as string
  gecici.push(g1)
  const satir1 = await oyunSatiri(g1)
  rapor('açılan lobi is_public=true, auto_start_at null, status lobby', satir1?.is_public === true && satir1?.auto_start_at === null && satir1?.status === 'lobby', JSON.stringify(satir1))

  const q2 = await qj(B, 'tyt')
  rapor('quick_join: ikinci oyuncu aynı lobiye girer (created=false)', !q2.error && q2.data?.game_id === g1 && q2.data?.created === false && q2.data?.code === q1.data?.code, q2.error?.message ?? JSON.stringify(q2.data))
  const satir2 = await oyunSatiri(g1)
  const kalan = satir2?.auto_start_at ? new Date(satir2.auto_start_at).getTime() - Date.now() : -1
  rapor('2. oyuncudan sonra auto_start_at ≈ şimdi + 10 sn', kalan > 7000 && kalan <= 10500, `${kalan} ms`)

  const q3 = await qj(A, 'tyt')
  rapor('aynı kullanıcı arka arkaya quick_join: aynı lobi, yeni oyuncu eklenmez', !q3.error && q3.data?.game_id === g1 && q3.data?.created === false && (await oyuncuSayisi(g1)) === 2, q3.error?.message)

  const gg = await A.client.rpc('get_game', { p_code: q1.data?.code })
  rapor('get_game: game.is_public ve game.auto_start_at geliyor', !gg.error && gg.data?.game?.is_public === true && typeof gg.data?.game?.auto_start_at === 'string', gg.error?.message ?? JSON.stringify(gg.data?.game))
  const ggid = await B.client.rpc('get_game_by_id', { p_game_id: g1 })
  rapor('get_game_by_id: game.is_public ve game.auto_start_at geliyor', !ggid.error && ggid.data?.game?.is_public === true && 'auto_start_at' in (ggid.data?.game ?? {}), ggid.error?.message)

  // ===== 2. start_if_ready =====
  const erken = await B.client.rpc('start_if_ready', { p_game_id: g1 })
  const sErken = await oyunSatiri(g1)
  rapor('start_if_ready erken: hata yok, oyun lobby kalır', !erken.error && sErken?.status === 'lobby', erken.error?.message ?? sErken?.status)
  const yabanci = await E.client.rpc('start_if_ready', { p_game_id: g1 })
  rapor("üye olmayan start_if_ready çağıramıyor", yabanci.error?.message === 'Bu oyuna erişimin yok', yabanci.error?.message)

  // Başlamak üzere: kodla katılım 'Oyun başlamak üzere'
  await admin.from('games').update({ auto_start_at: new Date(Date.now() - 1000).toISOString() }).eq('id', g1)
  const gec = await C.client.rpc('join_game', { p_code: q1.data?.code })
  rapor("auto_start_at geçmişse kodla katılım 'Oyun başlamak üzere' der", gec.error?.message === 'Oyun başlamak üzere', gec.error?.message)
  const gecQj = await qj(C, 'tyt')
  rapor('auto_start_at geçmiş lobiye quick_join eşleşmez (yeni lobi)', !gecQj.error && gecQj.data?.created === true && gecQj.data?.game_id !== g1, gecQj.error?.message)
  if (gecQj.data?.game_id) gecici.push(gecQj.data.game_id)

  const [b1, a1] = await Promise.all([
    B.client.rpc('start_if_ready', { p_game_id: g1 }),
    A.client.rpc('start_if_ready', { p_game_id: g1 }),
  ])
  const sBas = await oyunSatiri(g1)
  const baslaFark = sBas?.started_at ? new Date(sBas.started_at).getTime() - Date.now() : -99999
  rapor('süre dolunca start_if_ready: playing, started_at ≈ şimdi + 3 sn (iki eşzamanlı çağrı)', !b1.error && !a1.error && sBas?.status === 'playing' && baslaFark > 1000 && baslaFark <= 3500, `${sBas?.status} ${baslaFark} ms ${b1.error?.message ?? a1.error?.message ?? ''}`)
  const startedOnce = sBas?.started_at
  const yine = await A.client.rpc('start_if_ready', { p_game_id: g1 })
  const sYine = await oyunSatiri(g1)
  rapor('ikinci start_if_ready durumu bozmaz', !yine.error && sYine?.status === 'playing' && sYine?.started_at === startedOnce, yine.error?.message)
  const gpler = await admin.from('game_players').select('current_q, q_started_at').eq('game_id', g1)
  rapor('başlayan oyunda oyuncular current_q=0, q_started_at null', (gpler.data ?? []).length === 2 && (gpler.data ?? []).every((r) => r.current_q === 0 && r.q_started_at === null))
  await oyunlariSil(gecici.splice(0))

  // ===== 3. Eşleşmemesi gerekenler =====
  // Farklı kategori
  const k1 = await qj(X[0], 'lgs_sozel')
  const k2 = await qj(X[1], 'lgs_sayisal')
  gecici.push(k1.data?.game_id, k2.data?.game_id)
  rapor('farklı kategoriler eşleşmez', !k1.error && !k2.error && k1.data?.game_id !== k2.data?.game_id && k1.data?.created === true && k2.data?.created === true, k1.error?.message ?? k2.error?.message)
  await oyunlariSil(gecici.splice(0))

  // Özel lobi (create_game) quick_join'e hiç verilmez
  const ozel = await C.client.rpc('create_game', { p_kategori: 'sozel' })
  if (ozel.data?.game_id) {
    oyunlar.push(ozel.data.game_id)
    gecici.push(ozel.data.game_id)
  }
  const ozelSatir = await oyunSatiri(ozel.data?.game_id)
  rapor('create_game ile kurulan lobi özel (is_public=false)', ozelSatir?.is_public === false, JSON.stringify(ozelSatir?.is_public))
  const od = await qj(D, 'sozel')
  if (od.data?.game_id) gecici.push(od.data.game_id)
  rapor('quick_join özel lobiye eşleşmez (yeni herkese açık lobi açılır)', !od.error && od.data?.created === true && od.data?.game_id !== ozel.data?.game_id, od.error?.message)
  await oyunlariSil(gecici.splice(0))

  // 5 kişilik lobi eşleşmez
  const bes: string[] = []
  for (let i = 0; i < 5; i++) {
    const r = await qj(X[i], 'esit_agirlik')
    bes.push(r.data?.game_id)
    if (r.error) rapor(`5 kişilik lobi: X${i + 1} quick_join`, false, r.error.message)
  }
  gecici.push(...bes)
  const dolu = await oyunSatiri(bes[0])
  rapor('5 kişi aynı lobide, 5.da auto_start_at ≈ şimdi', new Set(bes).size === 1 && (await oyuncuSayisi(bes[0])) === 5 && !!dolu?.auto_start_at && new Date(dolu.auto_start_at).getTime() - Date.now() <= 1500, JSON.stringify(bes))
  const altinci = await qj(X[5], 'esit_agirlik')
  if (altinci.data?.game_id) gecici.push(altinci.data.game_id)
  rapor('dolu (5 kişilik) lobiye quick_join eşleşmez (yeni lobi)', !altinci.error && altinci.data?.created === true && altinci.data?.game_id !== bes[0], altinci.error?.message)
  await oyunlariSil(gecici.splice(0))

  // Bayat lobi (last_activity_at 3 dk geride)
  const bay = await qj(X[0], 'sayisal')
  gecici.push(bay.data?.game_id)
  await admin.from('games').update({ last_activity_at: new Date(Date.now() - 180_000).toISOString() }).eq('id', bay.data?.game_id)
  const bay2 = await qj(X[1], 'sayisal')
  if (bay2.data?.game_id) gecici.push(bay2.data.game_id)
  rapor('bayat lobi (3 dk önceki last_activity_at) eşleşmez', !bay2.error && bay2.data?.created === true && bay2.data?.game_id !== bay.data?.game_id, bay2.error?.message)
  await oyunlariSil(gecici.splice(0))

  // auto_start_at 4 sn içinde dolacak lobi eşleşmez
  const yak = await qj(X[0], 'lgs_sayisal')
  await qj(X[1], 'lgs_sayisal')
  gecici.push(yak.data?.game_id)
  await admin.from('games').update({ auto_start_at: new Date(Date.now() + 3000).toISOString() }).eq('id', yak.data?.game_id)
  const yak3 = await qj(X[2], 'lgs_sayisal')
  if (yak3.data?.game_id) gecici.push(yak3.data.game_id)
  rapor('4 sn içinde başlayacak lobiye quick_join eşleşmez', !yak3.error && yak3.data?.created === true && yak3.data?.game_id !== yak.data?.game_id, yak3.error?.message)
  await oyunlariSil(gecici.splice(0))

  // ===== 4. leave_game =====
  const l1 = await qj(X[0], 'tyt')
  const lg = l1.data?.game_id as string
  gecici.push(lg)
  await qj(X[1], 'tyt')
  await bekle(50)
  await qj(X[2], 'tyt')
  const yabLeave = await E.client.rpc('leave_game', { p_game_id: lg })
  rapor('üye olmayan leave_game çağıramıyor', yabLeave.error?.message === 'Bu oyuna erişimin yok', yabLeave.error?.message)
  const hostCik = await X[0].client.rpc('leave_game', { p_game_id: lg })
  const sH = await oyunSatiri(lg)
  rapor('host çıkınca host en eski oyuncuya (X2) devredilir; 2 kişi kalır, auto_start_at korunur', !hostCik.error && sH?.host_id === X[1].id && (await oyuncuSayisi(lg)) === 2 && sH?.auto_start_at !== null, hostCik.error?.message ?? JSON.stringify([sH?.host_id, sH?.auto_start_at]))
  const ikinciCik = await X[1].client.rpc('leave_game', { p_game_id: lg })
  const sI = await oyunSatiri(lg)
  rapor('sayı 2\'nin altına düşünce auto_start_at null olur; host X3', !ikinciCik.error && sI?.auto_start_at === null && sI?.host_id === X[2].id && (await oyuncuSayisi(lg)) === 1, ikinciCik.error?.message ?? JSON.stringify([sI?.auto_start_at, sI?.host_id]))
  const sonCik = await X[2].client.rpc('leave_game', { p_game_id: lg })
  rapor('son oyuncu çıkınca oyun silinir', !sonCik.error && (await oyunSatiri(lg)) === null, sonCik.error?.message)
  const silinmis = await X[2].client.rpc('leave_game', { p_game_id: lg })
  rapor('silinmiş oyunda leave_game hata verir', !!silinmis.error, silinmis.error?.message)

  // Başlamış oyunda 'Oyun başladı'
  const b0 = await qj(X[0], 'tyt')
  gecici.push(b0.data?.game_id)
  await qj(X[1], 'tyt')
  await admin.from('games').update({ auto_start_at: new Date(Date.now() - 1000).toISOString() }).eq('id', b0.data?.game_id)
  await X[0].client.rpc('start_if_ready', { p_game_id: b0.data?.game_id })
  const basladi = await X[1].client.rpc('leave_game', { p_game_id: b0.data?.game_id })
  rapor("başlamış oyunda leave_game 'Oyun başladı' der", basladi.error?.message === 'Oyun başladı', basladi.error?.message)
  await oyunlariSil(gecici.splice(0))

  // ===== 5. Eşzamanlılık =====
  const t4 = Date.now()
  const es4 = await Promise.all(X.slice(0, 4).map((u) => qj(u, 'sozel')))
  const ids4 = es4.map((r) => r.data?.game_id as string)
  gecici.push(...ids4)
  const hata4 = es4.find((r) => r.error)
  const olusan4 = es4.filter((r) => r.data?.created === true).length
  rapor('eşzamanlılık: 4 kullanıcı AYNI anda quick_join: tek lobi, 1 created, hata/kilitlenme yok',
    !hata4 && new Set(ids4).size === 1 && olusan4 === 1 && (await oyuncuSayisi(ids4[0])) === 4,
    hata4?.error?.message ?? `${new Set(ids4).size} lobi, created=${olusan4}, ${Date.now() - t4} ms`)
  await oyunlariSil(gecici.splice(0))

  const t7 = Date.now()
  const es7 = await Promise.all(X.map((u) => qj(u, 'tyt')))
  const ids7 = es7.map((r) => r.data?.game_id as string)
  gecici.push(...ids7)
  const hata7 = es7.find((r) => r.error)
  const benzersiz7 = [...new Set(ids7)]
  const sayilar7: number[] = []
  for (const id of benzersiz7) sayilar7.push(await oyuncuSayisi(id))
  rapor('eşzamanlılık: 7 kullanıcı: iki lobi, hiçbirinde 5\'ten fazla oyuncu yok, hata yok',
    !hata7 && benzersiz7.length === 2 && sayilar7.every((n) => n <= 5) && sayilar7.reduce((a, b) => a + b, 0) === 7,
    hata7?.error?.message ?? `${benzersiz7.length} lobi, oyuncular ${sayilar7.join('+')}, ${Date.now() - t7} ms`)
  await oyunlariSil(gecici.splice(0))

  // ===== 6. Doğrudan değiştirme ve geçersiz girdiler =====
  const kk = await qj(X[0], 'tyt')
  gecici.push(kk.data?.game_id)
  const dogrudan = await X[0].client.from('games').update({ is_public: false, auto_start_at: null }).eq('id', kk.data?.game_id).select()
  const sD = await oyunSatiri(kk.data?.game_id)
  rapor('istemci games.is_public / auto_start_at alanını doğrudan değiştiremez', sD?.is_public === true && ((dogrudan.data ?? []).length === 0 || !!dogrudan.error), JSON.stringify([dogrudan.error?.message, sD?.is_public]))
  const gk = await X[0].client.rpc('quick_join', { p_kategori: 'lgs_xyz' })
  rapor("quick_join geçersiz kategori 'Geçersiz kategori' der", gk.error?.message === 'Geçersiz kategori', gk.error?.message)
  const ic = await X[0].client.rpc('_create_game_internal', { p_kategori: 'tyt', p_host: X[0].id, p_public: true })
  rapor('_create_game_internal istemciye kapalı', !!ic.error, ic.error?.message)
  await oyunlariSil(gecici.splice(0))
}

// ---- Yanlışlarım defteri (0010_yanlislarim_defteri.sql) ----

const DEFTER_SIZINTI = /^(explanation|cozum_aciklamasi|correct_option|dogru_sik|aciklama)$/i

async function gqOku(oyun: string): Promise<Alan[]> {
  const { data, error } = await admin.from('game_questions').select('position, source_table, question_id').eq('game_id', oyun).order('position')
  if (error) throw new Error(`game_questions: ${error.message}`)
  return (data ?? []) as Alan[]
}

// Oyunun `pos` sorusunu verilen soruyla değiştirir (soru başka pozisyondaysa onunla yer değiştirir; oyunda tekrar olmaz)
async function soruZorla(oyun: string, pos: number, tbl: string, qid: string) {
  const satirlar = await gqOku(oyun)
  const hedef = satirlar.find((x) => x.position === pos)!
  const var_ = satirlar.find((x) => x.question_id === qid)
  if (var_ && var_.position !== pos) {
    await admin.from('game_questions').update({ source_table: hedef.source_table, question_id: hedef.question_id }).eq('game_id', oyun).eq('position', var_.position)
  }
  await admin.from('game_questions').update({ source_table: tbl, question_id: qid }).eq('game_id', oyun).eq('position', pos)
}

async function defterTesti(A: Kullanici, B: Kullanici, D: Kullanici) {
  await admin.from('mistake_book').delete().in('user_id', [A.id, B.id, D.id])

  const defter = async (u: Kullanici): Promise<Alan[]> => {
    const { data, error } = await admin.from('mistake_book').select('*').eq('user_id', u.id)
    if (error) throw new Error(`mistake_book: ${error.message}`)
    return (data ?? []) as Alan[]
  }
  const ozet = (u: Kullanici) => u.client.rpc('get_mistake_summary')
  const liste = (u: Kullanici, a: { exam?: string | null; subject?: string | null; limit?: number } = {}) =>
    u.client.rpc('get_mistakes', { p_exam: a.exam ?? null, p_subject: a.subject ?? null, p_limit: a.limit ?? 50 })
  const ger = (u: Kullanici, id: string) => u.client.rpc('get_game_review', { p_game_id: id })
  const bitir = async (oyun: string, kimler: Kullanici[]) => {
    await sureyiBitir(oyun)
    const s = await Promise.all(kimler.flatMap((u) => [u, u]).map((u) => u.client.rpc('finish_game', { p_game_id: oyun })))
    const hata = s.find((r) => r.error)
    if (hata) throw new Error(`finish_game: ${hata.error?.message}`)
  }
  const sizinti: string[] = []

  // ===== Oyun 3 (önce, defterler boşken): yalnızca GÖRÜLEN sorular deftere girer =====
  // A hepsini doğru yapar. D iki soruyu yanlış yapar, 3.yü görür ama cevaplamaz; 4-10. hiç görülmez.
  const g3 = await oyunKur(A, [D])
  await Promise.all([
    planlaOyna(A, g3, 'DDDDDDDDDD', sizinti),
    (async () => {
      await planlaOyna(D, g3, 'YY', sizinti)
      const gq = await D.client.rpc('get_question', { p_game_id: g3, p_position: 2 })
      if (gq.error) throw new Error(`get_question(2): ${gq.error.message}`)
    })(),
  ])
  await bitir(g3, [A, D])
  const gq3 = await gqOku(g3)
  const d3 = (await defter(D)).filter((r) => r.last_game_id === g3)
  const d3Pos = d3.map((r) => gq3.find((x) => x.question_id === r.question_id)?.position).sort()
  const bos3 = d3.find((r) => r.question_id === gq3[2].question_id)
  rapor(
    'görülmeyen sorular deftere girmez: D 2 yanlış + görüp cevaplamadığı 1 boş = 3 satır, A (hepsi doğru) 0',
    d3.length === 3 && JSON.stringify(d3Pos) === '[0,1,2]' && bos3?.last_answer === null && (await defter(A)).length === 0,
    `D pozisyonları ${JSON.stringify(d3Pos)}, A ${(await defter(A)).length} satır`,
  )

  // ===== Oyun 1: A 'DYBDDDDDDD' (pos1 yanlış, pos2 boş), B 'YDDDDDDDDD' (pos0 yanlış) =====
  const g1 = await oyunKur(A, [B])
  await Promise.all([planlaOyna(A, g1, 'DYBDDDDDDD', sizinti), planlaOyna(B, g1, 'YDDDDDDDDD', sizinti)])
  await bitir(g1, [A, B]) // her biri iki kez (eşzamanlı): wrong_count yalnızca bir kez artmalı
  const q1 = await gqOku(g1)
  const dA = await defter(A)
  const dB = await defter(B)
  const aA = dA.find((r) => r.question_id === q1[1].question_id)
  const bA = dA.find((r) => r.question_id === q1[2].question_id)
  const d1 = await dogruSik(g1, 1)
  rapor(
    "finish_game (4 eşzamanlı çağrı): A'nın yanlışı ve boşu deftere girdi; wrong_count 1, resolved_at boş, last_game_id doğru",
    dA.length === 2 && !!aA && !!bA && aA.wrong_count === 1 && bA.wrong_count === 1 && aA.resolved_at === null && bA.resolved_at === null &&
      aA.last_game_id === g1 && bA.last_game_id === g1 && aA.source_table === q1[1].source_table,
    JSON.stringify(dA.map((r) => [r.wrong_count, r.last_answer])),
  )
  rapor(
    'last_answer: yanlışta seçilen şık (doğru şık değil), boşta NULL',
    !!aA?.last_answer && aA.last_answer !== d1 && bA?.last_answer === null,
    `${aA?.last_answer} / ${bA?.last_answer}`,
  )
  rapor(
    "B'nin defterinde yalnızca kendi yanlışı var (pos0); doğru yaptığı sorular girmedi",
    dB.length === 1 && dB[0].question_id === q1[0].question_id && dB[0].wrong_count === 1,
    JSON.stringify(dB.map((r) => r.wrong_count)),
  )
  const fAgain = await Promise.all([A, B, A, B].map((u) => u.client.rpc('finish_game', { p_game_id: g1 })))
  const dA2 = await defter(A)
  rapor(
    'finish_game tekrar çağrılınca wrong_count ARTMAZ',
    fAgain.every((r) => !r.error) && dA2.length === 2 && dA2.every((r) => r.wrong_count === 1) && (await defter(B))[0].wrong_count === 1,
    fAgain.find((r) => r.error)?.error?.message,
  )

  // GameReview.added_to_notebook
  const ra = await ger(A, g1)
  const rb = await ger(B, g1)
  rapor(
    'get_game_review: added_to_notebook A için 2, B için 1 (items hâlâ 10)',
    !ra.error && !rb.error && ra.data.added_to_notebook === 2 && rb.data.added_to_notebook === 1 && ra.data.items.length === 10,
    `${ra.data?.added_to_notebook}/${rb.data?.added_to_notebook}`,
  )

  // get_mistake_summary
  const sa = await ozet(A)
  const sb = await ozet(B)
  const toplamSay = (s: Alan) => (s.by_subject as Alan[]).reduce((t, x) => t + x.count, 0)
  rapor(
    'get_mistake_summary: A total 2, resolved_total 0, by_subject toplamı 2, exam yks ve ders etiketi (TYT); B total 1',
    !sa.error && sa.data.total === 2 && sa.data.resolved_total === 0 && toplamSay(sa.data) === 2 &&
      (sa.data.by_subject as Alan[]).every((x) => x.exam === 'yks' && /\(TYT\)/.test(x.subject)) && sb.data.total === 1,
    sa.error?.message ?? JSON.stringify(sa.data),
  )

  // get_mistakes: alanlar, sızıntı yok, filtreler
  const la = await liste(A)
  const itA = (la.data?.items ?? []) as Alan[]
  const anahtarlar = tumAnahtarlar(la.data)
  rapor(
    'get_mistakes: 2 öğe; alanlar tam; doğru şık/açıklama alan adı YOK',
    !la.error && itA.length === 2 &&
      itA.every((x) => ['question_id', 'exam', 'subject', 'text', 'image_url', 'options', 'last_answer', 'wrong_count', 'last_wrong_at'].every((k) => k in x)) &&
      !anahtarlar.some((k) => DEFTER_SIZINTI.test(k)),
    la.error?.message ?? [...new Set(anahtarlar)].join(','),
  )
  rapor(
    'get_mistakes: öğeler defterdeki satırlarla aynı, boş soruda last_answer null, yanlışta seçilen şık',
    new Set(itA.map((x) => x.question_id)).size === 2 &&
      itA.find((x) => x.question_id === q1[1].question_id)?.last_answer === aA?.last_answer &&
      itA.find((x) => x.question_id === q1[2].question_id)?.last_answer === null,
  )
  const lb = await liste(B)
  rapor("başkasının defteri görünmez: B yalnızca kendi 1 sorusunu görür", !lb.error && (lb.data.items as Alan[]).length === 1 && lb.data.items[0].question_id === q1[0].question_id)
  const lLgs = await liste(A, { exam: 'lgs' })
  const lYks = await liste(A, { exam: 'yks' })
  const ders = itA[0].subject as string
  const lDers = await liste(A, { subject: ders })
  const l1 = await liste(A, { limit: 1 })
  const lKotu = await liste(A, { exam: 'xyz' })
  rapor(
    'get_mistakes filtreleri: exam=lgs 0, exam=yks 2, subject yalnızca o ders, limit=1 → 1; geçersiz exam → hata',
    (lLgs.data.items as Alan[]).length === 0 && (lYks.data.items as Alan[]).length === 2 &&
      (lDers.data.items as Alan[]).length >= 1 && (lDers.data.items as Alan[]).every((x) => x.subject === ders) &&
      (l1.data.items as Alan[]).length === 1 && lKotu.error?.message === 'Geçersiz sınav',
    lKotu.error?.message,
  )

  // Silinmiş soru: sayımda ve listede atlanır; satır geri konunca döner
  const sil = q1[2]
  const { data: silSatir } = await admin.from(sil.source_table).select('*').eq('id', sil.question_id).single()
  if (silSatir) {
    try {
      await admin.from(sil.source_table).delete().eq('id', sil.question_id)
      const s1 = await ozet(A)
      const l2 = await liste(A)
      rapor('silinmiş soru: özet ve liste hata vermeden atlar (total 1, 1 öğe)', !s1.error && !l2.error && s1.data.total === 1 && l2.data.items.length === 1, s1.error?.message ?? l2.error?.message)
    } finally {
      const { error: geriE } = await admin.from(sil.source_table).insert(silSatir)
      rapor('silinen soru geri yüklendi', !geriE, geriE?.message)
    }
  }

  // ===== practice_answer =====
  const rastgele = '00000000-0000-4000-8000-000000000000'
  const p0 = await A.client.rpc('practice_answer', { p_question_id: q1[0].question_id, p_selected: 'A' })
  const pr = await A.client.rpc('practice_answer', { p_question_id: rastgele, p_selected: 'A' })
  rapor(
    "defterde olmayan soru → 'Bu soru defterinde yok' (başkasının sorusu ve olmayan id)",
    p0.error?.message === 'Bu soru defterinde yok' && pr.error?.message === 'Bu soru defterinde yok',
    `${p0.error?.message} / ${pr.error?.message}`,
  )
  const pz = await A.client.rpc('practice_answer', { p_question_id: q1[1].question_id, p_selected: 'Z' })
  rapor("geçersiz şık → 'Geçersiz şık'", pz.error?.message === 'Geçersiz şık', pz.error?.message)

  const yanlisSik = SIKLAR.find((s) => s !== d1)!
  const py = await A.client.rpc('practice_answer', { p_question_id: q1[1].question_id, p_selected: yanlisSik })
  const satirY = (await defter(A)).find((r) => r.question_id === q1[1].question_id)
  rapor(
    'practice_answer yanlış: is_correct false, resolved false, doğru şık + açıklama döner; wrong_count 2, last_answer güncel',
    !py.error && py.data.is_correct === false && py.data.resolved === false && py.data.correct_option === d1 &&
      satirY?.wrong_count === 2 && satirY.last_answer === yanlisSik && satirY.resolved_at === null,
    py.error?.message ?? JSON.stringify(py.data),
  )
  const { data: acik } = await admin.from(q1[1].source_table).select('cozum_aciklamasi').eq('id', q1[1].question_id).single()
  const pd = await A.client.rpc('practice_answer', { p_question_id: q1[1].question_id, p_selected: d1 })
  const satirD = (await defter(A)).find((r) => r.question_id === q1[1].question_id)
  rapor(
    'practice_answer doğru: is_correct true, resolved true, açıklama veritabanındakiyle aynı, resolved_at dolu',
    !pd.error && pd.data.is_correct === true && pd.data.resolved === true && (pd.data.explanation ?? null) === (acik?.cozum_aciklamasi ?? null) && !!satirD?.resolved_at,
    pd.error?.message ?? JSON.stringify(pd.data),
  )
  const sc = await ozet(A)
  const lc = await liste(A)
  const pTekrar = await A.client.rpc('practice_answer', { p_question_id: q1[1].question_id, p_selected: d1 })
  rapor(
    'çözülen soru listeden ve sayımdan çıkar (total 1, resolved_total 1); tekrar çözmek hata verir',
    sc.data.total === 1 && sc.data.resolved_total === 1 && lc.data.items.length === 1 && pTekrar.error?.message === 'Bu soru defterinde yok',
    pTekrar.error?.message,
  )

  // ===== remove_mistake =====
  const rm = await A.client.rpc('remove_mistake', { p_question_id: q1[2].question_id })
  const sr = await ozet(A)
  const rm2 = await A.client.rpc('remove_mistake', { p_question_id: q1[2].question_id })
  const rm3 = await A.client.rpc('remove_mistake', { p_question_id: rastgele })
  rapor(
    "remove_mistake: soru çıkar (total 0, resolved_total 2); tekrar çağrı sessiz; olmayan soru 'Bu soru defterinde yok'",
    !rm.error && sr.data.total === 0 && sr.data.resolved_total === 2 && !rm2.error && rm3.error?.message === 'Bu soru defterinde yok',
    rm.error?.message ?? rm3.error?.message,
  )

  // ===== Oyun 2: tekrar yanlış deftere geri döner; sonraki yarışta doğru yapılan soru çözülür =====
  // A: pos0 = (çözülmüş) q1[1] soruyu YANLIŞ, pos1 = (elle çıkarılmış) q1[2] soruyu doğru.
  // B: pos2 = (açık) q1[0] soruyu DOĞRU yapar.
  const g2 = await oyunKur(A, [B])
  await soruZorla(g2, 0, q1[1].source_table, q1[1].question_id)
  await soruZorla(g2, 1, q1[2].source_table, q1[2].question_id)
  await soruZorla(g2, 2, q1[0].source_table, q1[0].question_id)
  await Promise.all([planlaOyna(A, g2, 'YDDDDDDDDD', sizinti), planlaOyna(B, g2, 'DDDDDDDDDD', sizinti)])
  await bitir(g2, [A, B])
  const e1 = (await defter(A)).find((r) => r.question_id === q1[1].question_id)
  const e2 = (await defter(A)).find((r) => r.question_id === q1[2].question_id)
  rapor(
    'tekrar yanlış: çözülmüş soru deftere geri döner (resolved_at null, wrong_count 3, last_game_id yeni oyun)',
    e1?.resolved_at === null && e1.wrong_count === 3 && e1.last_game_id === g2,
    JSON.stringify([e1?.resolved_at, e1?.wrong_count]),
  )
  rapor('elle çıkarılmış soru sonraki yarışta doğru yapılınca çözülmüş KALIR, wrong_count artmaz', !!e2?.resolved_at && e2.wrong_count === 1)
  const eB = (await defter(B)).find((r) => r.question_id === q1[0].question_id)
  const sB2 = await ozet(B)
  rapor(
    "sonraki yarışta doğru yapılan soru çözüldü: B'nin q0 satırı resolved_at dolu, wrong_count 1; B total 0, resolved_total 1",
    !!eB?.resolved_at && eB.wrong_count === 1 && sB2.data.total === 0 && sB2.data.resolved_total === 1,
    JSON.stringify(sB2.data),
  )
  const r2a = await ger(A, g2)
  const r2b = await ger(B, g2)
  rapor('added_to_notebook: A 1, B 0', r2a.data?.added_to_notebook === 1 && r2b.data?.added_to_notebook === 0, `${r2a.data?.added_to_notebook}/${r2b.data?.added_to_notebook}`)

  // ===== LGS: 4 şık, exam filtresi, sıralama (en yeni önce) =====
  const g4 = await oyunKur(A, [B], 'lgs_sayisal')
  await Promise.all([planlaOyna(A, g4, 'DYDDDDDDDD', sizinti), planlaOyna(B, g4, 'DDDDDDDDDD', sizinti)])
  await bitir(g4, [A, B])
  const q4 = await gqOku(g4)
  const lAll = await liste(A)
  const lL = await liste(A, { exam: 'lgs' })
  const itL = (lL.data?.items ?? []) as Alan[]
  const sL = await ozet(A)
  rapor(
    "LGS: exam=lgs 1 öğe, options yalnızca A-D ('E' yok); tüm liste 2 öğe, en yeni (LGS) önce",
    !lL.error && itL.length === 1 && itL[0].question_id === q4[1].question_id && Object.keys(itL[0].options).sort().join('') === 'ABCD' &&
      lAll.data.items.length === 2 && lAll.data.items[0].exam === 'lgs' && lAll.data.items[1].exam === 'yks',
    lL.error?.message ?? JSON.stringify(Object.keys(itL[0]?.options ?? {})),
  )
  rapor(
    'get_mistake_summary: yks ve lgs ayrı satırlar (total 2)',
    sL.data.total === 2 && (sL.data.by_subject as Alan[]).some((x) => x.exam === 'lgs' && /\(LGS\)/.test(x.subject)) && (sL.data.by_subject as Alan[]).some((x) => x.exam === 'yks'),
    JSON.stringify(sL.data.by_subject),
  )
  const wcOnce = (await defter(A)).find((r) => r.question_id === q4[1].question_id)?.wrong_count
  const pE = await A.client.rpc('practice_answer', { p_question_id: q4[1].question_id, p_selected: 'E' })
  const wcSonra = (await defter(A)).find((r) => r.question_id === q4[1].question_id)?.wrong_count
  rapor("LGS sorusunda 'E' → 'Geçersiz şık' ve kayıt değişmez", pE.error?.message === 'Geçersiz şık' && wcOnce === wcSonra, pE.error?.message)

  rapor('sızıntı: defter testlerinde oyun yanıtlarında açıklama alan adı yok', sizinti.length === 0, [...new Set(sizinti)].join(','))
}

// ---- Akıllı analiz / Performansım (0011_akilli_analiz.sql) ----

const bugunIstanbul = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
const gunEkle = (d: string, n: number): string => {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const yuzde = (c: number, a: number): number => (a > 0 ? Math.round((1000 * c) / a) / 10 : 0)

async function performansTesti() {
  const P1 = await kullaniciOlustur('P1')
  const P2 = await kullaniciOlustur('P2')
  const P3 = await kullaniciOlustur('P3')
  const perf = (u: Kullanici, a: { exam?: string | null; days?: number } = {}) =>
    u.client.rpc('get_performance', { p_exam: a.exam ?? null, p_days: a.days ?? 30 })
  const sizinti: string[] = []
  const gunuAyarla = async (oyun: string, kacGunOnce: number) => {
    const { error } = await admin.from('games').update({ finished_at: new Date(Date.now() - kacGunOnce * 86_400_000).toISOString() }).eq('id', oyun)
    if (error) throw new Error(`finished_at: ${error.message}`)
  }
  const bitir = async (oyun: string, kimler: Kullanici[]) => {
    await sureyiBitir(oyun)
    for (const u of kimler) {
      const r = await u.client.rpc('finish_game', { p_game_id: oyun })
      if (r.error) throw new Error(`finish_game: ${r.error.message}`)
    }
  }

  // ===== Boş kullanıcı =====
  const bos = await perf(P3)
  const bd = bos.data
  rapor(
    'boş kullanıcı: totals sıfır, bySubject/byTopic boş, daily 7 gün sıfır, streak 0',
    !bos.error && bd.totals.games === 0 && bd.totals.answered === 0 && bd.totals.accuracy === 0 && bd.totals.avg_time_ms === 0 &&
      bd.by_subject.length === 0 && bd.by_topic.length === 0 && bd.daily.length === 7 &&
      bd.daily.every((x: Alan) => x.answered === 0 && x.correct === 0) && bd.streak_days === 0,
    bos.error?.message ?? JSON.stringify(bd),
  )
  const kotu = await perf(P3, { exam: 'xyz' })
  rapor("geçersiz exam → 'Geçersiz sınav'", kotu.error?.message === 'Geçersiz sınav', kotu.error?.message)

  // ===== Oyun 1: bilinen konular =====
  const g = await oyunKur(P1, [P2])
  const gq = await gqOku(g)
  // konular: pos0-3 'Tst Konu A', pos4-8 'Tst Konu B', pos9 boş (NULL → 'Diğer')
  const konuOf = (pos: number): string | null => (pos <= 3 ? 'Tst Konu A' : pos <= 8 ? 'Tst Konu B' : null)
  const orijinal: { tbl: string; id: string; topic: string | null }[] = []
  for (const q of gq) {
    const { data } = await admin.from(q.source_table).select('topic').eq('id', q.question_id).single()
    orijinal.push({ tbl: q.source_table, id: q.question_id, topic: (data?.topic as string | null) ?? null })
  }
  try {
    for (const q of gq) {
      const { error } = await admin.from(q.source_table).update({ topic: konuOf(q.position) }).eq('id', q.question_id)
      if (error) throw new Error(`topic atama: ${error.message}`)
    }

    const planP1 = 'DDYBDDYYDD' // 6 doğru, 3 yanlış, 1 boş
    const planP2 = 'DDDDDDDDDD'
    await Promise.all([planlaOyna(P1, g, planP1, sizinti), planlaOyna(P2, g, planP2, sizinti)])

    const once = await perf(P1)
    rapor('yalnızca BİTMİŞ oyunlar: oyun sürerken totals.games 0, answered 0', !once.error && once.data.totals.games === 0 && once.data.totals.answered === 0, once.error?.message ?? JSON.stringify(once.data.totals))

    await bitir(g, [P1, P2])

    // Beklenen değerleri bu yarıştan yerelde hesapla
    const etiketler: Record<string, string> = {}
    for (const q of gq) {
      if (!etiketler[q.source_table]) {
        const l = await admin.rpc('question_label', { source_table: q.source_table })
        etiketler[q.source_table] = l.data as string
      }
    }
    const beklenenTopic = new Map<string, { subject: string; topic: string; answered: number; correct: number }>()
    const beklenenDers = new Map<string, { answered: number; correct: number }>()
    for (const q of gq) {
      const sonuc = planP1[q.position]
      if (sonuc === 'B') continue // boş: answered'a sayılmaz
      const topic = konuOf(q.position) ?? 'Diğer'
      const k = `${q.source_table}|${topic}`
      const t = beklenenTopic.get(k) ?? { subject: etiketler[q.source_table], topic, answered: 0, correct: 0 }
      t.answered++
      if (sonuc === 'D') t.correct++
      beklenenTopic.set(k, t)
      const d = beklenenDers.get(q.source_table) ?? { answered: 0, correct: 0 }
      d.answered++
      if (sonuc === 'D') d.correct++
      beklenenDers.set(q.source_table, d)
    }

    const r1 = await perf(P1)
    const p = r1.data
    const { data: cevaplar } = await admin.from('answers').select('sure_ms, secenek').eq('game_id', g).eq('user_id', P1.id)
    const sureler = (cevaplar ?? []).filter((x) => x.secenek !== null).map((x) => Number(x.sure_ms))
    const beklenenOrt = Math.round(sureler.reduce((t, x) => t + x, 0) / sureler.length)
    rapor(
      'totals: 1 oyun, 9 cevaplanan, 6 doğru, 3 yanlış, 1 boş, accuracy 66.7, ortalama süre cevap sürelerinden',
      !r1.error && p.totals.games === 1 && p.totals.answered === 9 && p.totals.correct === 6 && p.totals.wrong === 3 && p.totals.blank === 1 &&
        p.totals.accuracy === 66.7 && Math.abs(p.totals.avg_time_ms - beklenenOrt) <= 1,
      r1.error?.message ?? `${JSON.stringify(p.totals)} (beklenen ort ${beklenenOrt})`,
    )

    const satirlar = (p.by_topic as Alan[]).filter((x) => /^(Tst Konu|Diğer)/.test(x.topic))
    const topicTamam =
      satirlar.length === p.by_topic.length &&
      satirlar.length === beklenenTopic.size &&
      satirlar.every((x) => {
        const e = [...beklenenTopic.values()].find((b) => b.subject === x.subject && b.topic === x.topic)
        return !!e && x.answered === e.answered && x.correct === e.correct && x.accuracy === yuzde(e.correct, e.answered) &&
          x.low_sample === (e.answered < 3) && x.exam === 'yks'
      })
    rapor('byTopic: (ders, konu) başına answered/correct/accuracy/lowSample yerel hesapla birebir aynı; boş topic "Diğer"', topicTamam, JSON.stringify(p.by_topic))
    const lowIdx = (p.by_topic as Alan[]).findIndex((x) => x.low_sample)
    const sirali = (p.by_topic as Alan[]).every((x, i, a) => i === 0 || a[i - 1].low_sample === x.low_sample || (!a[i - 1].low_sample && x.low_sample)) &&
      (p.by_topic as Alan[]).filter((x) => !x.low_sample).every((x, i, a) => i === 0 || a[i - 1].accuracy <= x.accuracy)
    rapor(`byTopic sırası: önce yeterli örnekliler (doğruluk artan), sonra lowSample (${lowIdx < 0 ? 'lowSample yok' : `ilk lowSample ${lowIdx}. sırada`})`, sirali)
    const dersTamam =
      (p.by_subject as Alan[]).length === beklenenDers.size &&
      (p.by_subject as Alan[]).every((x) => {
        const tbl = Object.keys(etiketler).find((t) => etiketler[t] === x.subject)!
        const e = beklenenDers.get(tbl)
        return !!e && x.answered === e.answered && x.correct === e.correct && x.accuracy === yuzde(e.correct, e.answered) &&
          x.exam === 'yks' && Number.isInteger(x.avg_time_ms) && x.avg_time_ms >= 0
      })
    rapor('bySubject: ders başına answered/correct/accuracy yerel hesapla aynı (boş bırakılanlar sayılmaz)', dersTamam, JSON.stringify(p.by_subject))

    const bugun = bugunIstanbul()
    const gunler = [-6, -5, -4, -3, -2, -1, 0].map((n) => gunEkle(bugun, n))
    rapor(
      'daily: 7 gün (bugün dahil, eskiden yeniye), bugün 9/6, diğer günler 0; streakDays 1',
      JSON.stringify(p.daily.map((x: Alan) => x.date)) === JSON.stringify(gunler) &&
        p.daily[6].answered === 9 && p.daily[6].correct === 6 && p.daily.slice(0, 6).every((x: Alan) => x.answered === 0 && x.correct === 0) && p.streak_days === 1,
      JSON.stringify(p.daily),
    )

    // Başka kullanıcılar etkilenmez / yalnızca kendi verisi
    const r2 = await perf(P2)
    const r3 = await perf(P3)
    rapor(
      'yalnızca kendi verisi: P2 10/10 (accuracy 100), P3 hâlâ boş',
      r2.data.totals.answered === 10 && r2.data.totals.correct === 10 && r2.data.totals.accuracy === 100 && r2.data.totals.games === 1 &&
        r3.data.totals.games === 0 && r3.data.by_topic.length === 0,
      JSON.stringify([r2.data.totals, r3.data.totals]),
    )

    // Filtreler
    const lgs = await perf(P1, { exam: 'lgs' })
    const yks = await perf(P1, { exam: 'yks' })
    rapor(
      'exam filtresi: lgs → boş (daily 7 gün sıfır), yks → tüm veri; streak filtreden bağımsız',
      lgs.data.totals.games === 0 && lgs.data.by_topic.length === 0 && lgs.data.daily.every((x: Alan) => x.answered === 0) &&
        yks.data.totals.games === 1 && yks.data.totals.answered === 9 && lgs.data.streak_days === 1,
      lgs.error?.message ?? yks.error?.message,
    )

    // topic: review ve defter
    const rv = await P1.client.rpc('get_game_review', { p_game_id: g })
    const items = (rv.data?.items ?? []) as Alan[]
    rapor(
      'get_game_review: her öğede topic (pos0-3 A, 4-8 B, 9 boş → null)',
      !rv.error && items.length === 10 && items.every((x) => x.topic === konuOf(x.position)),
      rv.error?.message ?? JSON.stringify(items.map((x) => x.topic)),
    )
    const md = await P1.client.rpc('get_mistakes', { p_exam: null, p_subject: null, p_limit: 50 })
    const mi = (md.data?.items ?? []) as Alan[]
    rapor(
      'get_mistakes: her öğede topic, oyundaki sorunun konusuyla aynı (4 yanlış/boş soru)',
      !md.error && mi.length === 4 && mi.every((x) => 'topic' in x && x.topic === konuOf(gq.find((q) => q.question_id === x.question_id)!.position)),
      md.error?.message ?? JSON.stringify(mi.map((x) => x.topic)),
    )

    // Pencere (days) ve seri
    await gunuAyarla(g, 5)
    const d1 = await perf(P1, { days: 1 })
    const d30 = await perf(P1, { days: 30 })
    const d0 = await perf(P1, { days: 0 })
    const d9 = await perf(P1, { days: 9999 })
    rapor(
      'days: 5 gün önce biten yarış days=1 penceresinde yok (totals/byTopic boş) ama daily’de 5 gün önce 9/6; days=30 kapsıyor; 0 ve 9999 hata vermez',
      d1.data.totals.games === 0 && d1.data.by_topic.length === 0 && d1.data.daily[1].answered === 9 && d1.data.daily[1].correct === 6 &&
        d30.data.totals.games === 1 && !d0.error && d0.data.totals.games === 0 && !d9.error && d9.data.totals.games === 1,
      d1.error?.message ?? JSON.stringify(d1.data.daily),
    )
    rapor('seri: tek oyun 5 gün önce → streakDays 0', d30.data.streak_days === 0, String(d30.data.streak_days))

    // İkinci oyun (bugün) ile seri senaryoları
    const g2 = await oyunKur(P1, [P2])
    await Promise.all([planlaOyna(P1, g2, 'DD', sizinti), planlaOyna(P2, g2, 'D', sizinti)])
    await bitir(g2, [P1, P2])
    const seri = async (): Promise<number> => (await perf(P1)).data.streak_days as number
    const senaryolar: Array<[string, number, number, number]> = [
      // [açıklama, g kaç gün önce, g2 kaç gün önce, beklenen seri]
      ['g 5 gün önce, g2 bugün → 1', 5, 0, 1],
      ['g dün, g2 bugün → 2', 1, 0, 2],
      ['g 2 gün önce, g2 bugün (dün boş) → 1', 2, 0, 1],
      ['g 2 gün önce, g2 dün (bugün yok) → 2', 2, 1, 2],
      ['g 4 gün önce, g2 3 gün önce (bugün/dün yok) → 0', 4, 3, 0],
    ]
    const sonuclar: string[] = []
    let hepsi = true
    for (const [ad, gOnce, g2Once, beklenen] of senaryolar) {
      await gunuAyarla(g, gOnce)
      await gunuAyarla(g2, g2Once)
      const s = await seri()
      if (s !== beklenen) hepsi = false
      sonuclar.push(`${ad}: ${s}`)
    }
    rapor('streakDays senaryoları (bugün ya da dünden geriye üst üste gün)', hepsi, sonuclar.join(' | '))
  } finally {
    for (const o of orijinal) await admin.from(o.tbl).update({ topic: o.topic }).eq('id', o.id)
    rapor('soruların özgün konuları geri yüklendi', true, `${orijinal.length} soru`)
  }
}

// ---- Günlük görevler (0012_gunluk_gorevler.sql) ----

const HAVUZ: Record<string, { title: string; target: number; xp: number }> = {
  math10: { title: '10 Matematik sorusu çöz', target: 10, xp: 30 },
  win1: { title: '1 yarışma kazan', target: 1, xp: 40 },
  correct5: { title: '5 doğru cevap ver', target: 5, xp: 20 },
  friends2: { title: '2 arkadaşınla yarış (3+ kişilik)', target: 1, xp: 30 },
  notebook3: { title: "Yanlışlarım'dan 3 soru çöz", target: 3, xp: 30 },
  acc70: { title: 'Bir yarışta %70 doğruluk yakala', target: 1, xp: 30 },
  quick1: { title: 'Hemen Katıl ile 1 yarış', target: 1, xp: 20 },
  games3: { title: '3 yarışma tamamla', target: 3, xp: 30 },
}
const md5 = (s: string): string => createHash('md5').update(s).digest('hex')
// Günün 3 görevi: md5(tarih + id) sırasının ilk üçü (sunucuyla aynı kural)
const gununGorevleri = (gun: string): string[] => Object.keys(HAVUZ).sort((a, b) => (md5(gun + a) < md5(gun + b) ? -1 : 1)).slice(0, 3)
const istanbulGunu = (iso: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(iso))

// İlerlemeyi veritabanındaki ham verilerden SUNUCUDAN BAĞIMSIZ hesaplar
async function gorevBeklenen(u: Kullanici, gun: string): Promise<Record<string, number>> {
  const sifir = { math10: 0, win1: 0, correct5: 0, friends2: 0, notebook3: 0, acc70: 0, quick1: 0, games3: 0 }
  const { data: gps } = await admin.from('game_players').select('game_id, current_q, correct_count, wrong_count').eq('user_id', u.id)
  const oyuncular = (gps ?? []) as Alan[]
  const sonuc = { ...sifir }
  const { data: pr } = await admin.from('mistake_book').select('practice_resolved_at').eq('user_id', u.id).not('practice_resolved_at', 'is', null)
  sonuc.notebook3 = ((pr ?? []) as Alan[]).filter((x) => istanbulGunu(x.practice_resolved_at) === gun).length
  if (oyuncular.length === 0) return sonuc
  const { data: gms } = await admin.from('games').select('id, status, winner_id, is_public, finished_at').in('id', oyuncular.map((x) => x.game_id))
  const uygun = ((gms ?? []) as Alan[]).filter(
    (g) => g.status === 'finished' && g.finished_at && istanbulGunu(g.finished_at) === gun && oyuncular.find((p) => p.game_id === g.id)!.current_q >= 1,
  )
  if (uygun.length === 0) return sonuc
  const idler = uygun.map((g) => g.id)
  const { data: hepsi } = await admin.from('game_players').select('game_id').in('game_id', idler)
  const oyuncuSayisi = (id: string) => ((hepsi ?? []) as Alan[]).filter((x) => x.game_id === id).length
  const { data: cev } = await admin.from('answers').select('game_id, position, dogru').eq('user_id', u.id).in('game_id', idler).not('secenek', 'is', null)
  const { data: gq } = await admin.from('game_questions').select('game_id, position, source_table').in('game_id', idler)
  const tablo = (g: string, p: number) => ((gq ?? []) as Alan[]).find((x) => x.game_id === g && x.position === p)?.source_table as string
  const cevaplar = (cev ?? []) as Alan[]
  sonuc.math10 = cevaplar.filter((a) => ['matematik_tyt', 'matematik_ayt', 'matematik_lgs'].includes(tablo(a.game_id, a.position))).length
  sonuc.correct5 = cevaplar.filter((a) => a.dogru === true).length
  sonuc.win1 = uygun.filter((g) => g.winner_id === u.id).length
  sonuc.friends2 = uygun.filter((g) => oyuncuSayisi(g.id) >= 3).length
  sonuc.quick1 = uygun.filter((g) => g.is_public === true).length
  sonuc.games3 = uygun.length
  sonuc.acc70 = uygun.filter((g) => {
    const p = oyuncular.find((x) => x.game_id === g.id)!
    const c = p.correct_count as number
    const w = p.wrong_count as number
    return c + w >= 5 && c * 10 >= (c + w) * 7
  }).length
  return sonuc
}

async function gunlukGorevTesti() {
  const U1 = await kullaniciOlustur('G1')
  const U2 = await kullaniciOlustur('G2')
  const U3 = await kullaniciOlustur('G3')
  const PB = await kullaniciOlustur('G4') // hiç oynamayan
  const bugun = bugunIstanbul()
  const dun = gunEkle(bugun, -1)
  const sizinti: string[] = []
  const gorevler = (u: Kullanici) => u.client.rpc('get_daily_tasks')
  const al = (u: Kullanici, id: string) => u.client.rpc('claim_daily_task', { p_task_id: id })
  const ham = async (u: Kullanici, gun: string): Promise<Record<string, number>> => {
    const r = await admin.rpc('_daily_progress', { p_uid: u.id, p_day: gun })
    if (r.error) throw new Error(`_daily_progress: ${r.error.message}`)
    return r.data as Record<string, number>
  }
  const bitir = async (oyun: string, kimler: Kullanici[]) => {
    await sureyiBitir(oyun)
    for (const u of kimler) {
      const r = await u.client.rpc('finish_game', { p_game_id: oyun })
      if (r.error) throw new Error(`finish_game: ${r.error.message}`)
    }
  }
  const dogruSikSoru = async (tbl: string, qid: string): Promise<string> => {
    const { data } = await admin.from(tbl).select('dogru_sik').eq('id', qid).single()
    return String(data?.dogru_sik)
  }

  // ===== Hiç oynamayan oyuncu: yapı, deterministik seçim, hatalar =====
  const beklenenIdler = gununGorevleri(bugun)
  const r0 = await gorevler(PB)
  const d0 = r0.data
  const istanbulGeceYarisi = Date.parse(`${gunEkle(bugun, 1)}T00:00:00+03:00`)
  rapor(
    'get_daily_tasks (boş oyuncu): date bugün (İstanbul), resets_at bir sonraki İstanbul gece yarısı, 3 görev, ilerleme 0, bonus 50 XP',
    !r0.error && d0.date === bugun && Date.parse(d0.resets_at) === istanbulGeceYarisi && d0.tasks.length === 3 &&
      d0.tasks.every((t: Alan) => t.progress === 0 && t.completed === false && t.claimed === false) &&
      d0.bonus.xp === 50 && d0.bonus.completed === false && d0.bonus.claimed === false,
    r0.error?.message ?? JSON.stringify(d0),
  )
  rapor(
    "günün 3 görevi md5(tarih+id) kuralıyla belirlenir; başlık/hedef/xp havuzla aynı; herkes için aynı sıra",
    JSON.stringify(d0.tasks.map((t: Alan) => t.id)) === JSON.stringify(beklenenIdler) &&
      d0.tasks.every((t: Alan) => HAVUZ[t.id].title === t.title && HAVUZ[t.id].target === t.target && HAVUZ[t.id].xp === t.xp),
    `${JSON.stringify(d0.tasks.map((t: Alan) => t.id))} ≟ ${JSON.stringify(beklenenIdler)}`,
  )
  const hatalar0: string[] = []
  for (const id of beklenenIdler) hatalar0.push((await al(PB, id)).error?.message ?? 'HATASIZ')
  const bon0 = (await al(PB, 'bonus')).error?.message
  const yabanci = Object.keys(HAVUZ).find((id) => !beklenenIdler.includes(id))!
  const yab = (await al(PB, yabanci)).error?.message
  const gec = (await al(PB, 'xyz')).error?.message
  const bos = (await al(PB, '')).error?.message
  rapor(
    "ödül hataları: tamamlanmamış 'Görev henüz tamamlanmadı'; bonus 'Önce üç görevin ödülünü al'; bugünün olmayan/bilinmeyen 'Bu görev bugünün görevi değil'; boş 'Geçersiz görev'",
    hatalar0.every((m) => m === 'Görev henüz tamamlanmadı') && bon0 === 'Önce üç görevin ödülünü al' &&
      yab === 'Bu görev bugünün görevi değil' && gec === 'Bu görev bugünün görevi değil' && bos === 'Geçersiz görev',
    JSON.stringify([hatalar0, bon0, yab, gec, bos]),
  )
  const { data: pst } = await admin.from('player_stats').select('xp').eq('user_id', PB.id)
  rapor('hatalı alımlarda XP verilmez', (pst ?? []).length === 0 || pst![0].xp === 0, JSON.stringify(pst))

  // ===== Yarışlar =====
  // G1: lgs_sayisal, 3 oyuncu, herkese açık (Hemen Katıl sayılır). U1 7/10 (tam %70) ve kazanır.
  const g1 = await oyunKur(U1, [U2, U3], 'lgs_sayisal')
  await admin.from('games').update({ is_public: true }).eq('id', g1)
  await Promise.all([planlaOyna(U1, g1, 'DDDDDDDYYY', sizinti), planlaOyna(U2, g1, 'DDYYYYYYYY', sizinti), planlaOyna(U3, g1, 'YYYYYYYYYY', sizinti)])
  await bitir(g1, [U1, U2, U3])
  // U1 3 yanlışını practice_answer ile doğru çözer. G2/G3 oynanmadan ÖNCE yapılır: sonraki yarışta aynı soru
  // doğru cevaplanırsa finish_game soruyu zaten çözülmüş sayar ve practice_answer 'defterinde yok' derdi.
  const gq1 = await gqOku(g1)
  for (const pos of [7, 8, 9]) {
    const r = await U1.client.rpc('practice_answer', { p_question_id: gq1[pos].question_id, p_selected: await dogruSik(g1, pos) })
    if (r.error || !r.data.resolved) throw new Error(`practice_answer(${pos}): ${r.error?.message}`)
  }
  // G2: lgs_sayisal, 2 oyuncu
  const g2 = await oyunKur(U1, [U2], 'lgs_sayisal')
  await Promise.all([planlaOyna(U1, g2, 'DDDDDDDDDD', sizinti), planlaOyna(U2, g2, 'YYYYYYYYYY', sizinti)])
  await bitir(g2, [U1, U2])
  // G3: tyt, 2 oyuncu, yalnızca ilk 5 soru
  const g3 = await oyunKur(U1, [U2], 'tyt')
  await Promise.all([planlaOyna(U1, g3, 'DDDDD', sizinti), planlaOyna(U2, g3, 'DDDDD', sizinti)])
  await bitir(g3, [U1, U2])

  // Defter: U2 önce 3 soruyu ELLE çıkarır (sayılmaz), sonra 3'ünü practice_answer ile çözer
  const aci = ((await U2.client.rpc('get_mistakes', { p_exam: null, p_subject: null, p_limit: 50 })).data?.items ?? []) as Alan[]
  for (const it of aci.slice(0, 3)) {
    const r = await U2.client.rpc('remove_mistake', { p_question_id: it.question_id })
    if (r.error) throw new Error(`remove_mistake: ${r.error.message}`)
  }
  const u2Once = await ham(U2, bugun)
  rapor("notebook3: remove_mistake (elle çıkarma) SAYILMAZ (U2: 0)", u2Once.notebook3 === 0, JSON.stringify(u2Once))
  const { data: u2Satirlar } = await admin.from('mistake_book').select('question_id, source_table').eq('user_id', U2.id).is('resolved_at', null)
  for (const s of ((u2Satirlar ?? []) as Alan[]).slice(0, 3)) {
    const r = await U2.client.rpc('practice_answer', { p_question_id: s.question_id, p_selected: await dogruSikSoru(s.source_table, s.question_id) })
    if (r.error || !r.data.resolved) throw new Error(`practice_answer(U2): ${r.error?.message}`)
  }

  // ===== İlerleme: sunucu = bağımsız hesap (8 görev, 3 oyuncu) =====
  for (const [ad, u] of [['U1', U1], ['U2', U2], ['U3', U3]] as Array<[string, Kullanici]>) {
    const s = await ham(u, bugun)
    const b = await gorevBeklenen(u, bugun)
    const tamam = Object.keys(HAVUZ).every((k) => Number(s[k]) === b[k])
    rapor(`_daily_progress ${ad}: 8 görevin ilerlemesi ham verilerden bağımsız hesapla birebir aynı`, tamam, `${JSON.stringify(s)} ≟ ${JSON.stringify(b)}`)
  }
  const s1 = await ham(U1, bugun)
  rapor(
    'U1 senaryosu: math10 ≥ 10, win1 ≥ 1, correct5 ≥ 5, friends2 = 1 (yalnız 3 kişilik G1), notebook3 = 3 (yalnız practice), acc70 = 3 (G1 tam %70 dahil), quick1 = 1, games3 = 3',
    s1.math10 >= 10 && s1.win1 >= 1 && s1.correct5 >= 5 && s1.friends2 === 1 && s1.notebook3 === 3 && s1.acc70 === 3 && s1.quick1 === 1 && s1.games3 === 3,
    JSON.stringify(s1),
  )
  const s2 = await ham(U2, bugun)
  // win1 kontrol edilmez: G3'te iki oyuncu da 5/5 yapar, kazananı hız belirler (U2 de kazanabilir); win1 yukarıda bağımsız hesapla doğrulandı
  rapor('U2: notebook3 = 3 (3 çözüldü, 3 elle çıkarılan sayılmadı), acc70 = 1 (yalnız G3: 5/5), win1 ≤ 1 (G1/G2 kaybetti)', s2.notebook3 === 3 && s2.acc70 === 1 && s2.win1 <= 1, JSON.stringify(s2))
  const sP = await ham(PB, bugun)
  rapor('hiç oynamayan: tüm ilerlemeler 0 (başkalarının verisi karışmaz)', Object.values(sP).every((v) => Number(v) === 0), JSON.stringify(sP))

  // ===== get_daily_tasks (U1) =====
  const r1 = await gorevler(U1)
  const t1 = r1.data
  rapor(
    'get_daily_tasks (U1): aynı 3 görev ve sıra; hepsi tamamlandı (progress = target), henüz alınmadı',
    !r1.error && JSON.stringify(t1.tasks.map((t: Alan) => t.id)) === JSON.stringify(beklenenIdler) &&
      t1.tasks.every((t: Alan) => t.completed === true && t.progress === t.target && t.claimed === false) && t1.bonus.completed === false,
    r1.error?.message ?? JSON.stringify(t1.tasks),
  )

  // ===== Ödül alma (U1): XP, rütbe, eşzamanlılık, bonus =====
  await statAyarla(U1, 95) // Çaylak, 5 XP sonra Bronz I
  const [ta, tb, tc] = t1.tasks as Alan[]
  const [c1, c2] = await Promise.all([al(U1, ta.id), al(U1, ta.id)])
  const ok = [c1, c2].filter((x) => !x.error)
  const hata = [c1, c2].filter((x) => x.error)
  rapor(
    "aynı görev AYNI anda iki kez alınınca yalnızca biri başarılı; diğeri 'Ödül zaten alındı'",
    ok.length === 1 && hata.length === 1 && hata[0].error?.message === 'Ödül zaten alındı',
    JSON.stringify([c1.error?.message ?? c1.data, c2.error?.message ?? c2.data]),
  )
  const a1 = ok[0].data
  rapor(
    'claim: xp_gained görev xp\'i, new_xp = 95 + xp, tier_before Çaylak → tier_after Bronz I',
    a1.xp_gained === ta.xp && a1.new_xp === 95 + ta.xp && a1.tier_before === 'Çaylak' && a1.tier_after === 'Bronz I',
    JSON.stringify(a1),
  )
  const tekrar = await al(U1, ta.id)
  rapor("aynı görevi tekrar almak 'Ödül zaten alındı'", tekrar.error?.message === 'Ödül zaten alındı', tekrar.error?.message)
  const bon1 = await al(U1, 'bonus')
  rapor("bonus: 3 görevin ödülü alınmadan 'Önce üç görevin ödülünü al'", bon1.error?.message === 'Önce üç görevin ödülünü al', bon1.error?.message)
  const cb = await al(U1, tb.id)
  const bon2 = await al(U1, 'bonus')
  rapor('bonus: 2 görev alınmışken de reddedilir', !cb.error && bon2.error?.message === 'Önce üç görevin ödülünü al', cb.error?.message ?? bon2.error?.message)
  const cc = await al(U1, tc.id)
  const r2 = await gorevler(U1)
  rapor(
    '3 görev alınınca: hepsi claimed, bonus.completed true / claimed false',
    !cc.error && r2.data.tasks.every((t: Alan) => t.claimed === true) && r2.data.bonus.completed === true && r2.data.bonus.claimed === false,
    cc.error?.message ?? JSON.stringify(r2.data.bonus),
  )
  const toplamXp = ta.xp + tb.xp + tc.xp
  const bonus = await al(U1, 'bonus')
  rapor(
    'bonus alımı: +50 XP, new_xp = 95 + 3 görev + 50',
    !bonus.error && bonus.data.xp_gained === 50 && bonus.data.new_xp === 95 + toplamXp + 50,
    bonus.error?.message ?? JSON.stringify(bonus.data),
  )
  const bonusTekrar = await al(U1, 'bonus')
  const r3 = await gorevler(U1)
  rapor("bonus tekrar → 'Ödül zaten alındı'; get_daily_tasks bonus.claimed true", bonusTekrar.error?.message === 'Ödül zaten alındı' && r3.data.bonus.claimed === true, bonusTekrar.error?.message)
  const { data: st } = await admin.from('player_stats').select('xp').eq('user_id', U1.id).single()
  const { data: kayitlar } = await admin.from('daily_claims').select('date, task_id, xp_gained').eq('user_id', U1.id)
  const sonEtiket = (await admin.rpc('rank_of', { p_xp: st!.xp })).data?.[0]?.rank_label
  rapor(
    'player_stats.xp doğru (95 + görevler + 50); daily_claims 4 satır (3 görev + bonus, bugünün tarihiyle); son rütbe etiketi tutarlı',
    st?.xp === 95 + toplamXp + 50 && (kayitlar ?? []).length === 4 && (kayitlar ?? []).every((k) => k.date === bugun) &&
      (kayitlar ?? []).some((k) => k.task_id === 'bonus' && k.xp_gained === 50) && bonus.data.tier_after === sonEtiket,
    `xp ${st?.xp}, ${JSON.stringify(kayitlar)}, ${sonEtiket}`,
  )
  const r4 = await gorevler(U2)
  rapor('herkes aynı gün aynı görevleri görür (U1, U2, hiç oynamayan: aynı id dizisi)', JSON.stringify(r4.data.tasks.map((t: Alan) => t.id)) === JSON.stringify(beklenenIdler), JSON.stringify(r4.data.tasks.map((t: Alan) => t.id)))

  // ===== "Bugün" sınırı: G1 dün bitmiş sayılırsa bugünkü ilerleme düşer, ödül kaydı kalır =====
  const { error: eKay } = await admin.from('games').update({ finished_at: new Date(Date.now() - 86_400_000).toISOString() }).eq('id', g1)
  if (eKay) throw new Error(`finished_at: ${eKay.message}`)
  const bugunSonra = await ham(U1, bugun)
  const dunSonra = await ham(U1, dun)
  const r5 = await gorevler(U1)
  rapor(
    'bugün sınırı: G1 dün bitmiş sayılınca bugünkü friends2 0, quick1 0, games3 2; dünkü friends2 1, quick1 1, games3 1; alınmış ödüller (claimed) korunur',
    bugunSonra.friends2 === 0 && bugunSonra.quick1 === 0 && bugunSonra.games3 === 2 && dunSonra.friends2 === 1 && dunSonra.quick1 === 1 && dunSonra.games3 === 1 &&
      r5.data.tasks.every((t: Alan) => t.claimed === true) && r5.data.bonus.claimed === true,
    `${JSON.stringify(bugunSonra)} / ${JSON.stringify(dunSonra)}`,
  )
  const dunBeklenen = await gorevBeklenen(U1, dun)
  rapor('dünkü ilerleme de bağımsız hesapla aynı', Object.keys(HAVUZ).every((k) => Number(dunSonra[k]) === dunBeklenen[k]), `${JSON.stringify(dunSonra)} ≟ ${JSON.stringify(dunBeklenen)}`)
  rapor('sızıntı: görev testlerinde oyun yanıtlarında açıklama alan adı yok', sizinti.length === 0, [...new Set(sizinti)].join(','))
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

  // ---- finish_game / get_global_leaderboard (0005_rpc_finish.sql): A, B, C oyuncu; D üye olmayan ----
  await bitirmeTesti(A, B, C, D)

  // ---- get_game_review (0008_cozum_aciklamasi.sql) ----
  await incelemeTesti(A, B, D)

  // ---- Hemen Katıl (0009_hemen_katil.sql) ----
  await hemenKatilTesti(A, B, C, D, E)

  // ---- Yanlışlarım defteri (0010_yanlislarim_defteri.sql) ----
  await defterTesti(A, B, D)

  // ---- Akıllı analiz / Performansım (0011_akilli_analiz.sql) ----
  await performansTesti()

  // ---- Günlük görevler (0012_gunluk_gorevler.sql) ----
  await gunlukGorevTesti()
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
