import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/client'
import type { ReviewItem } from '../types'
import { hataMesaji } from './hata'

const DENEME = 5
const bekle = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface IncelemeVerisi {
  /** position sırasıyla; yüklenirken null */
  liste: ReviewItem[] | null
  /** bu yarıştan Yanlışlarım defterine giren soru sayısı */
  eklenen: number
  hata: string | null
  tekrar: () => void
}

/**
 * Sonuç ekranının soru incelemesi (Maç analizi + Soruları incele aynı veriyi kullanır).
 * Yarış bitmeden çağrılırsa "henüz bitmedi" → 500 ms arayla en çok 5 kez yeniden dener.
 */
export function useInceleme(gameId: string | undefined): IncelemeVerisi {
  const [liste, setListe] = useState<ReviewItem[] | null>(null)
  const [eklenen, setEklenen] = useState(0)
  const [hata, setHata] = useState<string | null>(null)
  const [deneme, setDeneme] = useState(0)

  useEffect(() => {
    if (!gameId) return
    let iptal = false
    setHata(null)
    ;(async () => {
      for (let d = 0; d <= DENEME; d++) {
        try {
          const r = await api.getGameReview(gameId)
          if (iptal) return
          setListe([...r.items].sort((a, b) => a.position - b.position))
          setEklenen(r.addedToNotebook ?? 0)
          return
        } catch (e) {
          if (iptal) return
          if (/henüz bitmedi/i.test(hataMesaji(e)) && d < DENEME) await bekle(500)
          else {
            setHata('Sorular yüklenemedi, tekrar dene')
            return
          }
        }
      }
    })()
    return () => {
      iptal = true
    }
  }, [gameId, deneme])

  const tekrar = useCallback(() => setDeneme(d => d + 1), [])
  return { liste, eklenen, hata, tekrar }
}
