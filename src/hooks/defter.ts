// Yanlışlarım defteri: tipler types.ts'ten, fonksiyonlar client.ts'teki api'den
// (mock modda da gerçek modda da aynı yer). Sayfalar defteri yalnızca buradan kullanır.
import { api } from '../lib/client'
import type { MistakeItem, MistakeSummary, PracticeResult, Secenek, Sinav } from '../types'

export type { MistakeItem, MistakeSummary, PracticeResult }

export const getMistakeSummary = (): Promise<MistakeSummary> => api.getMistakeSummary()
export const getMistakes = (opts?: { exam?: Sinav; subject?: string; limit?: number }): Promise<MistakeItem[]> => api.getMistakes(opts)
export const practiceAnswer = (questionId: string, selected: Secenek): Promise<PracticeResult> => api.practiceAnswer(questionId, selected)
export const removeMistake = (questionId: string): Promise<void> => api.removeMistake(questionId)

// ---------------------------------------------------------------------
// Yardımcılar (arayüz)
// ---------------------------------------------------------------------
/** "Fizik (AYT)" → "Fizik": satırdaki küçük çip için. Filtrede `subject` aynen kullanılır. */
export const dersAdi = (d: string) => d.replace(/\s*\((AYT|TYT|LGS)\)\s*$/, '')

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
