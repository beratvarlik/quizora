import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/client'
import type { GameResult } from '../types'

const DENEME = 5
const ARA_MS = 500
const bekle = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * finishGame'i yeniden denemeyle çağırır (ENTEGRASYON.md §8): hata olursa 500 ms sonra yeniden,
 * en çok 5 kez. Aynı istemcide tek sefer çalışır (ref kilidi); başarılıysa sonucu da taşıyarak
 * /sonuc/:code'a gider. Hepsi başarısızsa hata metni döner, `bitir()` tekrar denenebilir.
 */
export async function finishGameYeniden(gameId: string): Promise<GameResult> {
  let son: unknown
  for (let d = 0; d <= DENEME; d++) {
    try {
      return await api.finishGame(gameId)
    } catch (e) {
      son = e
      if (d < DENEME) await bekle(ARA_MS)
    }
  }
  throw son
}

export function useBitir(gameId: string | undefined, code: string | undefined) {
  const git = useNavigate()
  const kilit = useRef(false)
  const [bekliyor, setBekliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  /** `gecikmeMs`: sonuca geçmeden önce en az bu kadar bekle (bitiş kornası çalsın). */
  const bitir = useCallback(async (gecikmeMs = 0) => {
    if (!gameId || !code || kilit.current) return
    const t0 = Date.now()
    kilit.current = true
    setBekliyor(true)
    setHata(null)
    try {
      const sonuc = await finishGameYeniden(gameId)
      const kalan = gecikmeMs - (Date.now() - t0)
      if (kalan > 0) await bekle(kalan)
      git(`/sonuc/${code}`, { replace: true, state: { sonuc } })
    } catch {
      setHata('Sonuçlar alınamadı, tekrar dene')
      kilit.current = false // "Tekrar dene" düğmesi yeniden çağırabilsin
    } finally {
      setBekliyor(false)
    }
  }, [gameId, code, git])

  return { bitir, bekliyor, hata }
}
