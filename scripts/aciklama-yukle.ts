// Mevcut sorulara çözüm açıklaması yükleme aracı (service role). Yeni paket gerektirmez.
//
// Kullanım:
//   npx tsx scripts/aciklama-yukle.ts <dosya.csv> [--dry-run]
//
// Sütunlar (başlık satırı zorunlu): tablo, soru_metni, cozum_aciklamasi
// Eşleştirme: aynı tabloda soru_metni (boşluk ve satır sonları normalize edilerek) birebir eşleşen
// satırın cozum_aciklamasi güncellenir. Eşleşmeyen satır diğerlerini durdurmaz.
// Ayrıntı: docs/SORU-EKLEME.md
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { csvAyristir } from './import-questions.ts'
import { TUM_TABLOLAR } from './lib-sorular.ts'

config({ path: '.env.local' })

const MAKS_UZUNLUK = 400
const SUTUNLAR = ['tablo', 'soru_metni', 'cozum_aciklamasi']

// Boşluk ve satır sonlarını tek boşluğa indirir (eşleştirme için)
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

interface Sayac {
  guncellenen: number
  eslesmeyen: number
  uzun: number
  bos: number
}

async function main(): Promise<void> {
  const dosya = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const dryRun = process.argv.includes('--dry-run')
  if (!dosya) {
    console.error('Kullanım: npx tsx scripts/aciklama-yukle.ts <dosya.csv> [--dry-run]')
    process.exit(1)
  }
  if (!existsSync(dosya)) {
    console.error(`HATA: CSV dosyası bulunamadı: ${dosya}`)
    process.exit(1)
  }
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const eksikEnv = [
    ['VITE_SUPABASE_URL', url],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n)
  if (eksikEnv.length > 0) {
    console.error(`HATA: .env.local içinde eksik değişken: ${eksikEnv.join(', ')}`)
    process.exit(1)
  }

  const { ayirici, kayitlar, kapanmayanTirnakSatiri } = csvAyristir(readFileSync(dosya, 'utf8'))
  if (kapanmayanTirnakSatiri !== null) {
    console.error(`HATA: satır ${kapanmayanTirnakSatiri}: tırnak (") açılmış ama kapanmamış. Hiçbir şey yüklenmedi.`)
    process.exit(1)
  }
  if (kayitlar.length === 0) {
    console.error('HATA: CSV boş. Başlık satırı zorunludur.')
    process.exit(1)
  }
  const baslik = kayitlar[0].alanlar.map((a) => a.trim().toLowerCase())
  const eksik = SUTUNLAR.filter((s) => !baslik.includes(s))
  if (eksik.length > 0) {
    console.error(`HATA: başlık satırında eksik sütun: ${eksik.join(', ')}`)
    console.error(`Beklenen başlık: ${SUTUNLAR.join(', ')} (algılanan ayırıcı: '${ayirici}')`)
    process.exit(1)
  }
  const no = (ad: string): number => baslik.indexOf(ad)

  console.log(`${dryRun ? '[DRY-RUN — hiçbir şey yazılmayacak] ' : ''}${dosya} okunuyor (ayırıcı: '${ayirici}', ${kayitlar.length - 1} veri satırı)\n`)

  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
  const sayac: Record<string, Sayac> = {}
  const al = (t: string): Sayac => (sayac[t] ??= { guncellenen: 0, eslesmeyen: 0, uzun: 0, bos: 0 })
  const hatalar: { no: number; mesaj: string }[] = []
  const hata = (n: number, mesaj: string): void => {
    hatalar.push({ no: n, mesaj })
  }

  // Tablo başına soru listesi bir kez çekilir: normalize metin → id'ler
  const onbellek = new Map<string, Map<string, string[]>>()
  async function tabloHaritasi(tablo: string): Promise<Map<string, string[]>> {
    const var_olan = onbellek.get(tablo)
    if (var_olan) return var_olan
    const harita = new Map<string, string[]>()
    for (let bas = 0; ; bas += 1000) {
      const { data, error } = await admin.from(tablo).select('id, soru_metni').range(bas, bas + 999)
      if (error) throw new Error(`${tablo}: ${error.message}`)
      for (const r of data ?? []) {
        const k = norm(r.soru_metni as string)
        harita.set(k, [...(harita.get(k) ?? []), r.id as string])
      }
      if ((data ?? []).length < 1000) break
    }
    onbellek.set(tablo, harita)
    return harita
  }

  for (const kayit of kayitlar.slice(1)) {
    const alan = (ad: string): string => (kayit.alanlar[no(ad)] ?? '').trim()
    const tablo = alan('tablo').toLowerCase()
    if (!TUM_TABLOLAR.includes(tablo)) {
      al('(geçersiz tablo)').eslesmeyen++
      hata(kayit.no, `tablo adı geçersiz: '${alan('tablo')}'. Geçerli adlar docs/SORU-EKLEME.md içinde`)
      continue
    }
    const metin = norm(alan('soru_metni'))
    const aciklama = alan('cozum_aciklamasi')
    if (metin === '') {
      al(tablo).eslesmeyen++
      hata(kayit.no, `(${tablo}) soru_metni boş`)
      continue
    }
    if (aciklama === '') {
      al(tablo).bos++
      hata(kayit.no, `(${tablo}) cozum_aciklamasi boş, atlandı`)
      continue
    }
    if (aciklama.length > MAKS_UZUNLUK) {
      al(tablo).uzun++
      hata(kayit.no, `(${tablo}) cozum_aciklamasi ${aciklama.length} karakter; en çok ${MAKS_UZUNLUK} olabilir, atlandı`)
      continue
    }

    const ids = (await tabloHaritasi(tablo)).get(metin)
    if (!ids || ids.length === 0) {
      al(tablo).eslesmeyen++
      hata(kayit.no, `(${tablo}) bu soru metniyle eşleşen soru bulunamadı: '${metin.slice(0, 60)}${metin.length > 60 ? '…' : ''}'`)
      continue
    }
    if (!dryRun) {
      const { error } = await admin.from(tablo).update({ cozum_aciklamasi: aciklama }).in('id', ids)
      if (error) {
        hata(kayit.no, `(${tablo}) güncellenemedi: ${error.message}`)
        continue
      }
    }
    al(tablo).guncellenen++
  }

  if (hatalar.length > 0) {
    console.log('')
    for (const h of [...hatalar].sort((x, y) => x.no - y.no)) console.error(`HATA — satır ${h.no}: ${h.mesaj}`)
  }

  const etiket = dryRun ? 'GÜNCELLENECEK' : 'GÜNCELLENEN'
  const tablolar = Object.keys(sayac).sort()
  const g = Math.max(5, ...tablolar.map((t) => t.length))
  console.log(`\n${'TABLO'.padEnd(g)}  ${etiket.padStart(13)}  ${'EŞLEŞMEYEN'.padStart(10)}  ${'400+ KARAKTER'.padStart(13)}  ${'BOŞ'.padStart(4)}`)
  console.log(`${'-'.repeat(g)}  ${'-'.repeat(13)}  ${'-'.repeat(10)}  ${'-'.repeat(13)}  ${'-'.repeat(4)}`)
  const top: Sayac = { guncellenen: 0, eslesmeyen: 0, uzun: 0, bos: 0 }
  for (const t of tablolar) {
    const s = sayac[t]
    top.guncellenen += s.guncellenen
    top.eslesmeyen += s.eslesmeyen
    top.uzun += s.uzun
    top.bos += s.bos
    console.log(`${t.padEnd(g)}  ${String(s.guncellenen).padStart(13)}  ${String(s.eslesmeyen).padStart(10)}  ${String(s.uzun).padStart(13)}  ${String(s.bos).padStart(4)}`)
  }
  console.log(`${'TOPLAM'.padEnd(g)}  ${String(top.guncellenen).padStart(13)}  ${String(top.eslesmeyen).padStart(10)}  ${String(top.uzun).padStart(13)}  ${String(top.bos).padStart(4)}`)

  if (dryRun) console.log('\nDRY-RUN: hiçbir şey yazılmadı.')
  if (hatalar.length > 0) {
    console.error(`\n${hatalar.length} satır sorunluydu${dryRun ? '' : ' (geçerli satırlar yine de güncellendi)'}. Düzeltip dosyayı tekrar çalıştırabilirsin; aynı açıklama tekrar yazılması güvenlidir.`)
    process.exit(1)
  }
  console.log('\nOK')
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
