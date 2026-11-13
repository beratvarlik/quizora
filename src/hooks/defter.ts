// GEÇİCİ: Berat'ın tipleri gelince types.ts'ten import edilecek, fonksiyonlar client.ts'teki api'ye yönlendirilecek.
// (Hook yalnızca src/lib/client.ts ve api.mock.ts'e izin verdiği için dosya src/hooks/ altında.)
// Şimdilik bellekte sahte veri: sayfa yenilenince 8 örnek kayda döner.
import type { ReviewItem, Secenek, Sinav } from '../types'

// ---------------------------------------------------------------------
// Geçici tipler
// ---------------------------------------------------------------------
export interface MistakeSummary {
  total: number
  resolvedTotal: number
  bySubject: Array<{ exam: Sinav; subject: string; count: number }>
}
export interface MistakeItem {
  questionId: string
  exam: Sinav
  subject: string
  text: string
  imageUrl?: string | null
  options: Partial<Record<Secenek, string>> // LGS'de E yok
  lastAnswer: Secenek | null // null = boş
  wrongCount: number
  lastWrongAt: string // ISO
}
export interface PracticeResult {
  isCorrect: boolean
  correctOption: Secenek
  explanation: string | null
  resolved: boolean // doğru çözüldü → defterden çıktı
}

// ---------------------------------------------------------------------
// Bellek içi sahte veri
// ---------------------------------------------------------------------
interface Kayit extends MistakeItem {
  dogru: Secenek
  aciklama: string | null
}

const SAAT = 3_600_000
const once = (ms: number) => new Date(Date.now() - ms).toISOString()
const bekle = () => new Promise<void>(r => setTimeout(r, 120 + Math.random() * 160))

const kayitlar = new Map<string, Kayit>()
let cozulen = 0
const islenenOyunlar = new Set<string>()

function ekle(k: Kayit) {
  kayitlar.set(k.questionId, k)
}

ekle({
  questionId: 'ornek-1', exam: 'yks', subject: 'Matematik',
  text: 'x² − 5x + 6 = 0 denkleminin kökleri toplamı kaçtır?',
  options: { A: '2', B: '3', C: '5', D: '6', E: '−5' },
  lastAnswer: 'D', wrongCount: 3, lastWrongAt: once(2 * 24 * SAAT), dogru: 'C',
  aciklama: 'Kökler toplamı −b/a = −(−5)/1 = 5. Kökler 2 ve 3 olduğundan toplam 5.',
})
ekle({
  questionId: 'ornek-2', exam: 'yks', subject: 'Matematik',
  text: 'log₂ 32 ifadesinin değeri kaçtır?',
  options: { A: '4', B: '5', C: '6', D: '8', E: '16' },
  lastAnswer: null, wrongCount: 1, lastWrongAt: once(5 * SAAT), dogru: 'B',
  aciklama: '2⁵ = 32 olduğundan log₂ 32 = 5.',
})
ekle({
  questionId: 'ornek-3', exam: 'yks', subject: 'Fizik',
  text: 'Sürtünmesiz yatay düzlemde duran 2 kg kütleli cisme 10 N büyüklüğünde yatay kuvvet uygulanıyor. Cismin ivmesi kaç m/s² olur?',
  options: { A: '2', B: '4', C: '5', D: '10', E: '20' },
  lastAnswer: 'A', wrongCount: 2, lastWrongAt: once(26 * SAAT), dogru: 'C',
  aciklama: 'Newton’un ikinci yasası: F = m·a → a = 10 / 2 = 5 m/s².',
})
ekle({
  questionId: 'ornek-4', exam: 'yks', subject: 'Tarih',
  text: 'Osmanlı Devleti’nde ilk düzenli ordu hangi padişah döneminde kurulmuştur?',
  options: { A: 'Osman Bey', B: 'Orhan Bey', C: 'I. Murat', D: 'Yıldırım Bayezid', E: 'Fatih Sultan Mehmet' },
  lastAnswer: 'C', wrongCount: 1, lastWrongAt: once(3 * 24 * SAAT), dogru: 'B',
  aciklama: null, // bilerek boş: "açıklama henüz yok" durumu
})
ekle({
  questionId: 'ornek-5', exam: 'yks', subject: 'Edebiyat',
  text: '“Sefiller” romanının yazarı kimdir?',
  options: { A: 'Honoré de Balzac', B: 'Victor Hugo', C: 'Gustave Flaubert', D: 'Émile Zola', E: 'Stendhal' },
  lastAnswer: 'A', wrongCount: 1, lastWrongAt: once(6 * 24 * SAAT), dogru: 'B',
  aciklama: 'Sefiller (Les Misérables), Victor Hugo’nun 1862’de yayımlanan romanıdır.',
})
ekle({
  questionId: 'ornek-6', exam: 'yks', subject: 'Kimya',
  text: 'Suyun (H₂O) mol kütlesi kaç g/mol’dür? (H: 1, O: 16)',
  options: { A: '16', B: '17', C: '18', D: '20', E: '34' },
  lastAnswer: 'E', wrongCount: 1, lastWrongAt: once(2 * SAAT), dogru: 'C',
  aciklama: '2 · 1 + 16 = 18 g/mol.',
})
ekle({
  questionId: 'ornek-7', exam: 'lgs', subject: 'Matematik',
  text: '√49 + √16 işleminin sonucu kaçtır?',
  options: { A: '9', B: '11', C: '13', D: '65' },
  lastAnswer: 'C', wrongCount: 2, lastWrongAt: once(4 * 24 * SAAT), dogru: 'B',
  aciklama: '√49 = 7 ve √16 = 4; 7 + 4 = 11.',
})
ekle({
  questionId: 'ornek-8', exam: 'lgs', subject: 'Fen Bilimleri',
  text: 'Bir besin zincirinde aşağıdakilerden hangisi üretici konumundadır?',
  options: { A: 'Tavşan', B: 'Kartal', C: 'Ot', D: 'Mantar' },
  lastAnswer: null, wrongCount: 1, lastWrongAt: once(24 * SAAT), dogru: 'C',
  aciklama: 'Üreticiler fotosentezle kendi besinini üretir; ot bir üreticidir. Mantar ayrıştırıcıdır.',
})

