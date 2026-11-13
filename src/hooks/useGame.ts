import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/client'
import type { GameSnapshot, Unsubscribe } from '../types'
import { hataMesaji } from './hata'

/** Kodla oyunu bulur, canlı abone olur ve sunucu saat farkını getirir. */
export function useGame(code: string | undefined) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [offsetMs, setOffsetMs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setError('Oyun kodu eksik')
      setLoading(false)
      return
    }
    let iptal = false
    let abonelik: Unsubscribe | null = null
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const id = await api.ensureSession()
        const [s, fark] = await Promise.all([api.getGameByCode(code), api.getServerOffsetMs()])
        if (iptal) return
        setUserId(id)
        setOffsetMs(fark)
        setSnapshot(s)
        abonelik = api.subscribeGame(s.game.id, yeni => {
          if (!iptal) setSnapshot(yeni)
        })
      } catch (e) {
        if (!iptal) setError(hataMesaji(e))
      } finally {
        if (!iptal) setLoading(false)
      }
    })()
    return () => {
      iptal = true
      abonelik?.()
    }
  }, [code])

  const me = useMemo(() => snapshot?.players.find(p => p.userId === userId) ?? null, [snapshot, userId])
  return { snapshot, me, userId, offsetMs, loading, error }
}
