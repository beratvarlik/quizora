// Akıllı analiz: arayüzden bağımsız, saf fonksiyonlar (test: analiz.test.ts).
// (Hook frontend'de src/lib/ altına yeni dosyaya izin vermediği için src/hooks/ altında.)
import type { Kategori, ReviewItem, Sinav } from '../types'
import type { PerformanceStats } from './performans'

// ---------------------------------------------------------------------
// Türkçe yardımcılar
// ---------------------------------------------------------------------
/** "Fizik (AYT)" → "Fizik" */
export const dersAdi = (d: string) => d.replace(/\s*\((AYT|TYT|LGS)\)\s*$/, '')

const KALIN = 'aıou'
const INCE = 'eiöü'
const SERT = 'fstkçşhp'
/** Belirtisiz isim tamlaması (Din Kültürü, Mol Kavramı, Fen Bilimleri): ekten önce "n" gelir. */
const TAMLAMA = /\s\S*[ıiuü]$/

function sonUnlu(k: string): string {
  const s = k.toLocaleLowerCase('tr-TR')
  for (let i = s.length - 1; i >= 0; i--) if (KALIN.includes(s[i]) || INCE.includes(s[i])) return s[i]
  return 'e'
}

/** Bulunma eki: Fizik'te, Kimya'da, Edebiyat'ta, Din Kültürü'nde */
export function bulunma(ad: string): string {
  const a = KALIN.includes(sonUnlu(ad)) ? 'a' : 'e'
  if (TAMLAMA.test(ad)) return `${ad}'nd${a}`
  const son = ad.toLocaleLowerCase('tr-TR').slice(-1)
  return `${ad}'${SERT.includes(son) ? 't' : 'd'}${a}`
}

/** Sayı + iyelik/belirtme eki: 1'ini, 2'sini, 3'ünü, 6'sını, 9'unu, 10'unu */
export function sayiEki(n: number): string {
  const birler: Record<number, string> = { 1: 'ini', 2: 'sini', 3: 'ünü', 4: 'ünü', 5: 'ini', 6: 'sını', 7: 'sini', 8: 'ini', 9: 'unu' }
  const onlar: Record<number, string> = { 1: 'unu', 2: 'sini', 3: 'unu', 4: 'ını', 5: 'sini', 6: 'ını', 7: 'ini', 8: 'ini', 9: 'ını' }
  const ek = n % 100 === 0 ? 'ünü' : n % 10 ? birler[n % 10] : onlar[(n % 100) / 10]
  return `${n}'${ek}`
}

