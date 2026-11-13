import { describe, expect, it } from 'vitest'
import type { PerformanceStats, ReviewItem, ReviewOutcome, Secenek } from '../types'
import { bulunma, dersKategorisi, gucluKonular, macAnalizi, miniProgram, sayiEki, zorlananKonular } from './analiz'

function soru(position: number, ders: string, outcome: ReviewOutcome, timeMs: number | null = 8000, topic: string | null = null): ReviewItem {
  return {
    position,
    ders,
    topic,
    text: `Soru ${position}`,
    imageUrl: null,
    options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' },
    selected: outcome === 'blank' ? null : ((outcome === 'correct' ? 'A' : 'B') as Secenek),
    correctOption: 'A',
    outcome,
    points: outcome === 'correct' ? 120 : outcome === 'wrong' ? -25 : 0,
    timeMs: outcome === 'blank' ? null : timeMs,
    explanation: null,
  }
}

describe('Türkçe ekler', () => {
  it('bulunma eki', () => {
    expect(bulunma('Fizik')).toBe("Fizik'te")
    expect(bulunma('Kimya')).toBe("Kimya'da")
    expect(bulunma('Edebiyat')).toBe("Edebiyat'ta")
    expect(bulunma('Türkçe')).toBe("Türkçe'de")
    expect(bulunma('Din Kültürü')).toBe("Din Kültürü'nde")
    expect(bulunma('İnkılap Tarihi')).toBe("İnkılap Tarihi'nde")
    expect(bulunma('Coğrafya')).toBe("Coğrafya'da")
    expect(bulunma('Mol Kavramı')).toBe("Mol Kavramı'nda")
    expect(bulunma('Kuvvet ve Hareket')).toBe("Kuvvet ve Hareket'te")
    expect(bulunma('Biyoloji')).toBe("Biyoloji'de")
  })
  it('sayı eki', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sayiEki)).toEqual([
      "1'ini", "2'sini", "3'ünü", "4'ünü", "5'ini", "6'sını", "7'sini", "8'ini", "9'unu", "10'unu",
    ])
  })
})

describe('maç analizi', () => {
  const karisik = [
    soru(0, 'Matematik (AYT)', 'correct', 9000),
    soru(1, 'Matematik (AYT)', 'correct', 6000),
    soru(2, 'Matematik (AYT)', 'correct', 12000),
    soru(3, 'Matematik (AYT)', 'wrong', 7000),
    soru(4, 'Fizik (AYT)', 'wrong', 15000),
    soru(5, 'Fizik (AYT)', 'correct', 3100),
    soru(6, 'Fizik (AYT)', 'blank'),
    soru(7, 'Kimya (AYT)', 'correct', 21000),
    soru(8, 'Kimya (AYT)', 'correct', 8000),
    soru(9, 'Biyoloji (AYT)', 'correct', 5000),
  ]

  it('ders yüzdeleri, en güçlü / en zayıf', () => {
    const a = macAnalizi(karisik)
    expect(a.dersler.map(d => [d.ad, d.dogru, d.toplam, d.yuzde])).toEqual([
      ['Kimya', 2, 2, 100],
      ['Biyoloji', 1, 1, 100],
      ['Matematik', 3, 4, 75],
      ['Fizik', 1, 3, 33],
    ])
    expect(a.enGuclu).toBe('Kimya (AYT)')
    expect(a.enZayif).toBe('Fizik (AYT)')
  })

  it('süre istatistikleri (boşlar sayılmaz)', () => {
    const a = macAnalizi(karisik)
    expect(a.ortSureMs).toBe(Math.round((9000 + 6000 + 12000 + 7000 + 15000 + 3100 + 21000 + 8000 + 5000) / 9))
    expect(a.enHizliDogru).toEqual({ position: 5, ders: 'Fizik (AYT)', ms: 3100 })
    expect(a.enUzun).toEqual({ position: 7, ders: 'Kimya (AYT)', ms: 21000 })
  })

  it('zayıf ders önerisi + ders filtreli eylem', () => {
    const a = macAnalizi(karisik)
    expect(a.oneriler.length).toBeGreaterThanOrEqual(1)
    expect(a.oneriler.length).toBeLessThanOrEqual(2)
    expect(a.oneriler[0].tur).toBe('zayif')
    expect(a.oneriler[0].metin).toContain("Fizik'te 3 sorunun 2'sini kaçırdın.")
    expect(a.oneriler[0].eylem).toEqual({ etiket: 'Bu 2 soruyu çöz', ders: 'Fizik (AYT)' })
  })

  it('hızlı ama yanlış → acele önerisi', () => {
    const l = Array.from({ length: 10 }, (_, i) => soru(i, i < 5 ? 'Türkçe (TYT)' : 'Tarih (TYT)', i % 3 === 0 ? 'wrong' : 'correct', 3000))
    const a = macAnalizi(l)
    expect(a.oneriler.some(o => o.tur === 'acele')).toBe(true)
    expect(a.oneriler.length).toBeLessThanOrEqual(2)
  })

  it('3+ boş → boş taktiği önerisi', () => {
    const l = Array.from({ length: 10 }, (_, i) => soru(i, 'Matematik (LGS)', i < 4 ? 'blank' : 'correct'))
    const a = macAnalizi(l)
    expect(a.oneriler[0].tur).toBe('bos')
    expect(a.oneriler[0].metin).toMatch(/^4 /)
    expect(a.enGuclu).toBeNull() // tek ders: etiket yok
  })

  it('konu bilgisi varsa öneri konu adıyla ve konu filtreli', () => {
    const l = karisik.map(q => (q.ders === 'Fizik (AYT)' ? { ...q, topic: 'Kuvvet ve Hareket' } : q))
    const a = macAnalizi(l)
    expect(a.oneriler[0].metin).toContain("Fizik · Kuvvet ve Hareket'te 2 soru kaçırdın.")
    expect(a.oneriler[0].eylem).toEqual({ etiket: 'Bu 2 soruyu çöz', ders: 'Fizik (AYT)', konu: 'Kuvvet ve Hareket' })
    const karma = karisik.map(q => (q.position === 4 ? { ...q, topic: 'Elektrik' } : q))
    expect(macAnalizi(karma).oneriler[0].metin).toContain("Fizik'te 3 sorunun 2'sini kaçırdın, en çok Elektrik konusunda.")
    expect(macAnalizi(karma).oneriler[0].eylem?.konu).toBeUndefined()
  })

  it('hepsi doğru → yalnızca kutlama, deterministik', () => {
    const l = Array.from({ length: 10 }, (_, i) => soru(i, i < 5 ? 'Fizik (AYT)' : 'Kimya (AYT)', 'correct'))
    const a = macAnalizi(l)
    expect(a.oneriler).toHaveLength(1)
    expect(a.oneriler[0].tur).toBe('kutlama')
    expect(macAnalizi(l).oneriler[0].metin).toBe(a.oneriler[0].metin)
    expect(a.enZayif).toBeNull()
  })
})

