// GEÇİCİ: Berat'ın tipleri gelince types.ts'ten import edilecek.
// (Hook src/lib/gorevler.ts'e izin vermediği için dosya src/hooks/ altında.) Şimdilik bellekte sahte
// veri; getDailyTasks / claimDailyTask ileride client.ts'teki api'ye yönlendirilecek.
import { api, isMock } from '../lib/client'
import { MOCK_DEFTER_COZULDU, MOCK_OYUN_BITTI, kademeSirasi, mockXpEkle, type MockOyunOzeti } from '../lib/api.mock'

// ---------------------------------------------------------------------
// Geçici tipler
// ---------------------------------------------------------------------
export interface DailyTask {
  id: string
  title: string
  target: number
  progress: number
  xp: number
  completed: boolean
  claimed: boolean
}
export interface DailyTasks {
  /** İstanbul takvim günü, YYYY-MM-DD */
  date: string
  /** bir sonraki İstanbul gece yarısı (ISO) */
  resetsAt: string
  tasks: DailyTask[]
  bonus: { xp: number; completed: boolean; claimed: boolean }
}
export interface ClaimResult {
  xpGained: number
  newXp: number
  /** rütbe sırası (0 = Çaylak) */
  tierBefore: number
  tierAfter: number
}
export const BONUS_ID = 'bonus'

// ---------------------------------------------------------------------
// Görev havuzu
// ---------------------------------------------------------------------
export type GorevId = 'math10' | 'win1' | 'correct5' | 'friends2' | 'notebook3' | 'acc70' | 'quick1' | 'games3'
const HAVUZ: ReadonlyArray<{ id: GorevId; title: string; target: number; xp: number }> = [
  { id: 'math10', title: '10 Matematik sorusu çöz', target: 10, xp: 30 },
  { id: 'win1', title: '1 yarışma kazan', target: 1, xp: 40 },
  { id: 'correct5', title: '5 doğru cevap ver', target: 5, xp: 20 },
  { id: 'friends2', title: '2 arkadaşınla yarış', target: 1, xp: 30 },
  { id: 'notebook3', title: "Yanlışlarım'dan 3 soru çöz", target: 3, xp: 30 },
  { id: 'acc70', title: 'Bir yarışta %70 doğruluk', target: 1, xp: 30 },
  { id: 'quick1', title: 'Hemen Katıl ile 1 yarış', target: 1, xp: 20 },
  { id: 'games3', title: '3 yarışma tamamla', target: 3, xp: 30 },
]
const BONUS_XP = 50

// ---------------------------------------------------------------------
// İstanbul günü (UTC+3, yaz saati yok)
// ---------------------------------------------------------------------
const IST_MS = 3 * 3_600_000
export function istanbulGunu(t = Date.now()): string {
  return new Date(t + IST_MS).toISOString().slice(0, 10)
}
function sonrakiGeceYarisi(t = Date.now()): string {
  const gun = istanbulGunu(t)
  return new Date(Date.parse(`${gun}T00:00:00Z`) + 24 * 3_600_000 - IST_MS).toISOString()
}

/** Tarihe göre deterministik 3 görev (aynı gün → aynı görevler). */
export function gununGorevleri(gun: string): GorevId[] {
  let h = 2166136261
  for (let i = 0; i < gun.length; i++) h = Math.imul(h ^ gun.charCodeAt(i), 16777619)
  const l = HAVUZ.map(g => g.id)
  // Fisher-Yates, tohumlu
  for (let i = l.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    const j = h % (i + 1)
    ;[l[i], l[j]] = [l[j], l[i]]
  }
  return l.slice(0, 3)
}

// ---------------------------------------------------------------------
// Bellek içi durum (gün değişince sıfırlanır)
// ---------------------------------------------------------------------
interface Durum {
  gun: string
  ilerleme: Record<string, number>
  alinan: Set<string>
}
let durum: Durum | null = null
let doluIstendi = false
try {
  doluIstendi = new URLSearchParams(window.location.search).get('gorev') === 'dolu'
} catch {
  /* yok say */
}

