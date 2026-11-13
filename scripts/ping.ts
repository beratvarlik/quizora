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

async function main() {
  const anon = createClient(url!, anonKey!, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInAnonymously()
  if (error || !data.user) {
    throw new Error(
      `Anonim giriş başarısız (Authentication > Providers'ta Anonymous sign-ins açık mı?): ${error?.message}`,
    )
  }
  console.log(`Anonim giriş başarılı: ${data.user.id}`)

  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
  const { error: adminError } = await admin.auth.admin.listUsers({ perPage: 1 })
  if (adminError) {
    throw new Error(`Yönetici (service role) sorgusu başarısız: ${adminError.message}`)
  }
  console.log('Yönetici sorgusu başarılı')

  // Test kullanıcısını temizle
  await admin.auth.admin.deleteUser(data.user.id)

  console.log('OK')
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