describe('performans: konular ve mini program', () => {
  const konu = (subject: string, topic: string, correct: number, wrong: number) => {
    const answered = correct + wrong
    return { exam: 'yks' as const, subject, topic, answered, correct, accuracy: Math.round((1000 * correct) / answered) / 10, lowSample: answered < 3 }
  }
  const ornek: PerformanceStats = {
    totals: { games: 9, answered: 89, correct: 53, wrong: 36, blank: 9, avgTimeMs: 8000, accuracy: 59.6 },
    bySubject: [],
    byTopic: [
      konu('Matematik (AYT)', 'Türev', 9, 5),
      konu('Matematik (AYT)', 'Logaritma', 4, 6),
      konu('Matematik (AYT)', 'Fonksiyonlar', 10, 2),
      konu('Fizik (AYT)', 'Kuvvet ve Hareket', 3, 6),
      konu('Fizik (AYT)', 'Elektrik', 3, 3),
      konu('Fizik (AYT)', 'Optik', 1, 1),
      konu('Fizik (AYT)', 'Diğer', 0, 5),
      konu('Kimya (TYT)', 'Mol Kavramı', 6, 2),
      konu('Kimya (TYT)', 'Asitler ve Bazlar', 6, 1),
      konu('Türkçe (TYT)', 'Sözcükte Anlam', 9, 6),
      konu('Tarih (TYT)', 'Osmanlı Tarihi', 2, 0),
    ],
    daily: [],
    streakDays: 3,
  }
  const st = async () => ornek

  it('zorlanan konular: az örnekli atlanır, doğruluk artan', async () => {
    const s = await st()
    const z = zorlananKonular(s)
    expect(z.length).toBeGreaterThanOrEqual(3)
    expect(z.length).toBeLessThanOrEqual(5)
    expect(z.some(t => t.lowSample)).toBe(false)
    expect(z[0].topic).toBe('Kuvvet ve Hareket')
    for (let i = 1; i < z.length; i++) expect(z[i].accuracy).toBeGreaterThanOrEqual(z[i - 1].accuracy)
    const g = gucluKonular(s)
    expect(g).toHaveLength(3)
    expect(g.some(t => z.includes(t))).toBe(false)
  })

  it('mini program: 3 gün, deterministik, defter sayısına göre görev', async () => {
    const s = await st()
    const sayi = { 'Fizik (AYT)': 5, 'Fizik (AYT)|Kuvvet ve Hareket': 4 }
    const p1 = miniProgram(s, sayi)
    expect(p1.map(g => g.gun)).toEqual([1, 2, 3])
    expect(p1[0].metin).toBe("Fizik · Kuvvet ve Hareket: Yanlışlarım'daki 4 soruyu çöz")
    expect(p1[0].eylem).toMatchObject({ tur: 'defter', ders: 'Fizik (AYT)', konu: 'Kuvvet ve Hareket' })
    expect(p1.some(g => g.topic === 'Diğer')).toBe(false)
    expect(p1[1].metin).toMatch(/: 1 (Sayısal|TYT) yarış$/)
    expect(p1[2].metin).toMatch(/10 soruluk yarışta %\d0 hedefle$/)
    expect(miniProgram(s, sayi)).toEqual(p1)
    const p2 = miniProgram(s, { 'Fizik (AYT)': 3 }) // derste var ama konuda yok → yarış görevi
    expect(p2[0].eylem.tur).toBe('yaris')
  })

  it('ders → kategori', () => {
    expect(dersKategorisi('yks', 'Fizik (AYT)')).toBe('sayisal')
    expect(dersKategorisi('yks', 'Türkçe (TYT)')).toBe('tyt')
    expect(dersKategorisi('yks', 'Edebiyat (AYT)')).toBe('esit_agirlik')
    expect(dersKategorisi('lgs', 'Fen Bilimleri (LGS)')).toBe('lgs_sayisal')
    expect(dersKategorisi('lgs', 'Türkçe (LGS)')).toBe('lgs_sozel')
  })
})
