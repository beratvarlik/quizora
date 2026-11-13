// CSV'den soru yükleme aracı (service role). Yeni paket gerektirmez.
//
// Kullanım:
//   npx tsx scripts/import-questions.ts <dosya.csv> [--dry-run] [--gorsel-klasor <klasör>]
//
// Sütunlar (başlık satırı zorunlu):
//   tablo, soru_metni, secenek_a, secenek_b, secenek_c, secenek_d, secenek_e, dogru_sik, gorsel_dosya, aciklama, cozum_aciklamasi
// aciklama = dahili not (öğrenciye gösterilmez); cozum_aciklamasi = yarış sonrası öğrenciye gösterilen çözüm (en çok 400 karakter, isteğe bağlı).
// YKS tablolarında 5 şık (A-E) zorunludur. LGS tablolarında (*_lgs) soru 4 şıklıdır: secenek_e boş bırakılır, dogru_sik A-D.
// Ayrıntı: docs/SORU-EKLEME.md
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LGS_TABLOLARI, STORAGE_KOVASI, TUM_TABLOLAR } from './lib-sorular.ts'

config({ path: '.env.local' })

const GRUP_BOYUTU = 50
const ZORUNLU_SUTUNLAR = ['tablo', 'soru_metni', 'secenek_a', 'secenek_b', 'secenek_c', 'secenek_d', 'secenek_e', 'dogru_sik']
const ISTEGE_BAGLI_SUTUNLAR = ['gorsel_dosya', 'aciklama', 'cozum_aciklamasi']
const GORSEL_ADI = /^[A-Za-z0-9._-]+$/
const GORSEL_TURLERI: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

// =====================================================================
// CSV ayrıştırıcı
// =====================================================================
interface CsvKaydi {
  no: number // kaydın dosyadaki başlangıç satırı (1 = başlık)
  alanlar: string[]
}

// Ayırıcıyı ilk satırdan algıla: tırnak dışındaki ';' sayısı ',' sayısından fazlaysa ';'
export function ayiriciAlgila(metin: string): ',' | ';' {
  const ilkSatir = metin.split('\n', 1)[0]
  let virgul = 0
  let noktaliVirgul = 0
  let tirnakta = false
  for (const c of ilkSatir) {
    if (c === '"') tirnakta = !tirnakta
    else if (!tirnakta) {
      if (c === ',') virgul++
      else if (c === ';') noktaliVirgul++
    }
  }
  return noktaliVirgul > virgul ? ';' : ','
}

// Tırnaklı alanlar, "" kaçışı ve alan içi satır sonları desteklenir.
export function csvAyristir(girdi: string): { ayirici: ',' | ';'; kayitlar: CsvKaydi[]; kapanmayanTirnakSatiri: number | null } {
  const metin = girdi.replace(/^﻿/, '') // UTF-8 BOM'u at
  const ayirici = ayiriciAlgila(metin)
  const kayitlar: CsvKaydi[] = []
  let alanlar: string[] = []
  let alan = ''
  let tirnakta = false
  let tirnakAcilisSatiri = 0
  let satir = 1
  let kayitSatiri = 1

  const kaydiBitir = (): void => {
    alanlar.push(alan)
    const bos = alanlar.every((a) => a.trim() === '')
    if (!bos) kayitlar.push({ no: kayitSatiri, alanlar })
    alanlar = []
    alan = ''
    kayitSatiri = satir
  }

  for (let i = 0; i < metin.length; i++) {
    const c = metin[i]
    if (tirnakta) {
      if (c === '"') {
        if (metin[i + 1] === '"') {
          alan += '"'
          i++
        } else {
          tirnakta = false
        }
      } else {
        if (c === '\n') satir++
        alan += c
      }
    } else if (c === '"' && alan === '') {
      tirnakta = true
      tirnakAcilisSatiri = satir
    } else if (c === ayirici) {
      alanlar.push(alan)
      alan = ''
    } else if (c === '\r') {
      if (metin[i + 1] !== '\n') {
        satir++
        kaydiBitir()
      }
    } else if (c === '\n') {
      satir++
      kaydiBitir()
    } else {
      alan += c
    }
  }
  if (alan !== '' || alanlar.length > 0) kaydiBitir()
  return { ayirici, kayitlar, kapanmayanTirnakSatiri: tirnakta ? tirnakAcilisSatiri : null }
}

// =====================================================================
// Yardımcılar
// =====================================================================
interface Aday {
  no: number
  tablo: string
  satir: {
    soru_metni: string
    secenek_a: string
    secenek_b: string
    secenek_c: string
    secenek_d: string
    secenek_e: string | null
    dogru_sik: string
    aciklama: string | null
    cozum_aciklamasi: string | null
    gorsel_url: string | null
  }
  gorselDosya: string
}

