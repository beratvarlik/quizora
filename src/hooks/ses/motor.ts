// Quizora ses motoru: tek AudioContext, müzik/efekt bus'ları, master compressor, ducking, ayarlar.
// Hiç ses dosyası yok; her şey Web Audio API ile üretilir.
//
// Zincir:  müzik kaynakları → muzikGiris → muzikFiltre (boğuk) → muzikDuck → muzikBus ┐
//          efekt kaynakları → efektBus ─────────────────────────────────────────────┴→ compressor → master → çıkış

export interface SesAyar {
  muzik: boolean
  efekt: boolean
}

const K_AYAR = 'quizora.ses'
const MASTER = 0.35
const MUZIK = 0.5
const EFEKT = 0.8
const BOGUK_SES = 0.6
const BOGUK_HZ = 650

function ayarOku(): SesAyar {
  try {
    const v = JSON.parse(localStorage.getItem(K_AYAR) ?? 'null') as Partial<SesAyar> | null
    if (v && typeof v === 'object') return { muzik: v.muzik !== false, efekt: v.efekt !== false }
  } catch {
    /* gizli sekme vb. */
  }
  return { muzik: true, efekt: true }
}

/** Kaynak bitince kendisini ve ona bağlı düğümleri ayırır (uzun düğüm zinciri birikmesin). */
export function bitince(kaynak: AudioScheduledSourceNode, ...dugumler: AudioNode[]) {
  kaynak.onended = () => {
    try {
      kaynak.disconnect()
      for (const d of dugumler) d.disconnect()
    } catch {
      /* zaten ayrılmış */
    }
  }
}

export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12)

class SesMotoru {
  ctx: AudioContext | null = null
  muzikGiris!: GainNode
  muzikFiltre!: BiquadFilterNode
  muzikDuck!: GainNode
  muzikBus!: GainNode
  efektBus!: GainNode
  gurultu!: AudioBuffer
  ayar: SesAyar = ayarOku()
  boguk = false
  private dinleyiciler = new Set<() => void>()
  private hazirIsler = new Set<() => void>()
  private kuruldu = false

