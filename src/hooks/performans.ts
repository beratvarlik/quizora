// GEÇİCİ: Berat'ın tipleri gelince types.ts'ten import edilecek.
// (Hook src/lib/performans.ts'e izin vermediği için dosya src/hooks/ altında.) Şimdilik bellekte
// gerçekçi sahte veri; getPerformance ileride client.ts'teki api'ye yönlendirilecek.
import type { Sinav } from '../types'

// ---------------------------------------------------------------------
// Geçici tip
// ---------------------------------------------------------------------
export interface PerformanceStats {
  totals: { games: number; answered: number; correct: number; wrong: number; blank: number; avgTimeMs: number; accuracy: number }
  bySubject: Array<{ exam: Sinav; subject: string; answered: number; correct: number; accuracy: number; avgTimeMs: number }>
  byTopic: Array<{ exam: Sinav; subject: string; topic: string; answered: number; correct: number; accuracy: number; lowSample?: boolean }>
  /** son 7 gün, eskiden yeniye; date = YYYY-MM-DD */
  daily: Array<{ date: string; answered: number; correct: number }>
  streakDays: number
}
// accuracy her yerde 0-100 arası tam sayı (yüzde).

// ---------------------------------------------------------------------
// Sahte veri (son 7 gün). 30 gün seçilince konu sayıları ~3 katına çıkar.
// ---------------------------------------------------------------------
const AZ_ORNEK = 4 // bu sayının altında cevap → lowSample
type Ham = [subject: string, topic: string, answered: number, correct: number]
const KONULAR: Record<Sinav, Ham[]> = {
  yks: [
    ['Matematik (AYT)', 'Türev', 14, 9],
    ['Matematik (AYT)', 'Logaritma', 10, 4],
    ['Matematik (AYT)', 'Fonksiyonlar', 12, 10],
    ['Fizik (AYT)', 'Kuvvet ve Hareket', 9, 3],
    ['Fizik (AYT)', 'Elektrik', 6, 3],
    ['Fizik (AYT)', 'Optik', 2, 1],
    ['Kimya (TYT)', 'Mol Kavramı', 8, 6],
    ['Kimya (TYT)', 'Asitler ve Bazlar', 7, 6],
    ['Türkçe (TYT)', 'Paragraf', 15, 9],
    ['Tarih (TYT)', 'Osmanlı Kuruluş Dönemi', 3, 3],
  ],
  lgs: [
    ['Matematik (LGS)', 'Üslü Sayılar', 10, 7],
    ['Matematik (LGS)', 'Kareköklü İfadeler', 8, 3],
    ['Fen Bilimleri (LGS)', 'DNA ve Genetik Kod', 9, 6],
    ['Fen Bilimleri (LGS)', 'Basınç', 6, 2],
    ['Türkçe (LGS)', 'Paragraf', 12, 8],
  ],
}
const DERS_SURE: Record<string, number> = {
  'Matematik (AYT)': 9800, 'Fizik (AYT)': 8700, 'Kimya (TYT)': 6900, 'Türkçe (TYT)': 7400, 'Tarih (TYT)': 5200,
  'Matematik (LGS)': 8300, 'Fen Bilimleri (LGS)': 6600, 'Türkçe (LGS)': 7100,
}
/** Günlük dağılım (eskiden yeniye): inişli çıkışlı, 2. gün hiç oynanmamış → seri 5 gün. */
const GUN_AGIRLIK = [0.12, 0, 0.14, 0.21, 0.08, 0.17, 0.28]
const GUN_ISABET = [0.55, 0, 0.62, 0.7, 0.5, 0.68, 0.74]

const bekle = () => new Promise<void>(r => setTimeout(r, 180 + Math.random() * 180))
const yuzde = (d: number, t: number) => (t ? Math.round((d / t) * 100) : 0)
function gun(onceGun: number): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - onceGun)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hesapla(exams: Sinav[], kat: number): PerformanceStats {
  const byTopic = exams.flatMap(exam =>
    KONULAR[exam].map(([subject, topic, a, c]) => {
      const answered = a * kat
      const correct = c * kat
      return { exam, subject, topic, answered, correct, accuracy: yuzde(correct, answered), ...(answered < AZ_ORNEK ? { lowSample: true } : {}) }
    }),
  )
  const dersMap = new Map<string, PerformanceStats['bySubject'][number]>()
  for (const t of byTopic) {
    const d = dersMap.get(t.subject) ?? { exam: t.exam, subject: t.subject, answered: 0, correct: 0, accuracy: 0, avgTimeMs: DERS_SURE[t.subject] ?? 8000 }
    d.answered += t.answered
    d.correct += t.correct
    dersMap.set(t.subject, d)
  }
  const bySubject = [...dersMap.values()].map(d => ({ ...d, accuracy: yuzde(d.correct, d.answered) }))
  const answered = bySubject.reduce((t, d) => t + d.answered, 0)
  const correct = bySubject.reduce((t, d) => t + d.correct, 0)
  const kacan = answered - correct
  const wrong = Math.round(kacan * 0.7)
  const avgTimeMs = answered ? Math.round(bySubject.reduce((t, d) => t + d.avgTimeMs * d.answered, 0) / answered) : 0

  // Son 7 gün (30 gün seçilse de grafik haftalık)
  const hafta = Math.round(answered / kat)
  const daily = GUN_AGIRLIK.map((w, i) => {
    const a = Math.round(hafta * w)
    return { date: gun(6 - i), answered: a, correct: Math.min(a, Math.round(a * GUN_ISABET[i])) }
  })
  let streakDays = 0
  for (let i = daily.length - 1; i >= 0 && daily[i].answered > 0; i--) streakDays++

  return {
    totals: { games: Math.max(1, Math.round(answered / 10)), answered, correct, wrong, blank: kacan - wrong, avgTimeMs, accuracy: yuzde(correct, answered) },
    bySubject,
    byTopic,
    daily,
    streakDays,
  }
}

/** Geçici: { exam } verilmezse iki sınav birlikte. days: 7 (varsayılan) ya da 30. */
export async function getPerformance(opts: { exam?: Sinav; days?: number } = {}): Promise<PerformanceStats> {
  await bekle()
  const exams: Sinav[] = opts.exam ? [opts.exam] : ['yks', 'lgs']
  return hesapla(exams, (opts.days ?? 7) >= 30 ? 3 : 1)
}
