import type { GameInfo, PlayerState } from '../types'

/** Tek soru puanı: doğru 100..200 (hıza göre), yanlış −25, boş 0. t = gerçek saniye. */
export function scorePoints(correct: boolean | null, tSeconds: number): number {
  if (correct === null) return 0
  if (!correct) return -25
  const t = Math.max(0, tSeconds)
  return 100 + Math.round(100 * Math.max(0, 1 - t / 20))
}

/** Oyunda kalan süre (ms). Hızlandırma başladıysa kalan süre 2× hızlı akar. */
export function remainingMs(
  game: Pick<GameInfo, 'startedAt' | 'speedupAt' | 'speedupRemainingMs' | 'durationMs'>,
  nowMs: number,
): number {
  if (!game.startedAt) return game.durationMs
  if (!game.speedupAt || game.speedupRemainingMs === null) {
    return Math.max(0, game.durationMs - (nowMs - new Date(game.startedAt).getTime()))
  }
  return Math.max(0, game.speedupRemainingMs - 2 * (nowMs - new Date(game.speedupAt).getTime()))
}

/** Puan azalan, eşitlikte totalTimeMs artan; rank 1'den başlar. */
export function rankPlayers(players: PlayerState[]): Array<PlayerState & { rank: number }> {
  return [...players]
    .sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs)
    .map((p, i) => ({ ...p, rank: i + 1 }))
}
