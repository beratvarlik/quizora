import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

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

const SORU_TABLOLARI = [
  'matematik_tyt', 'turkce_tyt', 'kimya_tyt', 'fizik_tyt', 'biyoloji_tyt',
  'tarih_tyt', 'cografya_tyt', 'felsefe_tyt', 'din_kulturu_tyt',
  'fizik_ayt', 'kimya_ayt', 'biyoloji_ayt', 'matematik_ayt', 'edebiyat_ayt',
  'tarih_ayt', 'cografya_ayt', 'felsefe_ayt', 'din_kulturu_ayt',
  // LGS (0003_lgs_xp.sql)
  'turkce_lgs', 'inkilap_lgs', 'din_kulturu_lgs',
  'ingilizce_lgs', 'matematik_lgs', 'fen_lgs',
]
const LGS_TABLOLARI = ['turkce_lgs', 'inkilap_lgs', 'din_kulturu_lgs', 'ingilizce_lgs', 'matematik_lgs', 'fen_lgs']
const OYUN_TABLOLARI = [
  'profiles', 'games', 'game_players', 'game_questions', 'answers', 'global_scores',
  'rank_tiers', 'player_stats',
]

let basarisiz = 0
function rapor(ad: string, gecti: boolean, ayrinti = '') {
  if (!gecti) basarisiz++
  console.log(`${gecti ? 'geçti' : 'KALDI'} — ${ad}${ayrinti ? ` (${ayrinti})` : ''}`)
}

async function main() {
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })

  // 1. Tablo varlığı (service role ile)
  const yok: string[] = []
  for (const t of [...SORU_TABLOLARI, ...OYUN_TABLOLARI]) {
    // head:true tablo yokken hatayı bastırabiliyor; gerçek select kullan
    const { error } = await admin.from(t).select('*').limit(1)
    if (error) yok.push(`${t}: ${error.message}`)
  }
  rapor(`${SORU_TABLOLARI.length} soru tablosu mevcut`, !SORU_TABLOLARI.some((t) => yok.some((y) => y.startsWith(`${t}:`))))
  rapor(`${OYUN_TABLOLARI.length} oyun tablosu mevcut`, !OYUN_TABLOLARI.some((t) => yok.some((y) => y.startsWith(`${t}:`))))
  for (const y of yok) console.log(`   eksik/hatalı → ${y}`)

  // 2. Storage kovaları
  const { data: kovalar, error: kovaHata } = await admin.storage.listBuckets()
  const kovaAdlari = (kovalar ?? []).map((b) => b.name)
  for (const k of ['avatars', 'soru-gorselleri']) {
    rapor(`storage kovası '${k}' mevcut`, !kovaHata && kovaAdlari.includes(k), kovaHata?.message)
  }

  // 3. Anon client soru tablosundan okuyamamalı (dogru_sik sızmamalı)
  const anon = createClient(url!, anonKey!, { auth: { persistSession: false } })
  const { data: oturum, error: girisHata } = await anon.auth.signInAnonymously()
  rapor('anonim giriş', !girisHata && !!oturum.user, girisHata?.message)

  const sizdi = async (tablo: string, sutun: string) => {
    const { data, error } = await anon.from(tablo).select(sutun).limit(1)
    return { sizdi: !error && (data?.length ?? 0) > 0, error }
  }
  for (const t of ['matematik_tyt', 'fizik_ayt', ...LGS_TABLOLARI]) {
    const s = await sizdi(t, 'dogru_sik')
    rapor(`anon ${t} tablosundan dogru_sik okuyamıyor`, !s.sizdi, s.error ? 'hata verdi' : 'boş döndü')
  }
  for (const t of ['answers', 'game_questions']) {
    const s = await sizdi(t, '*')
    rapor(`anon ${t} tablosunu okuyamıyor`, !s.sizdi)
  }

  // 4. Anon istemci doğrudan yazamamalı
  const { error: yazmaHata } = await anon
    .from('global_scores')
    .insert({ user_id: oturum.user?.id, total_points: 999 })
  rapor('anon global_scores tablosuna yazamıyor', !!yazmaHata)

  // 5. XP/rank şeması (0003_lgs_xp.sql)
  const { count: rankSayisi, error: rankHata } = await admin
    .from('rank_tiers')
    .select('*', { count: 'exact', head: true })
  rapor('rank_tiers 14 satır', !rankHata && rankSayisi === 14, rankHata?.message ?? `${rankSayisi}`)

  const { error: sinavHata } = await admin.from('games').select('sinav').limit(1)
  rapor('games.sinav sütunu var', !sinavHata, sinavHata?.message)

  const { error: rankYazmaHata } = await anon
    .from('rank_tiers')
    .insert({ min_xp: 99999, rank_key: 'test', rank_label: 'Test' })
  rapor('anon rank_tiers tablosuna yazamıyor', !!rankYazmaHata)

  const { error: statYazmaHata } = await anon
    .from('player_stats')
    .insert({ user_id: oturum.user?.id, xp: 99999 })
  rapor('anon player_stats tablosuna yazamıyor', !!statYazmaHata)

  // Yazma gerçekten engellendiyse tabloda iz kalmamalı
  const { count: sizanRank } = await admin
    .from('rank_tiers')
    .select('*', { count: 'exact', head: true })
    .eq('min_xp', 99999)
  rapor('rank_tiers tablosunda test satırı kalmadı', sizanRank === 0)

  // Test kullanıcısını temizle
  if (oturum.user) await admin.auth.admin.deleteUser(oturum.user.id)

  if (basarisiz > 0) {
    console.error(`\nHATA: ${basarisiz} kontrol kaldı`)
    process.exit(1)
  }
  console.log('\nOK — tüm kontroller geçti')
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
