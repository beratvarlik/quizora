// Günlük görevler: tipler types.ts'ten, fonksiyonlar client.ts'teki api'den (mock modda da gerçek
// modda da aynı yer). Sayfalar görevleri yalnızca buradan kullanır.
import { api } from '../lib/client'
import type { ClaimResult, DailyTask, DailyTasks } from '../types'

export type { ClaimResult, DailyTask, DailyTasks }
export const BONUS_ID = 'bonus'

const dinleyiciler = new Set<() => void>()
const haberVer = () => {
  for (const cb of dinleyiciler) cb()
}

export const getDailyTasks = (): Promise<DailyTasks> => api.getDailyTasks()

/** Görev (ya da BONUS_ID) ödülünü al; başarıda dinleyiciler (kart, panel) yenilenir. */
export async function claimDailyTask(taskId: string): Promise<ClaimResult> {
  const r = await api.claimDailyTask(taskId)
  haberVer()
  return r
}

/** Görev durumu değişince (ödül alındı) haber ver. */
export function gorevDinle(cb: () => void): () => void {
  dinleyiciler.add(cb)
  return () => {
    dinleyiciler.delete(cb)
  }
}

// ---------------------------------------------------------------------
// Hata metinleri (0012): bazıları gösterilmez, yalnızca liste yenilenir
// ---------------------------------------------------------------------
/** 'Ödül zaten alındı' (çift tıklama / başka sekme): hata gösterme, listeyi yenile. */
export const sessizHata = (m: string) => /zaten alındı/i.test(m)
/** Gece yarısı geçtiyse daha anlaşılır bir metin. */
export const gorevHataMetni = (m: string) => (/bugünün görevi değil/i.test(m) ? 'Gün değişti, görevler yenilendi.' : m)

// ---------------------------------------------------------------------
// Arayüz yardımcıları
// ---------------------------------------------------------------------
/** "6s 12dk" / "12dk" / "45sn" */
export function kalanYaz(ms: number): string {
  const sn = Math.max(0, Math.floor(ms / 1000))
  const s = Math.floor(sn / 3600)
  const dk = Math.floor((sn % 3600) / 60)
  if (s > 0) return `${s}s ${dk}dk`
  if (dk > 0) return `${dk}dk`
  return `${sn}sn`
}

/** Önce/sonra karşılaştırması: ilerleyen görevler (sonuç ve çalışma bandı için). */
export function ilerleyenler(once: DailyTasks | null, sonra: DailyTasks): DailyTask[] {
  if (!once || once.date !== sonra.date) return []
  return sonra.tasks.filter(t => t.progress > (once.tasks.find(x => x.id === t.id)?.progress ?? 0))
}

const K_ONCE = 'quizora.gorev.once.'
/** Yarış başlarken görevlerin anlık hâlini sakla (sonuç ekranı karşılaştırır). */
export async function gorevAnlikKaydet(anahtar: string): Promise<void> {
  try {
    if (sessionStorage.getItem(K_ONCE + anahtar)) return
    sessionStorage.setItem(K_ONCE + anahtar, JSON.stringify(await getDailyTasks()))
  } catch {
    /* yok say */
  }
}
export function gorevAnlikOku(anahtar: string): DailyTasks | null {
  try {
    const s = sessionStorage.getItem(K_ONCE + anahtar)
    return s ? (JSON.parse(s) as DailyTasks) : null
  } catch {
    return null
  }
}
