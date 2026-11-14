// Demo botlarını oluşturur / siler (service role). Yeni paket gerektirmez.
//
// Kullanım:
//   npx tsx scripts/bot-olustur.ts           (4 bot hesabı + profil + bot_profilleri; tekrar çalıştırmak güvenli)
//   npx tsx scripts/bot-olustur.ts --sil     (botları ve hesaplarını kaldırır)
//
// Önce supabase/migrations/0013_demo_botlari.sql uygulanmış olmalı.
// Bot hesapları: bot-1..4@quizora.invalid, rastgele güçlü şifre (şifre ASLA yazdırılmaz ve saklanmaz;
// bu hesaplarla giriş yapılamaz). Adları "(bot)" ile biter; profiles.is_bot = true.
// Botlar yalnızca app_settings.bot_modu = 'acik' iken lobilere katılır (varsayılan 'kapali'). Ayrıntı: docs/PROJE.md "Demo botları".
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'

config({ path: '.env.local' })

interface BotTanimi {
  eposta: string
  ad: string
  avatar: string // public/avatars/<anahtar>.webp (anahtar biçimi: 'avatar-N', N = 1…24)
  ortSureSn: number
  dogruluk: number
}

const BOTLAR: BotTanimi[] = [
  { eposta: 'bot-1@quizora.invalid', ad: 'Ada (bot)', avatar: 'avatar-3', ortSureSn: 6.5, dogruluk: 0.7 }, // hızlı: 2× modunu tetikler
  { eposta: 'bot-2@quizora.invalid', ad: 'Mert (bot)', avatar: 'avatar-9', ortSureSn: 9, dogruluk: 0.6 },
  { eposta: 'bot-3@quizora.invalid', ad: 'Zeynep (bot)', avatar: 'avatar-15', ortSureSn: 11, dogruluk: 0.55 },
  { eposta: 'bot-4@quizora.invalid', ad: 'Can (bot)', avatar: 'avatar-21', ortSureSn: 8, dogruluk: 0.65 },
]

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const eksik = [
  ['VITE_SUPABASE_URL', url],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
]
  .filter(([, v]) => !v)
  .map(([n]) => n)
if (eksik.length > 0) {
  console.error(`HATA: .env.local içinde eksik değişken: ${eksik.join(', ')}`)
  process.exit(1)
}

const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })

// e-posta → kullanıcı id (sayfalayarak)
async function kullaniciBul(eposta: string): Promise<string | null> {
  for (let sayfa = 1; sayfa <= 50; sayfa++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: sayfa, perPage: 1000 })
    if (error) throw new Error(`kullanıcı listesi: ${error.message}`)
    const bulunan = data.users.find((u) => u.email?.toLowerCase() === eposta)
    if (bulunan) return bulunan.id
    if (data.users.length < 1000) break
  }
  return null
}

async function olustur(): Promise<void> {
  // 0013 uygulanmış mı?
  const kontrol = await admin.from('bot_profilleri').select('user_id').limit(1)
  if (kontrol.error) {
    console.error(`HATA: bot_profilleri tablosu okunamadı (${kontrol.error.message}). Önce supabase/migrations/0013_demo_botlari.sql'i SQL Editor'de çalıştırın.`)
    process.exit(1)
  }

  for (const b of BOTLAR) {
    let id = await kullaniciBul(b.eposta)
    const yeni = id === null
    if (id === null) {
      // Rastgele güçlü şifre: hiçbir yere yazdırılmaz/saklanmaz (bot hesabıyla giriş yapılamaz)
      const { data, error } = await admin.auth.admin.createUser({
        email: b.eposta,
        password: randomBytes(32).toString('base64url'),
        email_confirm: true,
      })
      if (error || !data.user) throw new Error(`${b.eposta}: hesap oluşturulamadı (${error?.message})`)
      id = data.user.id
    }

    // Avatar dosyası yoksa avatarsız bırak (arayüz baş harf gösterir)
    const avatarVar = existsSync(`public/avatars/${b.avatar}.webp`)
    const { error: pErr } = await admin
      .from('profiles')
      .upsert({ id, display_name: b.ad, avatar_key: avatarVar ? b.avatar : null, is_bot: true })
    if (pErr) throw new Error(`${b.ad}: profil yazılamadı (${pErr.message})`)

    const { error: bErr } = await admin
      .from('bot_profilleri')
      .upsert({ user_id: id, dogruluk: b.dogruluk, ort_sure_sn: b.ortSureSn })
    if (bErr) throw new Error(`${b.ad}: bot_profilleri yazılamadı (${bErr.message})`)

    console.log(`${yeni ? 'oluşturuldu' : 'güncellendi'} — ${b.ad}: ort ${b.ortSureSn} sn, doğruluk ${b.dogruluk}`)
  }

  const { data: ayar } = await admin.from('app_settings').select('value').eq('key', 'bot_modu').maybeSingle()
  console.log(`\nbot_modu şu an: '${ayar?.value ?? '(yok)'}'`)
  console.log("Botları açmak için SQL Editor'de: update app_settings set value = 'acik' where key = 'bot_modu';")
  console.log("Kapatmak için:                    update app_settings set value = 'kapali' where key = 'bot_modu';")
  console.log('\nOK')
}

async function sil(): Promise<void> {
  const idler: string[] = []
  const { data: profiller, error } = await admin.from('profiles').select('id').eq('is_bot', true)
  if (error) throw new Error(`profiles: ${error.message}`)
  for (const p of profiller ?? []) idler.push(p.id as string)
  for (const b of BOTLAR) {
    const id = await kullaniciBul(b.eposta)
    if (id && !idler.includes(id)) idler.push(id)
  }
  if (idler.length === 0) {
    console.log('Silinecek bot yok.')
    console.log('\nOK')
    return
  }

  // Bot kayıtlarına bağlı satırlar (profiles'a FK'ler cascade değil): önce bunlar
  await admin.from('answers').delete().in('user_id', idler)
  await admin.from('game_players').delete().in('user_id', idler)
  await admin.from('player_stats').delete().in('user_id', idler)
  await admin.from('games').update({ winner_id: null }).in('winner_id', idler)
  await admin.from('games').update({ speedup_by: null }).in('speedup_by', idler)
  await admin.from('games').delete().in('host_id', idler) // bot host olmaz; olduysa o oyun silinir

  for (const id of idler) {
    await admin.from('bot_profilleri').delete().eq('user_id', id)
    const { error: e1 } = await admin.from('profiles').delete().eq('id', id)
    if (e1) throw new Error(`profil silinemedi: ${e1.message}`)
    const { error: e2 } = await admin.auth.admin.deleteUser(id)
    if (e2) throw new Error(`hesap silinemedi: ${e2.message}`)
  }
  console.log(`${idler.length} bot ve hesapları silindi.`)
  console.log('\nOK')
}

;(process.argv.includes('--sil') ? sil() : olustur()).catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
