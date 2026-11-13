// Sayfalar API'yi YALNIZCA buradan alır. Gerçek api.ts varsa ve Supabase
// ortam değişkenleri tanımlıysa onu, yoksa (ya da VITE_USE_MOCK=true ise) sahtesini kullanır.
import type { QuizoraApi, Secenek, Sinav } from '../types'
import { api as sahte, getGameReview as sahteInceleme } from './api.mock'

const real = import.meta.glob<{ api: QuizoraApi }>('./api.ts', { eager: true })
const gercek = real['./api.ts']?.api
const ortamVar = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export const isMock: boolean = import.meta.env.VITE_USE_MOCK === 'true' || !gercek || !ortamVar
export const api: QuizoraApi = isMock || !gercek ? sahte : gercek

// ---------------------------------------------------------------------
// Soru incelemesi (sonuç ekranı). GEÇİCİ: tip ve metot Berat'a gönderilen tanımla aynı; types.ts'e
// `QuestionReview` ve `QuizoraApi.getGameReview` gelince buradaki tip kaldırılıp oradan alınacak.
// ---------------------------------------------------------------------
export interface QuestionReview {
  index: number // 0..9
  subject: string // ders etiketi, örn. "Matematik (AYT)"
  exam: Sinav
  text: string
  imageUrl?: string | null
  options: Partial<Record<Secenek, string>>
  correctOption: Secenek
  myAnswer: Secenek | null // null = boş
  isCorrect: boolean
  pointsEarned: number
  timeMs: number | null
  explanation: string | null
}

type IncelemeApi = { getGameReview?: (gameId: string) => Promise<QuestionReview[]> }

export function getGameReview(gameId: string): Promise<QuestionReview[]> {
  if (isMock) return sahteInceleme(gameId)
  const g = gercek as (QuizoraApi & IncelemeApi) | undefined
  if (g && typeof g.getGameReview === 'function') return g.getGameReview(gameId)
  return Promise.reject(new Error('Soru incelemesi henüz hazır değil'))
}
