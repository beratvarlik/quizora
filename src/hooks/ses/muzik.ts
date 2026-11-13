// Quizora fon müziği: lookahead sıralayıcı (25 ms aralık, 100 ms ileri planlama, ctx.currentTime ile)
// ve sentez enstrümanlar. setInterval yalnızca planlamayı tetikler; notalar Web Audio saatine yazılır.
import { bitince, motor, mtof } from './motor'

// ---------------------------------------------------------------------
// Enstrümanlar (hepsi sentez). Hepsi (çıkış, zaman, …) alır; bitince ayrılır.
// ---------------------------------------------------------------------
const c = () => motor.ctx!

export function kick(out: AudioNode, t: number, v = 1) {
  const o = c().createOscillator()
  const g = c().createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(150, t)
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.38)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.4)
  bitince(o, g)
}

export function snare(out: AudioNode, t: number, v = 0.6) {
  const n = motor.gurultuKaynak(t, 0.2)
  const bp = c().createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1800
  bp.Q.value = 0.9
  const g = c().createGain()
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.17)
  n.connect(bp).connect(g).connect(out)
  bitince(n, bp, g)
  const o = c().createOscillator()
  const og = c().createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(190, t)
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08)
  og.gain.setValueAtTime(v * 0.5, t)
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
  o.connect(og).connect(out)
  o.start(t)
  o.stop(t + 0.1)
  bitince(o, og)
}

export function hat(out: AudioNode, t: number, v = 0.18, uzun = false) {
  const sure = uzun ? 0.12 : 0.035
  const n = motor.gurultuKaynak(t, sure)
  const hp = c().createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7500
  const g = c().createGain()
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  n.connect(hp).connect(g).connect(out)
  bitince(n, hp, g)
}

export function crash(out: AudioNode, t: number, v = 0.35, sure = 1.4) {
  const n = motor.gurultuKaynak(t, sure)
  const hp = c().createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 3500
  const g = c().createGain()
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  n.connect(hp).connect(g).connect(out)
  bitince(n, hp, g)
}

export function tom(out: AudioNode, t: number, f = 90, v = 0.7) {
  const o = c().createOscillator()
  const g = c().createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(f * 1.6, t)
  o.frequency.exponentialRampToValueAtTime(f, t + 0.08)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.36)
  bitince(o, g)
}

export function bas(out: AudioNode, t: number, f: number, sure: number, agresif = false, v = 0.32) {
  const o = c().createOscillator()
  const lp = c().createBiquadFilter()
  const g = c().createGain()
  o.type = agresif ? 'sawtooth' : 'square'
  o.frequency.value = f
  lp.type = 'lowpass'
  lp.Q.value = agresif ? 6 : 3
  lp.frequency.setValueAtTime(agresif ? 2400 : 900, t)
  lp.frequency.exponentialRampToValueAtTime(agresif ? 420 : 260, t + sure)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  o.connect(lp).connect(g).connect(out)
  o.start(t)
  o.stop(t + sure + 0.02)
  bitince(o, lp, g)
}

export function pluck(out: AudioNode, t: number, f: number, v = 0.22, sure = 0.2) {
  const o = c().createOscillator()
  const g = c().createGain()
  o.type = 'triangle'
  o.frequency.value = f
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + sure + 0.02)
  bitince(o, g)
}

export function pad(out: AudioNode, t: number, frekanslar: number[], sure: number, v = 0.045) {
  const lp = c().createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  const g = c().createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(v, t + Math.min(0.6, sure * 0.4))
  g.gain.setValueAtTime(v, t + sure - 0.3)
  g.gain.linearRampToValueAtTime(0.0001, t + sure + 0.3)
  lp.connect(g).connect(out)
  const oscs: OscillatorNode[] = []
  for (const f of frekanslar) {
    for (const det of [-7, 7]) {
      const o = c().createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = det
      o.connect(lp)
      o.start(t)
      o.stop(t + sure + 0.35)
      oscs.push(o)
    }
  }
  // son osilatör bitince filtre ve kazancı da ayır
  const son = oscs[oscs.length - 1]
  for (const o of oscs) bitince(o)
  if (son) {
    const eski = son.onended
    son.onended = e => {
      eski?.call(son, e)
      try {
        lp.disconnect()
        g.disconnect()
      } catch {
        /* yok say */
      }
    }
  }
}