/** Saniye metni: 4,2 sn */
export const sn = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} sn`

/** Basit, deterministik tohum (aynı veri → aynı cümle). */
function tohum(metin: string): number {
  let h = 2166136261
  for (let i = 0; i < metin.length; i++) h = Math.imul(h ^ metin.charCodeAt(i), 16777619)
  return h >>> 0
}
const sec = <T,>(l: readonly T[], t: number): T => l[t % l.length]

// ---------------------------------------------------------------------
// A) Maç analizi (tek yarış, getGameReview verisi)
// ---------------------------------------------------------------------
export interface DersSonucu {
  /** ham ders etiketi ("Fizik (AYT)"); defter filtresi için */
  ders: string
  ad: string
  toplam: number
  dogru: number
  yanlis: number
  bos: number
  yuzde: number
}
export interface SoruSuresi {
  position: number
  ders: string
  ms: number
}
export interface OneriEylemi {
  etiket: string
  /** /yanlislarim/coz için ders filtresi (ham etiket) */
  ders: string
  /** varsa ayrıca konu filtresi (kaçırılanların hepsi bu konudaysa) */
  konu?: string
}
export interface Oneri {
  tur: 'kutlama' | 'zayif' | 'acele' | 'bos' | 'genel'
  metin: string
  eylem?: OneriEylemi
}
export interface MacAnalizi {
  dersler: DersSonucu[]
  enGuclu: string | null
  enZayif: string | null
  ortSureMs: number | null
  enHizliDogru: SoruSuresi | null
  enUzun: SoruSuresi | null
  oneriler: Oneri[]
}

const yuzdeHesap = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0)

export function macAnalizi(items: ReviewItem[]): MacAnalizi {
  const harita = new Map<string, DersSonucu>()
  for (const q of items) {
    const d = harita.get(q.ders) ?? { ders: q.ders, ad: dersAdi(q.ders), toplam: 0, dogru: 0, yanlis: 0, bos: 0, yuzde: 0 }
    d.toplam++
    if (q.outcome === 'correct') d.dogru++
    else if (q.outcome === 'wrong') d.yanlis++
    else d.bos++
    harita.set(q.ders, d)
  }
  const dersler = [...harita.values()].map(d => ({ ...d, yuzde: yuzdeHesap(d.dogru, d.toplam) }))
  // Görüntü sırası: yüzde azalan, eşitlikte soru sayısı azalan, sonra ad
  dersler.sort((a, b) => b.yuzde - a.yuzde || b.toplam - a.toplam || a.ad.localeCompare(b.ad, 'tr'))

  let enGuclu: string | null = null
  let enZayif: string | null = null
  if (dersler.length >= 2) {
    const ilk = dersler[0]
    if (ilk.dogru > 0) enGuclu = ilk.ders
    // En zayıf: en düşük yüzde; eşitlikte daha çok kaçırılan. En az bir kaçırma olmalı.
    const aday = [...dersler]
      .filter(d => d.yanlis + d.bos > 0)
      .sort((a, b) => a.yuzde - b.yuzde || b.yanlis + b.bos - (a.yanlis + a.bos))[0]
    if (aday && aday.ders !== enGuclu && aday.yuzde < ilk.yuzde) enZayif = aday.ders
  }

  const sureli = items.filter(q => q.timeMs !== null && q.outcome !== 'blank') as Array<ReviewItem & { timeMs: number }>
  const ortSureMs = sureli.length ? Math.round(sureli.reduce((t, q) => t + q.timeMs, 0) / sureli.length) : null
  const dogrular = sureli.filter(q => q.outcome === 'correct')
  const hizli = dogrular.reduce<(typeof sureli)[number] | null>((m, q) => (!m || q.timeMs < m.timeMs ? q : m), null)
  const uzun = sureli.reduce<(typeof sureli)[number] | null>((m, q) => (!m || q.timeMs > m.timeMs ? q : m), null)

  const analiz: MacAnalizi = {
    dersler,
    enGuclu,
    enZayif,
    ortSureMs,
    enHizliDogru: hizli ? { position: hizli.position, ders: hizli.ders, ms: hizli.timeMs } : null,
    enUzun: uzun ? { position: uzun.position, ders: uzun.ders, ms: uzun.timeMs } : null,
    oneriler: [],
  }
  analiz.oneriler = oneriSec(items, analiz)
  return analiz
}

/** Kurallardan en uygun 1-2 öneriyi seçer (hepsini birden yazmaz). */
function oneriSec(items: ReviewItem[], a: MacAnalizi): Oneri[] {
  const t = tohum(items.map(q => `${q.position}${q.outcome}${q.selected ?? '-'}`).join(''))
  const toplam = items.length
  const dogru = items.filter(q => q.outcome === 'correct').length
  const yanlis = items.filter(q => q.outcome === 'wrong').length
  const bos = items.filter(q => q.outcome === 'blank').length

  if (toplam > 0 && dogru === toplam) {
    return [
      {
        tur: 'kutlama',
        metin: sec(
          [
            `${toplam} soruda ${toplam} doğru: kusursuz bir yarış! Bu tempoyu bir sonraki yarışa da taşı.`,
            `Tek hata yok, ${toplam}/${toplam}. Bu alanda iyice ısındın; zor bir kategoride de şansını dene.`,
            `Hepsi doğru! Hem bilgin hem dikkatin yerindeydi, böyle devam.`,
          ],
          t,
        ),
      },
    ]
  }

  const adaylar: Array<Oneri & { puan: number }> = []

  const zayif = a.dersler.find(d => d.ders === a.enZayif)
  if (zayif && zayif.yanlis + zayif.bos > 0) {
    const kac = zayif.yanlis + zayif.bos
    // Konu bilgisi: kaçırılan soruların konuları (null olanlar sayılmaz)
    const kacanlar = items.filter(q => q.ders === zayif.ders && q.outcome !== 'correct')
    const konular = new Map<string, number>()
    for (const q of kacanlar) if (q.topic) konular.set(q.topic, (konular.get(q.topic) ?? 0) + 1)
    const [enKonu, enKonuSayi] = [...konular.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'tr'))[0] ?? [null, 0]
    const tekKonu = enKonu !== null && enKonuSayi === kac ? enKonu : null
    const yer = bulunma(zayif.ad)
    const giris = tekKonu
      ? `${zayif.ad} · ${bulunma(tekKonu)} ${kac === 1 ? 'bir soru' : `${kac} soru`} kaçırdın.`
      : enKonu
        ? `${yer} ${zayif.toplam} sorunun ${sayiEki(kac)} kaçırdın, en çok ${enKonu} konusunda.`
        : kac === zayif.toplam
          ? zayif.toplam === 1
            ? `${yer} tek soruyu kaçırdın.`
            : `${yer} ${zayif.toplam} sorunun hepsini kaçırdın.`
          : `${yer} ${zayif.toplam} sorunun ${sayiEki(kac)} kaçırdın.`
    const devam = sec(
      [
        `Yanlışlarım'dan ${kac === 1 ? 'bu soruyu' : `bu ${kac} soruyu`} tekrar çöz.`,
        `${kac === 1 ? 'O soruyu' : `O ${kac} soruyu`} Yanlışlarım'da sakin kafayla bir daha dene.`,
      ],
      t,
    )
    adaylar.push({
      tur: 'zayif',
      metin: `${giris} ${devam}`,
      eylem: { etiket: kac === 1 ? 'Bu soruyu çöz' : `Bu ${kac} soruyu çöz`, ders: zayif.ders, ...(tekKonu ? { konu: tekKonu } : {}) },
      puan: 30 + kac * 5,
    })
  }

  if (a.ortSureMs !== null && a.ortSureMs < 5000 && yanlis >= 3) {
    adaylar.push({
      tur: 'acele',
      metin: sec(
        [
          `Ortalama ${sn(a.ortSureMs)} ile çok hızlısın ama ${yanlis} yanlış acele ettiğini gösteriyor; şıkları okumaya 2-3 sn daha ayır.`,
          `Hızlısın ama acele ediyorsun: ${yanlis} yanlışın çoğu ilk bakışta işaretlenmiş gibi. Şıkları okumaya 2-3 sn daha ayır.`,
        ],
        t >>> 3,
      ),
      puan: 40 + yanlis * 3,
    })
  }

  if (bos >= 3) {
    adaylar.push({
      tur: 'bos',
      metin: sec(
        [
          `${bos} soruyu boş bıraktın. Yanlış −25, boş 0; emin değilsen boş bırakmak doğru taktik, ama süren kaldıysa dene.`,
          `${bos} boş var. Boş puan kaybettirmez, yanlış −25 götürür; yine de iki şıkka indirebildiysen işaretlemeye değer.`,
        ],
        t >>> 5,
      ),
      puan: 25 + bos * 4,
    })
  }

  adaylar.sort((x, y) => y.puan - x.puan)
  const secilen = adaylar.slice(0, 2).map(({ puan: _p, ...o }) => o)
  if (secilen.length) return secilen

  const oran = yuzdeHesap(dogru, toplam)
  return [
    {
      tur: 'genel',
      metin:
        oran >= 70
          ? `%${oran} doğrulukla iyi bir yarıştı. Kaçırdığın ${toplam - dogru === 1 ? 'tek soruya' : `${toplam - dogru} soruya`} aşağıdan göz at.`
          : `%${oran} doğruluk. Dersleri tek tek görmek için aşağıdaki çubuklara, kaçırdıkların için soru incelemesine bak.`,
    },
  ]
}

