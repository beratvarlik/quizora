import { useEffect, useState } from 'react'

/** Tarayıcı çevrimdışı olunca false döner (bağlantı koptu bandı için). */
export function useBaglanti() {
  const [cevrimici, setCevrimici] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const ac = () => setCevrimici(true)
    const kapa = () => setCevrimici(false)
    window.addEventListener('online', ac)
    window.addEventListener('offline', kapa)
    return () => {
      window.removeEventListener('online', ac)
      window.removeEventListener('offline', kapa)
    }
  }, [])
  return cevrimici
}