interface TabloSayaci {
  eklenen: number
  yinelenen: number
  hatali: number
}

interface SatirHatasi {
  no: number
  mesaj: string
}

function kullanimYaz(): void {
  console.error('Kullanım: npx tsx scripts/import-questions.ts <dosya.csv> [--dry-run] [--gorsel-klasor <klasör>]')
}

async function mevcutMetinler(admin: SupabaseClient, tablo: string): Promise<Set<string>> {
  const set = new Set<string>()
  for (let baslangic = 0; ; baslangic += 1000) {
    const { data, error } = await admin.from(tablo).select('soru_metni').range(baslangic, baslangic + 999)
    if (error) throw new Error(`${tablo} okunamadı: ${error.message}`)
    for (const r of data ?? []) set.add(String(r.soru_metni).trim())
    if (!data || data.length < 1000) break
  }
  return set
}

// =====================================================================
// Ana akış
// =====================================================================
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const gorselIndeks = args.indexOf('--gorsel-klasor')
  const gorselKlasoru = gorselIndeks >= 0 ? args[gorselIndeks + 1] : undefined
  if (gorselIndeks >= 0 && (!gorselKlasoru || gorselKlasoru.startsWith('--'))) {
    console.error('HATA: --gorsel-klasor için bir klasör yolu ver.')
    kullanimYaz()
    process.exit(1)
  }
  const konumsal = args.filter((a, i) => !a.startsWith('--') && !(gorselIndeks >= 0 && i === gorselIndeks + 1))
  const bilinmeyen = args.filter((a) => a.startsWith('--') && !['--dry-run', '--gorsel-klasor'].includes(a))
  if (bilinmeyen.length > 0 || konumsal.length !== 1) {
    if (bilinmeyen.length > 0) console.error(`HATA: bilinmeyen seçenek: ${bilinmeyen.join(', ')}`)
    kullanimYaz()
    process.exit(1)
  }
  const dosya = konumsal[0]
  if (!existsSync(dosya) || !statSync(dosya).isFile()) {
    console.error(`HATA: CSV dosyası bulunamadı: ${dosya}`)
    process.exit(1)
  }
  if (gorselKlasoru !== undefined && (!existsSync(gorselKlasoru) || !statSync(gorselKlasoru).isDirectory())) {
    console.error(`HATA: görsel klasörü bulunamadı: ${gorselKlasoru}`)
    process.exit(1)
  }

  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const eksikEnv = [['VITE_SUPABASE_URL', url], ['SUPABASE_SERVICE_ROLE_KEY', serviceKey]].filter(([, v]) => !v).map(([n]) => n)
  if (eksikEnv.length > 0) {
    console.error(`HATA: .env.local içinde eksik değişken: ${eksikEnv.join(', ')}`)
    process.exit(1)
  }

  // ---- CSV'yi oku ----
  const { ayirici, kayitlar, kapanmayanTirnakSatiri } = csvAyristir(readFileSync(dosya, 'utf8'))
  if (kapanmayanTirnakSatiri !== null) {
    console.error(`HATA: satır ${kapanmayanTirnakSatiri}: tırnak (") açılmış ama kapanmamış. Dosya baştan sona okunamadı, hiçbir şey yüklenmedi.`)
    process.exit(1)
  }
  if (kayitlar.length === 0) {
    console.error('HATA: CSV boş. Başlık satırı zorunludur.')
    process.exit(1)
  }

  // ---- Başlık ----
  const baslik = kayitlar[0].alanlar.map((a) => a.trim().toLowerCase())
  const eksikSutunlar = ZORUNLU_SUTUNLAR.filter((s) => !baslik.includes(s))
  if (eksikSutunlar.length > 0) {
    console.error(`HATA: başlık satırında eksik sütun: ${eksikSutunlar.join(', ')}`)
    console.error(`Beklenen başlık: ${[...ZORUNLU_SUTUNLAR, ...ISTEGE_BAGLI_SUTUNLAR].join(', ')} (algılanan ayırıcı: '${ayirici}')`)
    process.exit(1)
  }
  const sutunNo = (ad: string): number => baslik.indexOf(ad)

  console.log(`${dryRun ? '[DRY-RUN — hiçbir şey yazılmayacak] ' : ''}${dosya} okunuyor (ayırıcı: '${ayirici}', ${kayitlar.length - 1} veri satırı)\n`)

  // ---- Doğrulama ----
  const hatalar: SatirHatasi[] = []
  const sayac: Record<string, TabloSayaci> = {}
  const sayacAl = (tablo: string): TabloSayaci => (sayac[tablo] ??= { eklenen: 0, yinelenen: 0, hatali: 0 })
  const hataEkle = (no: number, tablo: string, mesaj: string): void => {
    hatalar.push({ no, mesaj })
    sayacAl(tablo).hatali++
  }
  const adaylar: Aday[] = []

  for (const kayit of kayitlar.slice(1)) {
    const al = (ad: string): string => (kayit.alanlar[sutunNo(ad)] ?? '').trim()
    const tablo = al('tablo').toLowerCase()
    const tabloAdi = TUM_TABLOLAR.includes(tablo) ? tablo : '(geçersiz tablo)'

    if (kayit.alanlar.length > baslik.length && kayit.alanlar.slice(baslik.length).some((a) => a.trim() !== '')) {
      hataEkle(kayit.no, tabloAdi, `sütun sayısı başlıktan fazla (${kayit.alanlar.length} > ${baslik.length}). Metinde '${ayirici}' karakteri varsa o alanı çift tırnak içine alın`)
      continue
    }
    if (!TUM_TABLOLAR.includes(tablo)) {
      hataEkle(kayit.no, tabloAdi, `tablo adı geçersiz: '${al('tablo')}'. Geçerli adlar docs/SORU-EKLEME.md içinde`)
      continue
    }

    const sorunlar: string[] = []
    const metin = al('soru_metni')
    if (metin === '') sorunlar.push('soru_metni boş')
    // LGS soruları 4 şıklıdır: secenek_e boş olabilir, dogru_sik A-D. YKS'de 5 şık zorunlu, dogru_sik A-E.
    const lgs = (LGS_TABLOLARI as readonly string[]).includes(tablo)
    for (const harf of lgs ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'c', 'd', 'e']) {
      if (al(`secenek_${harf}`) === '') sorunlar.push(`secenek_${harf} boş`)
    }
    const dogruSik = al('dogru_sik').toUpperCase()
    const gecerliSiklar = lgs ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E']
    if (!gecerliSiklar.includes(dogruSik)) {
      sorunlar.push(`dogru_sik ${lgs ? 'A-D (LGS soruları 4 şıklıdır)' : 'A-E'} olmalı (bulunan: '${al('dogru_sik')}')`)
    }

    if (sutunNo('cozum_aciklamasi') >= 0 && al('cozum_aciklamasi').length > 400) {
      sorunlar.push(`cozum_aciklamasi en çok 400 karakter olmalı (bulunan: ${al('cozum_aciklamasi').length})`)
    }

    const gorselDosya = sutunNo('gorsel_dosya') >= 0 ? al('gorsel_dosya') : ''
    if (gorselDosya !== '') {
      if (!GORSEL_ADI.test(gorselDosya)) {
        sorunlar.push(`gorsel_dosya adı yalnızca harf (a-z), rakam, nokta, tire ve alt çizgi içermeli, klasör/boşluk/Türkçe karakter olmamalı: '${gorselDosya}'`)
      } else if (!GORSEL_TURLERI[extname(gorselDosya).toLowerCase()]) {
        sorunlar.push(`gorsel_dosya uzantısı desteklenmiyor (png, jpg, jpeg, webp, gif, svg): '${gorselDosya}'`)
      } else if (gorselKlasoru === undefined) {
        sorunlar.push(`gorsel_dosya dolu ('${gorselDosya}') ama --gorsel-klasor verilmedi`)
      } else if (!existsSync(join(gorselKlasoru, gorselDosya))) {
        sorunlar.push(`gorsel_dosya klasörde yok: ${join(gorselKlasoru, gorselDosya)}`)
      }
    }
    if (sorunlar.length > 0) {
      hataEkle(kayit.no, tablo, sorunlar.join('; '))
      continue
    }

    adaylar.push({
      no: kayit.no,
      tablo,
      gorselDosya,
      satir: {
        soru_metni: metin,
        secenek_a: al('secenek_a'),
        secenek_b: al('secenek_b'),
        secenek_c: al('secenek_c'),
        secenek_d: al('secenek_d'),
        secenek_e: al('secenek_e') === '' ? null : al('secenek_e'), // LGS'de boş → NULL
        dogru_sik: dogruSik,
        aciklama: sutunNo('aciklama') >= 0 && al('aciklama') !== '' ? al('aciklama') : null,
        cozum_aciklamasi: sutunNo('cozum_aciklamasi') >= 0 && al('cozum_aciklamasi') !== '' ? al('cozum_aciklamasi') : null,
        gorsel_url: null,
      },
    })
  }

  // ---- Yinelenenleri ayıkla (veritabanındakiler ve dosya içindekiler) ----
  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
  const gorulen: Record<string, Set<string>> = {}
  const eklenecekler: Aday[] = []
  for (const a of adaylar) {
    gorulen[a.tablo] ??= await mevcutMetinler(admin, a.tablo)
    if (gorulen[a.tablo].has(a.satir.soru_metni)) {
      sayacAl(a.tablo).yinelenen++
      console.log(`yinelenen — satır ${a.no} (${a.tablo}): aynı soru metni zaten var, atlandı`)
      continue
    }
    gorulen[a.tablo].add(a.satir.soru_metni)
    eklenecekler.push(a)
  }

  // ---- Görselleri yükle ----
  const yuklenenUrl = new Map<string, string>() // "<tablo>/<dosya>" → herkese açık URL
  const yuklenebilirler: Aday[] = []
  for (const a of eklenecekler) {
    if (a.gorselDosya === '') {
      yuklenebilirler.push(a)
      continue
    }
    const anahtar = `${a.tablo}/${a.gorselDosya}`
    if (dryRun) {
      yuklenebilirler.push(a)
      continue
    }
    if (!yuklenenUrl.has(anahtar)) {
      const icerik = readFileSync(join(gorselKlasoru!, a.gorselDosya))
      const { error } = await admin.storage
        .from(STORAGE_KOVASI)
        .upload(anahtar, icerik, { contentType: GORSEL_TURLERI[extname(a.gorselDosya).toLowerCase()], upsert: true })
      if (error) {
        hataEkle(a.no, a.tablo, `görsel yüklenemedi (${anahtar}): ${error.message}`)
        continue
      }
      yuklenenUrl.set(anahtar, admin.storage.from(STORAGE_KOVASI).getPublicUrl(anahtar).data.publicUrl)
    }
    a.satir.gorsel_url = yuklenenUrl.get(anahtar) ?? null
    yuklenebilirler.push(a)
  }

  // ---- Tablo bazında 50'şerli gruplarla ekle ----
  const tablolaGore: Record<string, Aday[]> = {}
  for (const a of yuklenebilirler) (tablolaGore[a.tablo] ??= []).push(a)

  for (const [tablo, liste] of Object.entries(tablolaGore)) {
    if (dryRun) {
      sayacAl(tablo).eklenen += liste.length
      continue
    }
    for (let i = 0; i < liste.length; i += GRUP_BOYUTU) {
      const grup = liste.slice(i, i + GRUP_BOYUTU)
      const { error } = await admin.from(tablo).insert(grup.map((g) => g.satir))
      if (!error) {
        sayacAl(tablo).eklenen += grup.length
        continue
      }
      // Grup reddedildiyse satır satır dene: hatalı satır diğerlerini engellemesin
      for (const g of grup) {
        const { error: tekHata } = await admin.from(tablo).insert(g.satir)
        if (tekHata) hataEkle(g.no, tablo, `eklenemedi: ${tekHata.message}`)
        else sayacAl(tablo).eklenen++
      }
    }
  }

  // ---- Rapor ----
  if (hatalar.length > 0) {
    console.log('')
    for (const h of [...hatalar].sort((x, y) => x.no - y.no)) console.error(`HATA — satır ${h.no}: ${h.mesaj}`)
  }
  const etiket = dryRun ? 'eklenecek' : 'eklenen'
  const tablolar = Object.keys(sayac).sort()
  const genislik = Math.max(5, ...tablolar.map((t) => t.length))
  console.log(`\n${'TABLO'.padEnd(genislik)}  ${etiket.toUpperCase().padStart(9)}  ${'YİNELENEN'.padStart(9)}  ${'HATALI'.padStart(6)}`)
  console.log(`${'-'.repeat(genislik)}  ${'-'.repeat(9)}  ${'-'.repeat(9)}  ${'-'.repeat(6)}`)
  const toplam: TabloSayaci = { eklenen: 0, yinelenen: 0, hatali: 0 }
  for (const t of tablolar) {
    const s = sayac[t]
    toplam.eklenen += s.eklenen
    toplam.yinelenen += s.yinelenen
    toplam.hatali += s.hatali
    console.log(`${t.padEnd(genislik)}  ${String(s.eklenen).padStart(9)}  ${String(s.yinelenen).padStart(9)}  ${String(s.hatali).padStart(6)}`)
  }
  console.log(`${'TOPLAM'.padEnd(genislik)}  ${String(toplam.eklenen).padStart(9)}  ${String(toplam.yinelenen).padStart(9)}  ${String(toplam.hatali).padStart(6)}`)

  if (dryRun) console.log('\nDRY-RUN: hiçbir şey yazılmadı.')
  if (toplam.hatali > 0) {
    console.error(`\n${toplam.hatali} satır hatalıydı${dryRun ? '' : ' (geçerli satırlar yine de eklendi)'}. Hataları düzeltip dosyayı tekrar çalıştırabilirsin; eklenmiş sorular "yinelenen" olarak atlanır.`)
    process.exit(1)
  }
  console.log('\nOK')
}

// Başka bir script bu dosyadan csvAyristir'i içe aktardığında yükleme çalışmasın
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`HATA: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  })
}
