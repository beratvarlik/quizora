import { useEffect, useState } from 'react'
import { remainingMs } from '../lib/scoring'
import type { GameInfo } from '../types'

export type Faz = 'lobi' | 'gerisayim' | 'oyun' | 'bitti'

/** Oyun saatini 100 ms'de bir hesaplar (sunucu saatine göre). `simdi` = tahmini sunucu saati (ms). */
export function useCountdown(game: GameInfo | null | undefined, offsetMs: number) {
  const [simdi, setSimdi] = useState(() => Date.now() + offsetMs)

  useEffect(() => {
    const t = window.setInterval(() => setSimdi(Date.now() + offsetMs), 100)
    setSimdi(Date.now() + offsetMs)
    return () => window.clearInterval(t)
  }, [offsetMs])

  if (!game || game.status === 'lobby' || !game.startedAt) {
    return { phase: 'lobi' as Faz, geriSayim: 3, kalanMs: game?.durationMs ?? 120000, hizli: false, simdi }
  }
  const hizli = Boolean(game.speedupAt)
  if (game.status === 'finished') return { phase: 'bitti' as Faz, geriSayim: 0, kalanMs: 0, hizli, simdi }
  const baslangic = new Date(game.startedAt).getTime()
  if (simdi < baslangic) {
    const geriSayim = Math.min(3, Math.max(1, Math.ceil((baslangic - simdi) / 1000)))
    return { phase: 'gerisayim' as Faz, geriSayim, kalanMs: game.durationMs, hizli, simdi }
  }
  const kalanMs = remainingMs(game, simdi)
  return { phase: (kalanMs <= 0 ? 'bitti' : 'oyun') as Faz, geriSayim: 0, kalanMs, hizli, simdi }
}