  /** İlk dokunuşu ve sekme görünürlüğünü dinlemeye başla (bir kez). */
  kur() {
    if (this.kuruldu || typeof window === 'undefined') return
    this.kuruldu = true
    const ac = () => this.kilidiAc()
    for (const ad of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ad, ac, { capture: true, passive: true })
    // Sekme arka plana geçince her şey duraklar; dönünce kaldığı yerden devam eder (sıralayıcı ctx saatine bağlı).
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return
      if (document.hidden) void this.ctx.suspend()
      else void this.ctx.resume()
    })
  }

  /** iPhone Safari: AudioContext yalnızca kullanıcı dokunuşunda oluşturulabilir/açılabilir. */
  kilidiAc() {
    try {
      // Safari 17+: sessiz moddayken de çalsın
      const nav = navigator as Navigator & { audioSession?: { type: string } }
      if (nav.audioSession && nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback'
    } catch {
      /* desteklenmiyor */
    }
    if (!this.ctx) {
      const Sinif = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Sinif) return
      let ctx: AudioContext
      try {
        ctx = new Sinif({ latencyHint: 'interactive' })
      } catch {
        try {
          ctx = new Sinif() // eski Safari seçenek almaz
        } catch {
          return
        }
      }
      this.ctx = ctx
      this.grafikKur(ctx)
      // iOS kilit açma: tek örneklik sessiz tampon çal
      const b = ctx.createBuffer(1, 1, 22050)
      const s = ctx.createBufferSource()
      s.buffer = b
      s.connect(ctx.destination)
      s.start(0)
      for (const is of this.hazirIsler) is()
      this.hazirIsler.clear()
    }
    if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume()
  }

  private grafikKur(ctx: AudioContext) {
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 4
    comp.attack.value = 0.005
    comp.release.value = 0.2
    const master = ctx.createGain()
    master.gain.value = MASTER
    comp.connect(master).connect(ctx.destination)

    this.muzikGiris = ctx.createGain()
    this.muzikFiltre = ctx.createBiquadFilter()
    this.muzikFiltre.type = 'lowpass'
    this.muzikFiltre.frequency.value = 18000
    this.muzikFiltre.Q.value = 0.7
    this.muzikDuck = ctx.createGain()
    this.muzikBus = ctx.createGain()
    this.muzikGiris.connect(this.muzikFiltre).connect(this.muzikDuck).connect(this.muzikBus).connect(comp)
    this.efektBus = ctx.createGain()
    this.efektBus.connect(comp)
    this.kazanclariUygula(true)

    // 2 sn beyaz gürültü (tüm davul/korna/riser katmanları bunu paylaşır)
    const n = Math.floor(ctx.sampleRate * 2)
    this.gurultu = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = this.gurultu.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  }

  /** AudioContext hazır olunca çalışacak iş (hazırsa hemen). */
  hazirOlunca(is: () => void) {
    if (this.ctx) is()
    else this.hazirIsler.add(is)
  }

  get simdi(): number {
    return this.ctx?.currentTime ?? 0
  }

  /** Müzik ses kısma: 150 ms'de %40'a iner, `tutma` sn bekler, 600 ms'de geri gelir. */
  duck(t?: number, tutma = 0.3) {
    const ctx = this.ctx
    if (!ctx) return
    const b = Math.max(t ?? ctx.currentTime, ctx.currentTime)
    const g = this.muzikDuck.gain
    g.cancelScheduledValues(b)
    g.setValueAtTime(g.value, b)
    g.linearRampToValueAtTime(0.4, b + 0.15)
    g.setValueAtTime(0.4, b + 0.15 + tutma)
    g.linearRampToValueAtTime(1, b + 0.15 + tutma + 0.6)
  }

  /** Bitirip bekleyen oyuncu: müzik lowpass ile boğuk ve %60 seste. */
  bogukYap(acik: boolean) {
    if (this.boguk === acik) return
    this.boguk = acik
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.muzikFiltre.frequency.cancelScheduledValues(t)
    this.muzikFiltre.frequency.setValueAtTime(this.muzikFiltre.frequency.value, t)
    this.muzikFiltre.frequency.exponentialRampToValueAtTime(acik ? BOGUK_HZ : 18000, t + 0.6)
    this.kazanclariUygula()
  }

  private kazanclariUygula(ani = false) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const m = this.ayar.muzik ? MUZIK * (this.boguk ? BOGUK_SES : 1) : 0
    const e = this.ayar.efekt ? EFEKT : 0
    for (const [g, v] of [[this.muzikBus.gain, m], [this.efektBus.gain, e]] as const) {
      g.cancelScheduledValues(t)
      if (ani) g.setValueAtTime(v, t)
      else {
        g.setValueAtTime(g.value, t)
        g.linearRampToValueAtTime(v, t + 0.25)
      }
    }
  }

  ayarDegis(p: Partial<SesAyar>) {
    this.ayar = { ...this.ayar, ...p }
    try {
      localStorage.setItem(K_AYAR, JSON.stringify(this.ayar))
    } catch {
      /* yok say */
    }
    this.kazanclariUygula()
    for (const d of this.dinleyiciler) d()
  }

  dinle(d: () => void): () => void {
    this.dinleyiciler.add(d)
    return () => {
      this.dinleyiciler.delete(d)
    }
  }

  /** Paylaşılan gürültü tamponundan kaynak (uzun sesler için döngülü). */
  gurultuKaynak(t: number, sure: number): AudioBufferSourceNode {
    const ctx = this.ctx!
    const s = ctx.createBufferSource()
    s.buffer = this.gurultu
    s.loop = true // rastgele noktadan başlasa da süre boyunca kesilmesin
    s.start(t, Math.random() * 1.5)
    s.stop(t + sure + 0.05)
    return s
  }
}

export const motor = new SesMotoru()
