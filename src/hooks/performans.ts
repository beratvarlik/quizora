// Akıllı analiz / Performansım: tip types.ts'ten, getPerformance client.ts'teki api'den
// (mock modda da gerçek modda da aynı yer). Sayfalar performans verisini yalnızca buradan alır.
import { api } from '../lib/client'
import type { PerformanceStats, Sinav } from '../types'

export type { PerformanceStats }

/** exam verilmezse iki sınav birlikte; days 1-365 (sunucu varsayılanı 30). daily her zaman son 7 gün. */
export const getPerformance = (opts?: { exam?: Sinav; days?: number }): Promise<PerformanceStats> => api.getPerformance(opts)

/** accuracy sunucudan 1 ondalıklı gelir (66.7); ekranda tam sayı yüzde gösterilir. */
export const yuzdeYaz = (n: number) => Math.round(n)
