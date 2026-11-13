import { describe, expect, it } from 'vitest'
import { rankPlayers, remainingMs, scorePoints } from './scoring'
import type { PlayerState } from '../types'

describe('scorePoints', () => {
  it('0 sn doğru → 200', () => expect(scorePoints(true, 0)).toBe(200))
  it('6 sn doğru → 170', () => expect(scorePoints(true, 6)).toBe(170))
  it('20 sn doğru → 100', () => expect(scorePoints(true, 20)).toBe(100))
  it('25 sn doğru → 100', () => expect(scorePoints(true, 25)).toBe(100))
  it('negatif süre 0 sayılır', () => expect(scorePoints(true, -3)).toBe(200))
  it('yanlış → −25', () => expect(scorePoints(false, 3)).toBe(-25))
  it('boş → 0', () => expect(scorePoints(null, 3)).toBe(0))
})

describe('remainingMs', () => {
  const start = Date.parse('2026-11-13T10:00:00Z')
  const base = { startedAt: null, speedupAt: null, speedupRemainingMs: null, durationMs: 120000 }

  it('başlamamış oyunda tam süre', () => {
    expect(remainingMs(base, start)).toBe(120000)
  })

  it('speedup yokken gerçek zamanlı akar ve 0 altına düşmez', () => {
    const g = { ...base, startedAt: new Date(start).toISOString() }
    expect(remainingMs(g, start + 30000)).toBe(90000)
    expect(remainingMs(g, start + 500000)).toBe(0)
  })

  it('speedup varsa 2× hızlı akar', () => {
    const speedupAt = start + 60000
    const g = {
      ...base,
      startedAt: new Date(start).toISOString(),
      speedupAt: new Date(speedupAt).toISOString(),
      speedupRemainingMs: 60000,
    }
    expect(remainingMs(g, speedupAt)).toBe(60000)
    expect(remainingMs(g, speedupAt + 10000)).toBe(40000)
    expect(remainingMs(g, speedupAt + 40000)).toBe(0)
  })
})

describe('rankPlayers', () => {
  const p = (userId: string, score: number, totalTimeMs: number): PlayerState => ({
    userId, displayName: userId, avatarKey: null, photoUrl: null,
    score, currentQ: 0, correctCount: 0, wrongCount: 0, finished: false, totalTimeMs,
  })

  it('puana göre azalan sıralar, rank 1\'den başlar', () => {
    const r = rankPlayers([p('a', 100, 0), p('b', 300, 0), p('c', 200, 0)])
    expect(r.map((x) => [x.userId, x.rank])).toEqual([['b', 1], ['c', 2], ['a', 3]])
  })

  it('eşitlikte totalTimeMs kısa olan üstte', () => {
    const r = rankPlayers([p('a', 200, 9000), p('b', 200, 5000)])
    expect(r.map((x) => x.userId)).toEqual(['b', 'a'])
  })
})
