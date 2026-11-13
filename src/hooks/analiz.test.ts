import { describe, expect, it } from 'vitest'
import type { ReviewItem, ReviewOutcome, Secenek } from '../types'
import { bulunma, macAnalizi, sayiEki } from './analiz'

function soru(position: number, ders: string, outcome: ReviewOutcome, timeMs: number | null = 8000): ReviewItem {
  return {
    position,
    ders,
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

  it('hepsi doğru → yalnızca kutlama, deterministik', () => {
    const l = Array.from({ length: 10 }, (_, i) => soru(i, i < 5 ? 'Fizik (AYT)' : 'Kimya (AYT)', 'correct'))
    const a = macAnalizi(l)
    expect(a.oneriler).toHaveLength(1)
    expect(a.oneriler[0].tur).toBe('kutlama')
    expect(macAnalizi(l).oneriler[0].metin).toBe(a.oneriler[0].metin)
    expect(a.enZayif).toBeNull()
  })
})
