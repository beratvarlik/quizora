// Soru durumu: 24 tablodaki aktif soru sayıları ve 6 kategorinin hazır olup olmadığı.
// Kullanım: npx tsx scripts/soru-durumu.ts
// Yalnızca okur. [TEST] etiketli sorular ayrıca sayılır; "gerçek" = TEST olmayan aktif sorular.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { KATEGORI_DAGILIMI, TEST_ETIKETI, TUM_TABLOLAR } from './lib-sorular.ts'

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

const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })

interface Sayilar {
  aktif: number
  test: number
  gercek: number
  eksikAciklama: number // gerçek (TEST olmayan) aktif sorulardan cozum_aciklamasi boş olanlar
}

async function say(tablo: string): Promise<Sayilar> {
  const toplam = await admin.from(tablo).select('*', { count: 'exact', head: true }).eq('aktif', true)
  if (toplam.error) throw new Error(`${tablo}: ${toplam.error.message}`)
  const test = await admin
    .from(tablo)
    .select('*', { count: 'exact', head: true })
    .eq('aktif', true)
    .like('soru_metni', `${TEST_ETIKETI}%`)
  if (test.error) throw new Error(`${tablo}: ${test.error.message}`)
  const aktif = toplam.count ?? 0
  const testSayisi = test.count ?? 0
  const eksik = await admin
    .from(tablo)
    .select('*', { count: 'exact', head: true })
    .eq('aktif', true)
    .not('soru_metni', 'like', `${TEST_ETIKETI}%`)
    .is('cozum_aciklamasi', null)
  if (eksik.error) throw new Error(`${tablo}: ${eksik.error.message}`)
  return { aktif, test: testSayisi, gercek: aktif - testSayisi, eksikAciklama: eksik.count ?? 0 }
}

// Kategori için eksik tablolar: "fizik_ayt (1 eksik)"; eksik yoksa boş dizi
function eksikler(kategori: string, mevcut: (tablo: string) => number): string[] {
  const liste: string[] = []
  for (const [tablo, gereken] of Object.entries(KATEGORI_DAGILIMI[kategori])) {
    const fark = gereken - mevcut(tablo)
    if (fark > 0) liste.push(`${tablo} (${fark} eksik)`)
  }
  return liste
}

const durumYazisi = (eksik: string[]): string => (eksik.length === 0 ? 'HAZIR' : `EKSİK: ${eksik.join(', ')}`)

async function main(): Promise<void> {
  const sonuc: Record<string, Sayilar> = {}
  for (const t of TUM_TABLOLAR) sonuc[t] = await say(t)

  const genislik = Math.max(5, ...TUM_TABLOLAR.map((t) => t.length))
  console.log(`${'TABLO'.padEnd(genislik)}  ${'AKTİF'.padStart(6)}  ${'[TEST]'.padStart(6)}  ${'GERÇEK'.padStart(6)}  ${'AÇIKLAMASI EKSİK'.padStart(16)}`)
  console.log(`${'-'.repeat(genislik)}  ${'-'.repeat(6)}  ${'-'.repeat(6)}  ${'-'.repeat(6)}  ${'-'.repeat(16)}`)
  let toplamAktif = 0
  let toplamTest = 0
  let toplamEksikAciklama = 0
  for (const t of TUM_TABLOLAR) {
    const s = sonuc[t]
    toplamAktif += s.aktif
    toplamTest += s.test
    toplamEksikAciklama += s.eksikAciklama
    console.log(`${t.padEnd(genislik)}  ${String(s.aktif).padStart(6)}  ${String(s.test).padStart(6)}  ${String(s.gercek).padStart(6)}  ${String(s.eksikAciklama).padStart(16)}`)
  }
  console.log(`${'TOPLAM'.padEnd(genislik)}  ${String(toplamAktif).padStart(6)}  ${String(toplamTest).padStart(6)}  ${String(toplamAktif - toplamTest).padStart(6)}  ${String(toplamEksikAciklama).padStart(16)}`)

  console.log('\nKATEGORİ DURUMU (gereken adetler docs/PROJE.md dağılımına göre)')
  const gercekHazir: string[] = []
  for (const kategori of Object.keys(KATEGORI_DAGILIMI)) {
    const tumu = eksikler(kategori, (t) => sonuc[t].aktif)
    const gercek = eksikler(kategori, (t) => sonuc[t].gercek)
    if (gercek.length === 0) gercekHazir.push(kategori)
    console.log(`\n${kategori}`)
    console.log(`  tüm aktif sorularla (TEST dahil): ${durumYazisi(tumu)}`)
    console.log(`  gerçek sorularla (TEST hariç)   : ${durumYazisi(gercek)}`)
  }

  console.log('\nGerçek sorularla hazır kategoriler:')
  console.log(gercekHazir.length > 0 ? `  ${gercekHazir.join(', ')}` : '  (henüz yok)')
  if (toplamEksikAciklama > 0) {
    console.log(`
Not: ${toplamEksikAciklama} gerçek sorunun çözüm açıklaması eksik (yarış sonrası incelemede "açıklama henüz eklenmedi" görünür). Yüklemek için: npx tsx scripts/aciklama-yukle.ts <dosya.csv>`)
  }
  if (toplamTest > 0) {
    console.log(`\nNot: ${toplamTest} [TEST] sorusu var. Demo öncesi temizlemek için: npx tsx scripts/seed-test-questions.ts --temizle`)
  }
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