// ---------------------------------------------------------------------
// Armoni: La minör, Am – F – C – G (her ölçü bir akor, 4 ölçüde bir döner)
// ---------------------------------------------------------------------
const MINOR = [
  { kok: 45, akor: [69, 72, 76] }, // Am
  { kok: 41, akor: [65, 69, 72] }, // F
  { kok: 48, akor: [64, 67, 72] }, // C
  { kok: 43, akor: [67, 71, 74] }, // G
]
// Kutlama: Do majör, C – G – Am – F
const MAJOR = [
  { kok: 48, akor: [72, 76, 79] },
  { kok: 43, akor: [71, 74, 79] },
  { kok: 45, akor: [72, 76, 81] },
  { kok: 41, akor: [69, 72, 77] },
]
const ARP = [0, 1, 2, 1, 0, 2, 1, 2]

export type MuzikModu = 'kapali' | 'sakin' | 'oyun' | 'kutlama'
export interface OyunDurumu {
  hizli: boolean
  son20: boolean
  son3: boolean
}

class Sirali {
  mod: MuzikModu = 'kapali'
  private giris: GainNode | null = null
  private zamanlayici: number | null = null
  private adim = 0 // 0..15 (bir ölçü = 16 onaltılık)
  private olcu = 0
  private sonraki = 0
  private bpm = 112
  private bpmBas = 112
  private bpmHedef = 112
  private gecis = false
  // Uygulanan ve bekleyen (bir sonraki ölçü başında uygulanacak) oyun durumu
  private durum: OyunDurumu = { hizli: false, son20: false, son3: false }
  private bekleyen: OyunDurumu = { hizli: false, son20: false, son3: false }
  private hafif = false // telefonda takılırsa pad ve hat sadeleşir
  private gec = 0

  /** Modu başlat; `t0` verilirse ilk vuruş tam o ana yazılır (örn. kornanın bittiği an). */
  baslat(mod: MuzikModu, t0?: number) {
    if (mod === this.mod) return
    this.durdur(false)
    if (mod === 'kapali') return
    const ctx = motor.ctx
    if (!ctx) return
    this.mod = mod
    this.giris = ctx.createGain()
    this.giris.connect(motor.muzikGiris)
    this.adim = 0
    this.olcu = 0
    this.durum = { ...this.bekleyen }
    const bpm = this.hedefBpm()
    this.bpm = this.bpmBas = this.bpmHedef = bpm
    this.gecis = false
    this.sonraki = Math.max(t0 ?? ctx.currentTime + 0.06, ctx.currentTime + 0.01)
    this.zamanlayici = window.setInterval(this.tik, 25)
  }

  /** Durdur. `kesme`: ani kesiş (oyun sonu), değilse yumuşak sönüş. */
  durdur(kesme: boolean) {
    if (this.zamanlayici !== null) window.clearInterval(this.zamanlayici)
    this.zamanlayici = null
    this.mod = 'kapali'
    const g = this.giris
    this.giris = null
    const ctx = motor.ctx
    if (!g || !ctx) return
    const t = ctx.currentTime
    g.gain.cancelScheduledValues(t)
    g.gain.setValueAtTime(g.gain.value, t)
    g.gain.linearRampToValueAtTime(0, t + (kesme ? 0.03 : 0.6))
    window.setTimeout(() => {
      try {
        g.disconnect()
      } catch {
        /* yok say */
      }
    }, 1200)
  }

  /** Oyun durumu: yeni seviye bir sonraki ölçü başında uygulanır. */
  oyunDurumu(d: OyunDurumu) {
    this.bekleyen = d
  }

  private hedefBpm(): number {
    if (this.mod === 'sakin') return 90
    if (this.mod === 'kutlama') return 100
    const b = this.durum.hizli ? 140 : 112
    return this.durum.son20 ? b + 15 : b
  }

  private tik = () => {
    const ctx = motor.ctx
    if (!ctx || !this.giris) return
    // Geride kaldıysak (sekme/takılma) toparlan; tekrarlıyorsa katmanları sadeleştir.
    if (ctx.currentTime - this.sonraki > 0.05) {
      this.sonraki = ctx.currentTime + 0.02
      if (++this.gec >= 3) this.hafif = true
    }
    while (this.sonraki < ctx.currentTime + 0.1) {
      this.adimCal(this.adim, this.sonraki)
      this.ilerle()
    }
  }