function guncel(): Durum {
  const gun = istanbulGunu()
  if (!durum || durum.gun !== gun) {
    const ilerleme: Record<string, number> = {}
    for (const id of gununGorevleri(gun)) ilerleme[id] = doluIstendi ? HAVUZ.find(g => g.id === id)!.target : 0
    durum = { gun, ilerleme, alinan: new Set() }
  }
  return durum
}

function gorunum(d: Durum): DailyTasks {
  const tasks = gununGorevleri(d.gun).map(id => {
    const h = HAVUZ.find(g => g.id === id)!
    const progress = Math.min(h.target, d.ilerleme[id] ?? 0)
    return { id, title: h.title, target: h.target, progress, xp: h.xp, completed: progress >= h.target, claimed: d.alinan.has(id) }
  })
  return {
    date: d.gun,
    resetsAt: sonrakiGeceYarisi(),
    tasks,
    bonus: { xp: BONUS_XP, completed: tasks.every(t => t.claimed), claimed: d.alinan.has(BONUS_ID) },
  }
}

const dinleyiciler = new Set<() => void>()
function ilerlet(id: GorevId, n: number) {
  if (n <= 0) return
  const d = guncel()
  if (!(id in d.ilerleme)) return
  d.ilerleme[id] += n
  for (const cb of dinleyiciler) cb()
}

// Mock olayları → ilerleme (gerçek backend bunları sunucuda sayacak)
if (isMock && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(MOCK_OYUN_BITTI, e => {
    const o = (e as CustomEvent<MockOyunOzeti>).detail
    if (!o) return
    ilerlet('games3', 1)
    ilerlet('correct5', o.dogru)
    ilerlet('math10', o.matematik)
    if (o.kazandi) ilerlet('win1', 1)
    if (o.toplam && o.dogru / o.toplam >= 0.7) ilerlet('acc70', 1)
    if (o.herkeseAcik) ilerlet('quick1', 1)
    if (!o.herkeseAcik && o.oyuncu >= 3) ilerlet('friends2', 1)
  })
  window.addEventListener(MOCK_DEFTER_COZULDU, () => ilerlet('notebook3', 1))
}

// ---------------------------------------------------------------------
// Geçici API
// ---------------------------------------------------------------------
const bekle = () => new Promise<void>(r => setTimeout(r, 140 + Math.random() * 160))

export async function getDailyTasks(): Promise<DailyTasks> {
  await bekle()
  return gorunum(guncel())
}

/** Görev (ya da BONUS_ID) ödülünü al. Hatalar Türkçe: zaten alındı, henüz tamamlanmadı, gün değişti. */
export async function claimDailyTask(taskId: string): Promise<ClaimResult> {
  await bekle()
  const d = guncel()
  const v = gorunum(d)
  let xpGained: number
  if (taskId === BONUS_ID) {
    if (v.bonus.claimed) throw new Error('Bu ödülü zaten aldın')
    if (!v.bonus.completed) throw new Error('Önce günün 3 görevini tamamla')
    xpGained = v.bonus.xp
  } else {
    const t = v.tasks.find(x => x.id === taskId)
    if (!t) throw new Error('Gün değişti, görevler yenilendi')
    if (t.claimed) throw new Error('Bu ödülü zaten aldın')
    if (!t.completed) throw new Error('Görev henüz tamamlanmadı')
    xpGained = t.xp
  }
  d.alinan.add(taskId)
  let once: number
  let sonra: number
  if (isMock) ({ once, sonra } = mockXpEkle(xpGained))
  else {
    // Gerçek backend gelene kadar yalnızca gösterim (XP sunucuda değişmez)
    once = (await api.getMyStats()).xp
    sonra = once + xpGained
  }
  for (const cb of dinleyiciler) cb()
  return { xpGained, newXp: sonra, tierBefore: kademeSirasi(once), tierAfter: kademeSirasi(sonra) }
}

/** Görev durumu değişince (ilerleme, ödül) haber ver. */
export function gorevDinle(cb: () => void): () => void {
  dinleyiciler.add(cb)
  return () => {
    dinleyiciler.delete(cb)
  }
}

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
