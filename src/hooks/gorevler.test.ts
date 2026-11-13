import { beforeAll, describe, expect, it } from 'vitest'

// Tarayıcı ortamı yerine küçük taklitler. ?gorev=dolu: görevler tamamlanmış ama alınmamış gelir.
const depo = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const g = globalThis as Record<string, unknown>
g.window = globalThis
g.localStorage = depo()
g.sessionStorage = depo()
g.location = { search: '?gorev=dolu' }

type Mock = typeof import('../lib/api.mock')
type Modul = typeof import('./gorevler')
let api: Mock['api']
let G: Modul
beforeAll(async () => {
  api = (await import('../lib/api.mock')).api
  G = await import('./gorevler')
})

describe('günlük görevler (mock api, ?gorev=dolu)', () => {
  it('günün 3 görevi deterministik; resetsAt İstanbul gece yarısı', async () => {
    const a = await api.getDailyTasks()
    const b = await api.getDailyTasks()
    expect(a.tasks).toHaveLength(3)
    expect(new Set(a.tasks.map(t => t.id)).size).toBe(3)
    expect(b.tasks.map(t => t.id)).toEqual(a.tasks.map(t => t.id))
    expect(a.tasks.every(t => t.completed && !t.claimed && t.progress === t.target)).toBe(true)
    const kalan = Date.parse(a.resetsAt) - Date.now()
    expect(kalan).toBeGreaterThan(0)
    expect(kalan).toBeLessThanOrEqual(24 * 3_600_000)
    expect(new Date(a.resetsAt).getUTCHours()).toBe(21) // 00:00 İstanbul = 21:00 UTC
    expect(a.bonus).toEqual({ xp: 50, completed: false, claimed: false })
  })

  it('ödül, hata metinleri (0012) ve bonus', async () => {
    const t = await api.getDailyTasks()
    expect(await api.claimDailyTask('').catch(e => e.message)).toBe('Geçersiz görev')
    expect(await api.claimDailyTask('yok_boyle').catch(e => e.message)).toBe('Bu görev bugünün görevi değil')
    expect(await api.claimDailyTask('bonus').catch(e => e.message)).toBe('Önce üç görevin ödülünü al')

    let xp = (await api.getMyStats()).xp
    for (const x of t.tasks) {
      const r = await api.claimDailyTask(x.id)
      expect(r.xpGained).toBe(x.xp)
      expect(r.newXp).toBe(xp + x.xp)
      expect(typeof r.tierBefore).toBe('string')
      xp = r.newXp
    }
    expect(await api.claimDailyTask(t.tasks[0].id).catch(e => e.message)).toBe('Ödül zaten alındı')
    expect((await api.getDailyTasks()).bonus.completed).toBe(true)
    const b = await api.claimDailyTask(G.BONUS_ID)
    expect(b).toMatchObject({ xpGained: 50, newXp: xp + 50 })
    expect((await api.getMyStats()).xp).toBe(xp + 50)
    expect((await api.getDailyTasks()).bonus.claimed).toBe(true)
  })
})

describe('görev yardımcıları', () => {
  it('kalan süre, ilerleme karşılaştırması, hata metinleri', () => {
    expect(G.kalanYaz((6 * 60 + 12) * 60_000 + 30_000)).toBe('6s 12dk')
    expect(G.kalanYaz(12 * 60_000)).toBe('12dk')
    expect(G.kalanYaz(45_000)).toBe('45sn')
    const once = { date: 'x', resetsAt: '', tasks: [{ id: 'a', title: '', target: 5, progress: 1, xp: 1, completed: false, claimed: false }], bonus: { xp: 50, completed: false, claimed: false } }
    const sonra = { ...once, tasks: [{ ...once.tasks[0], progress: 3 }] }
    expect(G.ilerleyenler(once, sonra).map(t => t.id)).toEqual(['a'])
    expect(G.ilerleyenler({ ...once, date: 'y' }, sonra)).toEqual([])
    expect(G.sessizHata('Ödül zaten alındı')).toBe(true)
    expect(G.gorevHataMetni('Bu görev bugünün görevi değil')).toBe('Gün değişti, görevler yenilendi.')
  })
})