  private ilerle() {
    // BPM geçişi bir ölçü boyunca kademeli
    if (this.gecis) this.bpm = this.bpmBas + ((this.bpmHedef - this.bpmBas) * (this.adim + 1)) / 16
    this.sonraki += 60 / this.bpm / 4
    this.adim++
    if (this.adim >= 16) {
      this.adim = 0
      this.olcu++
      if (this.gecis) {
        this.gecis = false
        this.bpm = this.bpmHedef
      }
      // Bekleyen seviye ölçü başında uygulanır
      const b = this.bekleyen
      if (b.hizli !== this.durum.hizli || b.son20 !== this.durum.son20 || b.son3 !== this.durum.son3) {
        this.durum = { ...b }
        const hedef = this.hedefBpm()
        if (hedef !== this.bpm) {
          this.bpmBas = this.bpm
          this.bpmHedef = hedef
          this.gecis = true
        }
      }
    }
  }

  private adimCal(s: number, t: number) {
    if (!motor.ayar.muzik || !this.giris) return
    const out = this.giris
    const olcuSn = (60 / this.bpm) * 4
    if (this.mod === 'sakin') return this.sakin(out, s, t, olcuSn)
    if (this.mod === 'kutlama') return this.kutlama(out, s, t, olcuSn)
    if (this.mod === 'oyun') this.oyun(out, s, t, olcuSn)
  }

  private sakin(out: AudioNode, s: number, t: number, olcuSn: number) {
    const a = MINOR[this.olcu % 4]
    if (s === 0) pad(out, t, a.akor.map(m => mtof(m - 12)), olcuSn, 0.05)
    if (s === 0 || s === 8) bas(out, t, mtof(a.kok), olcuSn / 2 - 0.05, false, 0.16)
  }

  private kutlama(out: AudioNode, s: number, t: number, olcuSn: number) {
    const a = MAJOR[this.olcu % 4]
    if (s === 0) pad(out, t, a.akor.map(m => mtof(m - 12)), olcuSn, 0.04)
    if (s === 0 || s === 8) kick(out, t, 0.45)
    if (s === 4 || s === 12) snare(out, t, 0.22)
    if (s % 2 === 0) {
      hat(out, t, 0.06)
      pluck(out, t, mtof(a.akor[ARP[(s / 2) % 8]] ?? a.akor[0]), 0.13, 0.25)
    }
    if (s % 4 === 0) bas(out, t, mtof(a.kok), 0.22, false, 0.14)
  }

  private oyun(out: AudioNode, s: number, t: number, olcuSn: number) {
    const { hizli, son20, son3 } = this.durum
    const a = MINOR[this.olcu % 4]
    // İlk vuruş ve 2×'te her ölçü başı: crash
    if (s === 0 && (hizli || (this.olcu === 0 && !this.hafif))) crash(out, t, hizli ? 0.28 : 0.22, hizli ? 0.9 : 1.2)
    // Kick: normalde 1 ve 3 + ara vuruş; son 20 sn four-on-the-floor; son 3 sn sekizlik
    const kickler = son3 ? [0, 2, 4, 6, 8, 10, 12, 14] : son20 ? [0, 4, 8, 12] : [0, 8, this.olcu % 2 ? 11 : 10]
    if (kickler.includes(s)) kick(out, t, 0.95)
    // Snare 2 ve 4; son 20 sn'de her iki ölçüde bir roll
    if (s === 4 || s === 12) snare(out, t, 0.55)
    if (son20 && this.olcu % 2 === 1 && s >= 12) snare(out, t, 0.18 + (s - 12) * 0.09)
    // Hat: sekizlik; 2×'te onaltılık (telefonda takılırsa sekizlik kalır)
    const onalti = hizli && !this.hafif
    if (onalti || s % 2 === 0) hat(out, t, s % 4 === 2 ? 0.2 : 0.12, s === 14 && !onalti)
    // Bas: sekizlik pulsing, akor köküne göre; 2×'te filtre açık ve agresif
    if (s % 2 === 0) bas(out, t, mtof(a.kok + (s % 4 === 2 ? 12 : 0)), (60 / this.bpm) * 0.45, hizli, hizli ? 0.3 : 0.26)
    // Arp/lead: 2×'te ya da son 20 sn'de girer; son 20 sn'de bir oktav yukarı
    if (hizli || son20) {
      const sekiz = !hizli
      if (!sekiz || s % 2 === 0) {
        const nota = a.akor[ARP[(sekiz ? s / 2 : s) % 8]] ?? a.akor[0]
        pluck(out, t, mtof(nota + (son20 ? 12 : 0)), hizli ? 0.15 : 0.12, 0.16)
      }
    }
    // Pad: yumuşak doluluk (takılmada kapanır)
    if (s === 0 && !this.hafif) pad(out, t, a.akor.map(m => mtof(m - 12)), olcuSn, hizli ? 0.03 : 0.04)
  }
}

export const muzik = new Sirali()
