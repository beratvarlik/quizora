import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/client'
import type { Profile } from '../types'
import { hataMesaji } from './hata'

/** Oturumu açar (anonim) ve profili getirir. */
export function useSession() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const id = await api.ensureSession()
      const p = await api.getProfile()
      setUserId(id)
      setProfile(p)
    } catch (e) {
      setError(hataMesaji(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { userId, profile, loading, error, refresh }
}
