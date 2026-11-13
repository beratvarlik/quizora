// Mevcut sorulara konu (topic) yükleme aracı (service role). Yeni paket gerektirmez.
//
// Kullanım:
//   npx tsx scripts/konu-yukle.ts <dosya.csv> [--dry-run]
//   npx tsx scripts/konu-yukle.ts scripts/konu-atamalari.csv     (94 gerçek sorunun konuları)
//
// Sütunlar (başlık satırı zorunlu): tablo, topic ve şunlardan biri: id | soru_metni
//   id          : sorunun uuid'i (en güvenlisi; scripts/konu-atamalari.csv bunu kullanır)
//   soru_metni  : aynı tabloda soru_metni (boşluk ve satır sonları normalize edilerek) birebir eşleşen satır
// Diğer sütunlar (örn. soru_baslangici) yok sayılır. Eşleşmeyen satır diğerlerini durdurmaz.
// Ayrıca: [TEST] etiketli ve konusu boş sorulara 'Test Konusu 1' yazılır (arayüz geliştirme verisi).
// Ayrıntı: docs/SORU-EKLEME.md
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { csvAyristir } from './import-questions.ts'
import { TEST_ETIKETI, TUM_TABLOLAR } from './lib-sorular.ts'

config({ path: '.env.local' })

const MAKS_UZUNLUK = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()

interface Sayac {
  guncellenen: number
  eslesmeyen: number
  gecersiz: number
}

