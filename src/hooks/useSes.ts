import { useEffect, useMemo, useState } from 'react'
import * as E from './ses/efektler'
import { motor, type SesAyar } from './ses/motor'
import { muzik, type MuzikModu, type OyunDurumu } from './ses/muzik'

// Oyun başına bir kez çalışacak olaylar (sayfa değişse/yeniden render olsa da tekrar etmesin)
const planlananlar = new Set<string>()
const bitenler = new Set<string>()
const torenler = new Set<string>()
const sonSaniye = new Map<string, number>()

// AudioContext henüz yokken istenen müzik modu: ilk dokunuşta uygulanır
let bekleyenMod: MuzikModu | null = null
let bekleyenKayitli = false
function modIste(m: MuzikModu) {
  if (motor.ctx) {
    muzik.baslat(m)
    return
  }
  bekleyenMod = m
  if (bekleyenKayitli) return
  bekleyenKayitli = true
  motor.hazirOlunca(() => {
    if (bekleyenMod) muzik.baslat(bekleyenMod)
    bekleyenMod = null
  })
}

/** Sayfaların kullandığı ses arayüzü (durumsuz; modül düzeyinde tek motor). */
export const SES = {
  efekt: E.efekt,
  ayarDegis: (p: Partial<SesAyar>) => motor.ayarDegis(p),

  /** Menü/lobi: sakin müzik; 'kapali' ile susar. */
  muzikModu: modIste,

  /** 3-2-1 bipleri + başlama kornası startedAt anına; müzik kornanın bittiği an girer. */
  baslangicPlanla(gameId: string, startedAtMs: number, offsetMs: number) {
    const ctx = motor.ctx
    if (!ctx || planlananlar.has(gameId)) return
    planlananlar.add(gameId)
    const kalanSn = (startedAtMs - (Date.now() + offsetMs)) / 1000
    if (kalanSn < -1.5) {
      muzik.baslat('oyun') // oyuna geç girildi (yenileme): korna yok
      return
    }
    const kornaSonu = E.baslangic(ctx.currentTime + kalanSn)
    muzik.durdur(false)
    muzik.baslat('oyun', kornaSonu)
  },

  /** Oyun sırasında seviye: 2× → seviye 2, son 20 sn → seviye 3 (bir sonraki ölçüde uygulanır). */
  oyunDurumu(d: OyunDurumu) {
    if (!motor.ctx) return
    if (muzik.mod !== 'oyun') muzik.baslat('oyun')
    muzik.oyunDurumu(d)
  },

  /** Son 5 sn: riser (bir kez) + her saniye tik-tak. `kalanMs` oyun saati, `hizli` 2× (gerçek süre yarı). */
  sayac(gameId: string, kalanMs: number, hizli: boolean) {
    if (!motor.ctx || kalanMs <= 0) return
    const sn = Math.ceil(kalanMs / 1000)
    if (sn > 5 || sonSaniye.get(gameId) === sn) return
    const ilk = !sonSaniye.has(gameId)
    sonSaniye.set(gameId, sn)
    if (ilk) E.riser(motor.simdi + 0.02, Math.max(0.5, (hizli ? kalanMs / 2 : kalanMs) / 1000))
    E.tiktak(sn <= 3)
  },

  /** 2× tetiklendi: whoosh + elektrik çatırtısı. */
  hizGecisi: E.hizGecisi,

  /** Bitirip bekleyen oyuncu: müzik boğuk ve kısık. */
  boguk: (acik: boolean) => motor.bogukYap(acik),

  /** Oyun bitti: müzik kesilir + 3 korna. Kornaların süresini (ms) döndürür; müzik çalmıyorsa 0. */
  oyunBitti(gameId: string): number {
    if (bitenler.has(gameId)) return 0
    bitenler.add(gameId)
    motor.bogukYap(false)
    if (!motor.ctx || muzik.mod !== 'oyun') return 0
    muzik.durdur(true)
    const t = motor.simdi + 0.02
    const son = E.bitisKornasi(t)
    return Math.round((son - t) * 1000) + 150
  },

  /** Sonuç töreni; bitince mutlu kutlama döngüsü. */
  toren(gameId: string, n: number, benSira: number | null, rutbeAtlandi: boolean) {
    if (!motor.ctx || torenler.has(gameId)) return
    torenler.add(gameId)
    muzik.durdur(false)
    const son = E.toren(n, benSira, rutbeAtlandi)
    muzik.baslat('kutlama', son + 0.2)
  },

  /** Test paneli için doğrudan erişim. */
  test: {
    baslamaKornasi() {
      if (!motor.ctx) return
      muzik.durdur(false)
      muzik.baslat('oyun', E.baslangic(motor.simdi + 3))
    },
    seviye(s: 1 | 2 | 3) {
      SES.oyunDurumu({ hizli: s >= 2, son20: s === 3, son3: false })
    },
    riser: () => motor.ctx && E.riser(motor.simdi + 0.02, 5),
    bitisKornasi() {
      if (!motor.ctx) return
      muzik.durdur(true)
      E.bitisKornasi(motor.simdi + 0.02)
    },
    kutlama() {
      if (!motor.ctx) return
      muzik.durdur(false)
      muzik.baslat('kutlama', E.toren(5, 3, true) + 0.2)
    },
    sakin: () => muzik.baslat('sakin'),
    durdur: () => muzik.durdur(false),
  },
}

/** Ses ayarlarını (Müzik / Efektler) reaktif verir; ses fonksiyonları SES üzerinden. */
export function useSes() {
  const [ayar, setAyar] = useState<SesAyar>(motor.ayar)
  useEffect(() => {
    motor.kur()
    return motor.dinle(() => setAyar({ ...motor.ayar }))
  }, [])
  return useMemo(() => ({ ...SES, ayar }), [ayar])
}