// ---------------------------------------------------------------------
// B) Performansım: konular ve 3 günlük mini program (deterministik)
// ---------------------------------------------------------------------
type Konu = PerformanceStats['byTopic'][number]
/** Sunucu konusu girilmemiş soruları bu ad altında toplar; anlamlı bir konu değil. */
export const DIGER = 'Diğer'

const KATEGORI_ADI: Record<Kategori, string> = {
  sayisal: 'Sayısal', esit_agirlik: 'Eşit Ağırlık', sozel: 'Sözel', tyt: 'TYT', lgs_sozel: 'LGS Sözel', lgs_sayisal: 'LGS Sayısal',
}

/** Dersin en çok çıktığı yarış kategorisi (programdaki "1 Sayısal yarış" için). */
export function dersKategorisi(exam: Sinav, subject: string): Kategori {
  if (exam === 'lgs') return /Matematik|Fen/i.test(subject) ? 'lgs_sayisal' : 'lgs_sozel'
  if (/\(TYT\)\s*$/.test(subject)) return 'tyt'
  if (/Matematik|Fizik|Kimya|Biyoloji/i.test(subject)) return 'sayisal'
  if (/Edebiyat/i.test(subject)) return 'esit_agirlik'
  return 'sozel'
}
export const kategoriAdi = (k: Kategori) => KATEGORI_ADI[k]

