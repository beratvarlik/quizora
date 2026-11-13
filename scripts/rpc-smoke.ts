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
