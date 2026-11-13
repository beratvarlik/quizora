import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

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

const TABLOLAR = [
  'matematik_tyt', 'turkce_tyt', 'kimya_tyt', 'fizik_tyt', 'biyoloji_tyt',
  'tarih_tyt', 'cografya_tyt', 'felsefe_tyt', 'din_kulturu_tyt',
  'fizik_ayt', 'kimya_ayt', 'biyoloji_ayt', 'matematik_ayt', 'edebiyat_ayt',
  'tarih_ayt', 'cografya_ayt', 'felsefe_ayt', 'din_kulturu_ayt',
  // LGS (0003_lgs_xp.sql)
  'turkce_lgs', 'inkilap_lgs', 'din_kulturu_lgs',
  'ingilizce_lgs', 'matematik_lgs', 'fen_lgs',
]
const ADET = 8
const ETIKET = '[TEST]'
const SIKLAR = ['A', 'B', 'C', 'D', 'E']
const SIKLAR_LGS = ['A', 'B', 'C', 'D'] // LGS soruları 4 şıklıdır (0007_lgs_4_sik.sql)
const LGS_TABLOLARI = ['turkce_lgs', 'inkilap_lgs', 'din_kulturu_lgs', 'ingilizce_lgs', 'matematik_lgs', 'fen_lgs']

const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })

async function temizle() {
  for (const t of TABLOLAR) {
    const { error, count } = await admin
      .from(t)
      .delete({ count: 'exact' })
      .like('soru_metni', `${ETIKET}%`)
    if (error) throw new Error(`${t}: ${error.message}`)
    console.log(`${t}: ${count ?? 0} test sorusu silindi`)
  }
}

async function ekle() {
  for (const t of TABLOLAR) {
    const { data, error } = await admin.from(t).select('soru_metni').like('soru_metni', `${ETIKET}%`)
    if (error) throw new Error(`${t}: ${error.message}`)
    const var_olan = new Set((data ?? []).map((r) => r.soru_metni as string))

    const lgs = LGS_TABLOLARI.includes(t)
    const siklar = lgs ? SIKLAR_LGS : SIKLAR
    const yeni = []
    for (let i = 1; i <= ADET; i++) {
      const metin = `${ETIKET} ${t} örnek soru ${i}`
      if (var_olan.has(metin)) continue
      yeni.push({
        soru_metni: metin,
        secenek_a: 'Seçenek A',
        secenek_b: 'Seçenek B',
        secenek_c: 'Seçenek C',
        secenek_d: 'Seçenek D',
        secenek_e: lgs ? null : 'Seçenek E', // LGS: 4 şık, E boş
        dogru_sik: siklar[i % siklar.length],
        aciklama: 'Test sorusu',
      })
    }
    if (yeni.length === 0) {
      console.log(`${t}: zaten ${ADET} test sorusu var, atlandı`)
      continue
    }
    const { error: insError } = await admin.from(t).insert(yeni)
    if (insError) throw new Error(`${t}: ${insError.message}`)
    console.log(`${t}: ${yeni.length} test sorusu eklendi`)
  }
}

async function main() {
  if (process.argv.includes('--temizle')) await temizle()
  else await ekle()
  console.log('OK')
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