/** En düşük doğruluklu 3-5 konu (az örnekli konular atlanır). */
export function zorlananKonular(s: PerformanceStats): Konu[] {
  const l = s.byTopic.filter(t => !t.lowSample && t.topic !== DIGER).sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered || a.topic.localeCompare(b.topic, 'tr'))
  const zayif = l.filter(t => t.accuracy < 70).length
  return l.slice(0, Math.min(5, Math.max(3, zayif)))
}

/** En iyi 3 konu (zorlananlarla çakışmaz). */
export function gucluKonular(s: PerformanceStats): Konu[] {
  const zor = new Set(zorlananKonular(s).map(t => `${t.subject}|${t.topic}`))
  return s.byTopic
    .filter(t => !t.lowSample && t.topic !== DIGER && !zor.has(`${t.subject}|${t.topic}`))
    .sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered || a.topic.localeCompare(b.topic, 'tr'))
    .slice(0, 3)
}

export type ProgramEylemi =
  | { tur: 'defter'; ders: string; konu?: string; etiket: string }
  | { tur: 'yaris'; kategori: Kategori; sinav: Sinav; etiket: string }
export interface ProgramGunu {
  gun: 1 | 2 | 3
  subject: string
  topic: string
  metin: string
  eylem: ProgramEylemi
}

/**
 * 3 günlük mini program: her gün en zayıf konulardan biri + somut görev. Aynı veri → aynı program.
 * defterSayi: Yanlışlarım'daki çözülmemiş soru sayısı; anahtar "ders" ya da "ders|konu" (defterSayilari()).
 */
export function miniProgram(s: PerformanceStats, defterSayi: Record<string, number> = {}): ProgramGunu[] {
  let zayif: Konu[] = zorlananKonular(s)
  if (!zayif.length) {
    // Konu verisi yoksa derslerden türet
    zayif = [...s.bySubject]
      .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
      .map(d => ({ exam: d.exam, subject: d.subject, topic: dersAdi(d.subject), answered: d.answered, correct: d.correct, accuracy: d.accuracy, lowSample: false }))
  }
  if (!zayif.length) return []

  const gunler: ProgramGunu[] = []
  for (let i = 0; i < 3; i++) {
    const k = zayif[i % zayif.length]
    const kat = dersKategorisi(k.exam, k.subject)
    const bas = `${dersAdi(k.subject)} · ${k.topic}`
    const yaris: ProgramEylemi = { tur: 'yaris', kategori: kat, sinav: k.exam, etiket: 'Yarışa gir' }
    const konuN = defterSayi[`${k.subject}|${k.topic}`] ?? 0
    let metin: string
    let eylem: ProgramEylemi
    if (i === 0) {
      if (konuN > 0) {
        metin = `${bas}: Yanlışlarım'daki ${konuN} soruyu çöz`
        eylem = { tur: 'defter', ders: k.subject, konu: k.topic, etiket: 'Çöz' }
      } else {
        metin = `${bas}: 1 ${KATEGORI_ADI[kat]} yarışta bu konuya odaklan`
        eylem = yaris
      }
    } else if (i === 1) {
      metin = `${bas}: 1 ${KATEGORI_ADI[kat]} yarış`
      eylem = yaris
    } else {
      const hedef = Math.min(90, Math.max(50, Math.ceil((k.accuracy + 15) / 10) * 10))
      metin = `${bas}: 10 soruluk yarışta %${hedef} hedefle`
      eylem = yaris
    }
    gunler.push({ gun: (i + 1) as 1 | 2 | 3, subject: k.subject, topic: k.topic, metin, eylem })
  }
  return gunler
}

/** Defter listesinden sayılar: "ders" ve "ders|konu" anahtarları (konusuz sorular yalnızca derse sayılır). */
export function defterSayilari(l: Array<{ subject: string; topic: string | null }>): Record<string, number> {
  const s: Record<string, number> = {}
  for (const m of l) {
    s[m.subject] = (s[m.subject] ?? 0) + 1
    if (m.topic) s[`${m.subject}|${m.topic}`] = (s[`${m.subject}|${m.topic}`] ?? 0) + 1
  }
  return s
}