function disa(k: Kayit): MistakeItem {
  const { dogru: _d, aciklama: _a, ...m } = k
  return { ...m, options: { ...k.options } }
}

/** "Matematik (AYT)" → "Matematik" */
export const dersAdi = (d: string) => d.replace(/\s*\((AYT|TYT|LGS)\)\s*$/, '')
const sinavi = (d: string): Sinav => (/\(LGS\)\s*$/.test(d) ? 'lgs' : 'yks')

// ---------------------------------------------------------------------
// Geçici API (ileride api.getMistakeSummary() vb. olacak)
// ---------------------------------------------------------------------
export async function getMistakeSummary(): Promise<MistakeSummary> {
  await bekle()
  const sayac = new Map<string, { exam: Sinav; subject: string; count: number }>()
  for (const k of kayitlar.values()) {
    const a = `${k.exam}|${k.subject}`
    const s = sayac.get(a) ?? { exam: k.exam, subject: k.subject, count: 0 }
    s.count++
    sayac.set(a, s)
  }
  return {
    total: kayitlar.size,
    resolvedTotal: cozulen,
    bySubject: [...sayac.values()].sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, 'tr')),
  }
}

export async function getMistakes(f: { exam?: Sinav; subject?: string; limit?: number } = {}): Promise<MistakeItem[]> {
  await bekle()
  let l = [...kayitlar.values()]
  if (f.exam) l = l.filter(k => k.exam === f.exam)
  if (f.subject) l = l.filter(k => k.subject === f.subject)
  l.sort((a, b) => Date.parse(b.lastWrongAt) - Date.parse(a.lastWrongAt))
  if (f.limit) l = l.slice(0, f.limit)
  return l.map(disa)
}

/** Defterdeki soruyu yeniden çöz. Doğruysa defterden düşer (resolved). */
export async function practiceAnswer(questionId: string, selected: Secenek): Promise<PracticeResult> {
  await bekle()
  const k = kayitlar.get(questionId)
  if (!k) throw new Error('Bu soru artık defterinde değil')
  if (!k.options[selected]) throw new Error('Geçersiz şık')
  const isCorrect = selected === k.dogru
  if (isCorrect) {
    kayitlar.delete(questionId)
    cozulen++
  } else {
    k.wrongCount++
    k.lastAnswer = selected
    k.lastWrongAt = new Date().toISOString()
  }
  return { isCorrect, correctOption: k.dogru, explanation: k.aciklama, resolved: isCorrect }
}

export async function removeMistake(questionId: string): Promise<void> {
  await bekle()
  kayitlar.delete(questionId)
}

/**
 * YALNIZCA MOCK: yarış bitince yanlış/boş soruları deftere ekler (gerçek backend bunu finish_game'de
 * kendisi yapacak). Aynı oyun ikinci kez eklenmez. Dönüş: o oyundaki yanlış + boş sayısı.
 */
export function oyunHatalariniEkle(gameId: string, items: ReviewItem[]): number {
  const hatalar = items.filter(i => i.outcome !== 'correct')
  if (islenenOyunlar.has(gameId)) return hatalar.length
  islenenOyunlar.add(gameId)
  const simdi = new Date().toISOString()
  for (const i of hatalar) {
    const subject = dersAdi(i.ders)
    const questionId = `oyun:${subject}|${i.text}`
    const var_ = kayitlar.get(questionId)
    if (var_) {
      var_.wrongCount++
      var_.lastAnswer = i.selected
      var_.lastWrongAt = simdi
      continue
    }
    ekle({
      questionId,
      exam: sinavi(i.ders),
      subject,
      text: i.text,
      imageUrl: i.imageUrl,
      options: { ...i.options },
      lastAnswer: i.selected,
      wrongCount: 1,
      lastWrongAt: simdi,
      dogru: i.correctOption,
      aciklama: i.explanation,
    })
  }
  return hatalar.length
}

// ---------------------------------------------------------------------
// Yardımcılar (arayüz)
// ---------------------------------------------------------------------
/** "Tekrar çöz": en fazla `adet` soru; çok yanlış yapılanlar önce, eşitler kendi içinde karışık. */
export function tekrarSec(l: MistakeItem[], adet = 10): MistakeItem[] {
  return l
    .map(m => ({ m, r: Math.random() }))
    .sort((a, b) => b.m.wrongCount - a.m.wrongCount || a.r - b.r)
    .slice(0, adet)
    .map(x => x.m)
}

/** "2 gün önce" */
export function neZaman(iso: string): string {
  const dk = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (dk < 1) return 'az önce'
  if (dk < 60) return `${dk} dk önce`
  const sa = Math.floor(dk / 60)
  if (sa < 24) return `${sa} saat önce`
  const g = Math.floor(sa / 24)
  return g === 1 ? 'dün' : `${g} gün önce`
}
