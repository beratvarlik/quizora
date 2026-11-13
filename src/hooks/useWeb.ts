import { useEffect, useState } from 'react'

const SORGU = '(min-width: 1024px)'

/** Web (≥1024px) düzeni mi? Pencere boyutu değişince güncellenir. */
export function useWeb(): boolean {
  const [web, setWeb] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(SORGU).matches === true)
  useEffect(() => {
    const m = window.matchMedia?.(SORGU)
    if (!m) return
    const degis = () => setWeb(m.matches)
    degis()
    m.addEventListener('change', degis)
    return () => m.removeEventListener('change', degis)
  }, [])
  return web
}
