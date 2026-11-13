// !!! BU ARAÇ YALNIZCA DEMO HAZIRLIĞI İÇİNDİR !!!
// Service role ile bir oyuncunun XP'sini doğrudan ayarlar (oyun kuralları atlanır).
// Amaç: demoda oyuncunun XP'sini rank eşiğinin hemen altına koyup sunum sırasında rank atlamasını göstermek.
//
// Kullanım:
//   npx tsx scripts/xp-ayarla.ts "<oyuncu adı>" <xp>
// Örnek (Bronz I eşiği 100 XP, eşiğin hemen altı 95):
//   npx tsx scripts/xp-ayarla.ts "Ayşe" 95
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

console.log('==========================================================')
console.log(' BU ARAÇ YALNIZCA DEMO HAZIRLIĞI İÇİNDİR')
console.log(' Gerçek oyuncuların XP\'sini değiştirmek için kullanma.')
console.log('==========================================================\n')

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const missing = [
  ['VITE_SUPABASE_URL', url],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  console.error(`HATA: .env.local içinde eksik değişken: ${missing.join(', ')}`)
  process.exit(1)
}

const [adArg, xpArg] = process.argv.slice(2)
const xp = Number(xpArg)
if (!adArg || xpArg === undefined || !Number.isInteger(xp) || xp < 0) {
  console.error('Kullanım: npx tsx scripts/xp-ayarla.ts "<oyuncu adı>" <xp>')
  console.error('xp, 0 veya daha büyük bir tam sayı olmalı.')
  process.exit(1)
}

const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })

async function main(): Promise<void> {
  // Oyuncuyu görünen ada göre bul
  const { data: profiller, error } = await admin
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('display_name', adArg)
  if (error) throw new Error(`profiles: ${error.message}`)

  if (!profiller || profiller.length === 0) {
    console.error(`HATA: "${adArg}" adında oyuncu bulunamadı (ad büyük/küçük harfe duyarlıdır).`)
    process.exit(1)
  }
  if (profiller.length > 1) {
    console.error(`HATA: "${adArg}" adında ${profiller.length} oyuncu var, hangisi olduğu belirsiz. Hiçbir şey değiştirilmedi:`)
    for (const p of profiller) console.error(`  - ${p.id} (oluşturulma: ${p.created_at})`)
    process.exit(1)
  }
  const profil = profiller[0]

  // player_stats satırı: varsa yalnızca xp güncellenir (wins/games_played korunur), yoksa eklenir
  const { data: mevcut, error: okuHata } = await admin.from('player_stats').select('xp').eq('user_id', profil.id).maybeSingle()
  if (okuHata) throw new Error(`player_stats: ${okuHata.message}`)
  const eskiXp = mevcut?.xp ?? null

  if (mevcut) {
    const { error: guncelleHata } = await admin
      .from('player_stats')
      .update({ xp, updated_at: new Date().toISOString() })
      .eq('user_id', profil.id)
    if (guncelleHata) throw new Error(`player_stats güncelleme: ${guncelleHata.message}`)
  } else {
    const { error: eklemeHata } = await admin.from('player_stats').insert({ user_id: profil.id, xp })
    if (eklemeHata) throw new Error(`player_stats ekleme: ${eklemeHata.message}`)
  }

  // Yeni rank ve sonraki ranka kalan XP
  const { data: tiers, error: rankHata } = await admin
    .from('rank_tiers')
    .select('min_xp, rank_label')
    .order('min_xp', { ascending: true })
  if (rankHata || !tiers) throw new Error(`rank_tiers: ${rankHata?.message}`)
  const mevcutRank = [...tiers].reverse().find((t) => t.min_xp <= xp)
  const sonraki = tiers.find((t) => t.min_xp > xp)

  console.log(`Oyuncu: ${profil.display_name} (${profil.id})`)
  console.log(`XP: ${eskiXp === null ? '(kayıt yoktu)' : eskiXp} → ${xp}`)
  console.log(`Rank: ${mevcutRank?.rank_label ?? '?'}`)
  console.log(sonraki ? `Sonraki rank: ${sonraki.rank_label} (${sonraki.min_xp - xp} XP kaldı)` : 'En üst rank (sonraki rank yok)')
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
