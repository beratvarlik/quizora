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