async function main(): Promise<void> {
  const dosya = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const dryRun = process.argv.includes('--dry-run')
  if (!dosya) {
    console.error('Kullanım: npx tsx scripts/konu-yukle.ts <dosya.csv> [--dry-run]')
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
  const eksik = ['tablo', 'topic'].filter((s) => !baslik.includes(s))
  if (eksik.length > 0 || (!baslik.includes('id') && !baslik.includes('soru_metni'))) {
    console.error(`HATA: başlık satırında eksik sütun: ${[...eksik, ...(baslik.includes('id') || baslik.includes('soru_metni') ? [] : ['id veya soru_metni'])].join(', ')}`)
    console.error(`Beklenen başlık: tablo, id (ya da soru_metni), topic (algılanan ayırıcı: '${ayirici}')`)
    process.exit(1)
  }
  const no = (ad: string): number => baslik.indexOf(ad)

  console.log(`${dryRun ? '[DRY-RUN — hiçbir şey yazılmayacak] ' : ''}${dosya} okunuyor (ayırıcı: '${ayirici}', ${kayitlar.length - 1} veri satırı)\n`)

  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
  const sayac: Record<string, Sayac> = {}
  const al = (t: string): Sayac => (sayac[t] ??= { guncellenen: 0, eslesmeyen: 0, gecersiz: 0 })
  const hatalar: { no: number; mesaj: string }[] = []
  const hata = (n: number, mesaj: string): void => {
    hatalar.push({ no: n, mesaj })
  }

  // Tablo başına soru listesi bir kez çekilir
  interface Harita {
    idler: Set<string>
    metinler: Map<string, string[]>
  }
  const onbellek = new Map<string, Harita>()
  async function tabloHaritasi(tablo: string): Promise<Harita> {
    const var_olan = onbellek.get(tablo)
    if (var_olan) return var_olan
    const h: Harita = { idler: new Set(), metinler: new Map() }
    for (let bas = 0; ; bas += 1000) {
      const { data, error } = await admin.from(tablo).select('id, soru_metni').range(bas, bas + 999)
      if (error) throw new Error(`${tablo}: ${error.message}`)
      for (const r of data ?? []) {
        h.idler.add(r.id as string)
        const k = norm(r.soru_metni as string)
        h.metinler.set(k, [...(h.metinler.get(k) ?? []), r.id as string])
      }
      if ((data ?? []).length < 1000) break
    }
    onbellek.set(tablo, h)
    return h
  }

  for (const kayit of kayitlar.slice(1)) {
    const alan = (ad: string): string => (no(ad) >= 0 ? (kayit.alanlar[no(ad)] ?? '').trim() : '')
    const tablo = alan('tablo').toLowerCase()
    if (!TUM_TABLOLAR.includes(tablo)) {
      al('(geçersiz tablo)').gecersiz++
      hata(kayit.no, `tablo adı geçersiz: '${alan('tablo')}'. Geçerli adlar docs/SORU-EKLEME.md içinde`)
      continue
    }
    const topic = alan('topic')
    if (topic === '' || topic.length > MAKS_UZUNLUK) {
      al(tablo).gecersiz++
      hata(kayit.no, `(${tablo}) topic ${topic === '' ? 'boş' : `${topic.length} karakter; en çok ${MAKS_UZUNLUK} olabilir`}, atlandı`)
      continue
    }

    const harita = await tabloHaritasi(tablo)
    let ids: string[] | undefined
    const id = alan('id')
    if (id !== '') {
      if (!UUID.test(id)) {
        al(tablo).gecersiz++
        hata(kayit.no, `(${tablo}) id uuid biçiminde değil: '${id}'`)
        continue
      }
      ids = harita.idler.has(id.toLowerCase()) ? [id.toLowerCase()] : undefined
    } else {
      const metin = norm(alan('soru_metni'))
      if (metin === '') {
        al(tablo).gecersiz++
        hata(kayit.no, `(${tablo}) hem id hem soru_metni boş`)
        continue
      }
      ids = harita.metinler.get(metin)
    }
    if (!ids || ids.length === 0) {
      al(tablo).eslesmeyen++
      hata(kayit.no, `(${tablo}) eşleşen soru bulunamadı: '${id !== '' ? id : norm(alan('soru_metni')).slice(0, 60)}'`)
      continue
    }
    if (!dryRun) {
      const { error } = await admin.from(tablo).update({ topic }).in('id', ids)
      if (error) {
        hata(kayit.no, `(${tablo}) güncellenemedi: ${error.message}`)
        continue
      }
    }
    al(tablo).guncellenen++
  }

  // [TEST] sorularının boş konusunu doldur
  let testDolan = 0
  for (const t of TUM_TABLOLAR) {
    const { count, error } = await admin
      .from(t)
      .select('*', { count: 'exact', head: true })
      .like('soru_metni', `${TEST_ETIKETI}%`)
      .is('topic', null)
    if (error) throw new Error(`${t}: ${error.message}`)
    if ((count ?? 0) === 0) continue
    if (!dryRun) {
      const { error: e2 } = await admin.from(t).update({ topic: 'Test Konusu 1' }).like('soru_metni', `${TEST_ETIKETI}%`).is('topic', null)
      if (e2) throw new Error(`${t}: ${e2.message}`)
    }
    testDolan += count ?? 0
  }

  if (hatalar.length > 0) {
    console.log('')
    for (const h of [...hatalar].sort((x, y) => x.no - y.no)) console.error(`HATA — satır ${h.no}: ${h.mesaj}`)
  }

  const etiket = dryRun ? 'GÜNCELLENECEK' : 'GÜNCELLENEN'
  const tablolar = Object.keys(sayac).sort()
  const g = Math.max(5, ...tablolar.map((t) => t.length))
  console.log(`\n${'TABLO'.padEnd(g)}  ${etiket.padStart(13)}  ${'EŞLEŞMEYEN'.padStart(10)}  ${'GEÇERSİZ'.padStart(8)}`)
  console.log(`${'-'.repeat(g)}  ${'-'.repeat(13)}  ${'-'.repeat(10)}  ${'-'.repeat(8)}`)
  const top: Sayac = { guncellenen: 0, eslesmeyen: 0, gecersiz: 0 }
  for (const t of tablolar) {
    const s = sayac[t]
    top.guncellenen += s.guncellenen
    top.eslesmeyen += s.eslesmeyen
    top.gecersiz += s.gecersiz
    console.log(`${t.padEnd(g)}  ${String(s.guncellenen).padStart(13)}  ${String(s.eslesmeyen).padStart(10)}  ${String(s.gecersiz).padStart(8)}`)
  }
  console.log(`${'TOPLAM'.padEnd(g)}  ${String(top.guncellenen).padStart(13)}  ${String(top.eslesmeyen).padStart(10)}  ${String(top.gecersiz).padStart(8)}`)
  console.log(`\n[TEST] soruları: ${testDolan} sorunun boş konusu ${dryRun ? "'Test Konusu 1' olacak" : "'Test Konusu 1' yapıldı"}`)

  if (dryRun) console.log('\nDRY-RUN: hiçbir şey yazılmadı.')
  if (hatalar.length > 0) {
    console.error(`\n${hatalar.length} satır sorunluydu${dryRun ? '' : ' (geçerli satırlar yine de güncellendi)'}. Aynı konuyu tekrar yazmak güvenlidir.`)
    process.exit(1)
  }
  console.log('\nOK')
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
