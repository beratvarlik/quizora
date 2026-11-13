import { useCallback, useEffect, useState } from 'react'
import { getDailyTasks, gorevDinle, type DailyTasks } from './gorevler'

/**
 * Günlük görevler: veri + canlı "yenilenmesine" sayacı. resetsAt geçince (gün değişince)
 * kendiliğinden yeniler; görev ilerleyince / ödül alınınca da yenilenir.
 */
export function useGorevler() {
  const [veri, setVeri] = useState<DailyTasks | null>(null)
  const [hata, setHata] = useState(false)
  const [simdi, setSimdi] = useState(() => Date.now())

  const yenile = useCallback(() => {
    getDailyTasks().then(
      v => {
        setVeri(v)
        setHata(false)
      },
      () => setHata(true),
    )
  }, [])

  useEffect(() => {
    yenile()
    return gorevDinle(yenile)
  }, [yenile])

  // Saniyelik sayaç (yalnızca ekran; hafif)
  useEffect(() => {
    const t = window.setInterval(() => setSimdi(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Gün değişimi: resetsAt'ten hemen sonra yenile
  const resetsAt = veri?.resetsAt
  useEffect(() => {
    if (!resetsAt) return
    const kalan = Date.parse(resetsAt) - Date.now()
    const t = window.setTimeout(yenile, Math.max(0, kalan) + 800)
    return () => window.clearTimeout(t)
  }, [resetsAt, yenile])

  const kalanMs = resetsAt ? Math.max(0, Date.parse(resetsAt) - simdi) : 0
  const tamam = veri?.tasks.filter(t => t.completed).length ?? 0
  const bekleyen = veri ? veri.tasks.some(t => t.completed && !t.claimed) || (veri.bonus.completed && !veri.bonus.claimed) : false
  return { veri, hata, yenile, kalanMs, tamam, bekleyen }
}
