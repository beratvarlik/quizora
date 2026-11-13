import { beforeAll, describe, expect, it, vi } from 'vitest'

// Tarayıcı ortamı yerine küçük taklitler (mock API localStorage / window kullanır)
const depo = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const g = globalThis as Record<string, unknown>
if (typeof g.window === 'undefined') {
  const et = new EventTarget()
  g.window = Object.assign(globalThis, {
    addEventListener: et.addEventListener.bind(et),
    removeEventListener: et.removeEventListener.bind(et),
    dispatchEvent: et.dispatchEvent.bind(et),
  })
  g.localStorage = depo()
  g.sessionStorage = depo()
  g.location = { search: '' }
}

vi.mock('../lib/client', async () => {
  const m = await import('../lib/api.mock')
  return { api: m.api, isMock: true }
})

type Modul = typeof import('./gorevler')
type Mock = typeof import('../lib/api.mock')
let G: Modul
let M: Mock
beforeAll(async () => {
  G = await import('./gorevler')
  M = await import('../lib/api.mock')
})

describe('günlük görevler (mock)', () => {
  it('günün 3 görevi deterministik ve farklı', () => {
    const a = G.gununGorevleri('2026-11-14')
    expect(a).toHaveLength(3)
    expect(new Set(a).size).toBe(3)
    expect(G.gununGorevleri('2026-11-14')).toEqual(a)
    const farkli = ['2026-11-15', '2026-11-16', '2026-11-17'].some(d => G.gununGorevleri(d).join() !== a.join())
    expect(farkli).toBe(true)
  })

  it('resetsAt bir sonraki İstanbul gece yarısı', async () => {
    const t = await G.getDailyTasks()
    expect(t.date).toBe(G.istanbulGunu())
    const kalan = Date.parse(t.resetsAt) - Date.now()
    expect(kalan).toBeGreaterThan(0)
    expect(kalan).toBeLessThanOrEqual(24 * 3_600_000)
    expect(new Date(t.resetsAt).getUTCHours()).toBe(21) // 00:00 İstanbul = 21:00 UTC
  })

  it('mock olaylarıyla ilerler, ödül alınır, bonus açılır', async () => {
    const ozet: import('../lib/api.mock').MockOyunOzeti = { matematik: 10, dogru: 8, toplam: 10, kazandi: true, oyuncu: 3, herkeseAcik: false }
    for (let i = 0; i < 3; i++) window.dispatchEvent(new CustomEvent(M.MOCK_OYUN_BITTI, { detail: { ...ozet, herkeseAcik: i === 0 } }))
    for (let i = 0; i < 3; i++) window.dispatchEvent(new CustomEvent(M.MOCK_DEFTER_COZULDU))
    const t = await G.getDailyTasks()
    expect(t.tasks.every(x => x.completed)).toBe(true)
    expect(t.bonus.completed).toBe(false)

    const hata = await G.claimDailyTask(G.BONUS_ID).catch(e => e.message)
    expect(hata).toBe('Önce günün 3 görevini tamamla')
    let xp = 0
    for (const x of t.tasks) {
      const r = await G.claimDailyTask(x.id)
      expect(r.xpGained).toBe(x.xp)
      expect(r.newXp).toBe(xp + x.xp)
      xp = r.newXp
    }
    expect(await G.claimDailyTask(t.tasks[0].id).catch(e => e.message)).toBe('Bu ödülü zaten aldın')
    const b = await G.claimDailyTask(G.BONUS_ID)
    expect(b.xpGained).toBe(50)
    expect((await G.getDailyTasks()).bonus.claimed).toBe(true)
    expect(b.tierAfter).toBeGreaterThanOrEqual(b.tierBefore)
  })

  it('kalan süre ve ilerleme karşılaştırması', () => {
    expect(G.kalanYaz((6 * 60 + 12) * 60_000 + 30_000)).toBe('6s 12dk')
    expect(G.kalanYaz(12 * 60_000)).toBe('12dk')
    expect(G.kalanYaz(45_000)).toBe('45sn')
    const once = { date: 'x', resetsAt: '', tasks: [{ id: 'a', title: '', target: 5, progress: 1, xp: 1, completed: false, claimed: false }], bonus: { xp: 50, completed: false, claimed: false } }
    const sonra = { ...once, tasks: [{ ...once.tasks[0], progress: 3 }] }
    expect(G.ilerleyenler(once, sonra).map(t => t.id)).toEqual(['a'])
    expect(G.ilerleyenler({ ...once, date: 'y' }, sonra)).toEqual([])
  })
})
