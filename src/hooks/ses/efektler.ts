// Quizora efektleri: stadyum kornası, geri sayım bipleri, bitiş kornası, kutlama töreni ve kısa arayüz sesleri.
import { bitince, motor, mtof } from './motor'
import { crash, kick, pluck, snare, tom } from './muzik'

const c = () => motor.ctx!
const out = () => motor.efektBus
const hazir = () => Boolean(motor.ctx) && motor.ayar.efekt

// ---------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------
let bozucu: Float32Array<ArrayBuffer> | null = null
function bozmaEgrisi(): Float32Array<ArrayBuffer> {
  if (bozucu) return bozucu
  const n = 1024
  const k = 8
  bozucu = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    bozucu[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return bozucu
}

function sinus(t: number, f: number, sure: number, v: number, tip: OscillatorType = 'sine', hedef: AudioNode = out()) {
  const o = c().createOscillator()
  const g = c().createGain()
  o.type = tip
  o.frequency.value = f
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  o.connect(g).connect(hedef)
  o.start(t)
  o.stop(t + sure + 0.02)
  bitince(o, g)
  return o
}

function gurultuPatlama(t: number, sure: number, v: number, tip: BiquadFilterType, f: number, q = 0.8) {
  const n = motor.gurultuKaynak(t, sure)
  const fl = c().createBiquadFilter()
  fl.type = tip
  fl.frequency.value = f
  fl.Q.value = q
  const g = c().createGain()
  g.gain.setValueAtTime(v, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  n.connect(fl).connect(g).connect(out())
  bitince(n, fl, g)
}

// ---------------------------------------------------------------------
// KORNA: stadyum/air horn. 4 hafif detune sawtooth (~233 Hz Si♭), waveshaper, lowpass 2.5 kHz.
// Başta yarım ton aşağıdan kayar, sonda kısa düşüş. Altında sub-bass vuruşu + gürültü patlaması.
// ---------------------------------------------------------------------
export function korna(t: number, sure = 0.9, yarimTon = 0, dolu = false): number {
  if (!hazir()) return t + sure
  const ctx = c()
  const f = 233.08 * 2 ** (yarimTon / 12)
  const ws = ctx.createWaveShaper()
  ws.curve = bozmaEgrisi()
  ws.oversample = '2x'
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2500
  lp.Q.value = 0.8
  const g = ctx.createGain()
  const v = dolu ? 0.32 : 0.26
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.02)
  g.gain.setValueAtTime(v, t + sure - 0.08)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  ws.connect(lp).connect(g).connect(out())
  const sesler: Array<[number, OscillatorType, number]> = [
    [-11, 'sawtooth', 1],
    [-4, 'sawtooth', 1],
    [5, 'sawtooth', 1],
    [12, 'sawtooth', 1],
  ]
  if (dolu) sesler.push([0, 'square', 0.5], [3, 'sawtooth', 2]) // ekstra: alt oktav kare + üst oktav
  const oscs: OscillatorNode[] = []
  for (const [det, tip, kat] of sesler) {
    const o = ctx.createOscillator()
    const og = ctx.createGain()
    o.type = tip
    og.gain.value = tip === 'square' ? 0.18 : 0.25
    const hf = f * kat
    o.frequency.setValueAtTime(hf * 2 ** (-1 / 12), t) // yarım ton aşağıdan
    o.frequency.exponentialRampToValueAtTime(hf, t + 0.07)
    o.frequency.setValueAtTime(hf, t + sure - 0.1)
    o.frequency.exponentialRampToValueAtTime(hf * 0.9, t + sure) // sonda kısa düşüş
    o.detune.value = det
    o.connect(og).connect(ws)
    o.start(t)
    o.stop(t + sure + 0.02)
    bitince(o, og)
    oscs.push(o)
  }
  oscs[0].addEventListener('ended', () => {
    try {
      ws.disconnect()
      lp.disconnect()
      g.disconnect()
    } catch {
      /* yok say */
    }
  })
  // Sub-bass vuruşu + beyaz gürültü patlaması
  const sub = ctx.createOscillator()
  const sg = ctx.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(dolu ? 90 : 75, t)
  sub.frequency.exponentialRampToValueAtTime(40, t + 0.35)
  sg.gain.setValueAtTime(0.0001, t)
  sg.gain.exponentialRampToValueAtTime(dolu ? 0.9 : 0.7, t + 0.008)
  sg.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
  sub.connect(sg).connect(out())
  sub.start(t)
  sub.stop(t + 0.42)
  bitince(sub, sg)
  gurultuPatlama(t, 0.14, 0.35, 'highpass', 1200)
  motor.duck(t, sure)
  return t + sure
}

/** Geri sayım biplemesi: 3-2-1 aynı perdede, kısa. */
export function bip(t: number) {
  if (!hazir()) return
  sinus(t, 880, 0.12, 0.35, 'square')
  sinus(t, 1760, 0.08, 0.08)
}

/** 3-2-1 bipleri + T anında başlama kornası. Kornanın bittiği anı döndürür (müzik o an girer). */
export function baslangic(T: number): number {
  const ctx = c()
  for (const k of [3, 2, 1]) if (T - k > ctx.currentTime - 0.05) bip(T - k)
  return korna(Math.max(T, ctx.currentTime + 0.01), 0.9)
}

/** Bitiş: son vuruşta cymbal, korna 3 kez (kısa – kısa – UZUN, son korna +2 yarım ton ve daha dolu). */
export function bitisKornasi(t: number): number {
  if (!motor.ctx) return t
  if (motor.ayar.efekt) crash(out(), t, 0.4, 1.6)
  korna(t + 0.05, 0.25)
  korna(t + 0.45, 0.25)
  return korna(t + 0.85, 1.1, 2, true)
}

// ---------------------------------------------------------------------
// Oyun içi geçişler
// ---------------------------------------------------------------------
export function whoosh(t: number) {
  if (!hazir()) return
  const n = motor.gurultuKaynak(t, 0.6)
  const bp = c().createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(300, t)
  bp.frequency.exponentialRampToValueAtTime(4500, t + 0.5)
  const g = c().createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.3)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
  n.connect(bp).connect(g).connect(out())
  bitince(n, bp, g)
}

export function elektrik(t: number) {
  if (!hazir()) return
  for (let i = 0; i < 9; i++) gurultuPatlama(t + Math.random() * 0.45, 0.02 + Math.random() * 0.03, 0.25 + Math.random() * 0.2, 'highpass', 3000 + Math.random() * 3000)
  sinus(t, 60, 0.35, 0.12, 'square')
}

/** 2× tetiklenince: whoosh + elektrik çatırtısı. */
export function hizGecisi() {
  if (!motor.ctx) return
  const t = motor.simdi + 0.02
  motor.duck(t, 0.5)
  whoosh(t)
  elektrik(t + 0.15)
}

/** Son 5 sn: gürültü + filtre süpürmesi + yükselen sine. `sure` gerçek saniye. */
export function riser(t: number, sure: number) {
  if (!hazir()) return
  const ctx = c()
  const n = motor.gurultuKaynak(t, sure)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.5
  bp.frequency.setValueAtTime(400, t)
  bp.frequency.exponentialRampToValueAtTime(6000, t + sure)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.28, t + sure)
  g.gain.linearRampToValueAtTime(0.0001, t + sure + 0.05)
  n.connect(bp).connect(g).connect(out())
  bitince(n, bp, g)
  const o = ctx.createOscillator()
  const og = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(200, t)
  o.frequency.exponentialRampToValueAtTime(1200, t + sure)
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(0.12, t + sure)
  og.gain.linearRampToValueAtTime(0.0001, t + sure + 0.05)
  o.connect(og).connect(out())
  o.start(t)
  o.stop(t + sure + 0.08)
  bitince(o, og)
}

/** Saat tik-tak (son 5 sn'de her saniye). */
export function tiktak(yuksek: boolean) {
  if (!hazir()) return
  const t = motor.simdi + 0.005
  sinus(t, yuksek ? 1600 : 1150, 0.035, 0.22)
  gurultuPatlama(t, 0.02, 0.15, 'highpass', 5000)
}

// ---------------------------------------------------------------------
// Kutlama
// ---------------------------------------------------------------------
/** Podyuma oturma: tok "dum" (kick + düşük tom); sırası iyileştikçe biraz daha yüksek. */
export function dum(t: number, yukseklik: number) {
  if (!hazir()) return
  kick(out(), t, 0.8)
  tom(out(), t, 70 + yukseklik * 14, 0.6)
}

/** Davul ruleti: hızlanan snare roll. */
export function davulRuleti(t: number, sure: number) {
  if (!hazir()) return
  let x = t
  let ara = 0.12
  while (x < t + sure) {
    const ilerleme = (x - t) / sure
    snare(out(), x, 0.15 + ilerleme * 0.4)
    x += ara
    ara = Math.max(0.03, ara * 0.9)
  }
}

function brass(t: number, notalar: number[], sure: number, v = 0.12) {
  const ctx = c()
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 1.5
  lp.frequency.setValueAtTime(600, t)
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.06)
  lp.frequency.exponentialRampToValueAtTime(1400, t + Math.min(sure, 0.4))
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(v, t + 0.03)
  g.gain.setValueAtTime(v, t + sure - 0.08)
  g.gain.exponentialRampToValueAtTime(0.001, t + sure)
  lp.connect(g).connect(out())
  let ilk: OscillatorNode | null = null
  for (const m of notalar)
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = mtof(m)
      o.detune.value = det
      o.connect(lp)
      o.start(t)
      o.stop(t + sure + 0.02)
      bitince(o)
      ilk ??= o
    }
  ilk?.addEventListener('ended', () => {
    try {
      lp.disconnect()
      g.disconnect()
    } catch {
      /* yok say */
    }
  })
}

/** Zafer fanfarı: Do – Mi – Sol – Do' (son akor uzun). */
export function fanfar(t: number): number {
  if (!hazir()) return t
  brass(t, [60, 64, 67], 0.16)
  brass(t + 0.2, [64, 67, 72], 0.16)
  brass(t + 0.4, [67, 72, 76], 0.16)
  brass(t + 0.6, [60, 64, 67, 72, 76], 1.4, 0.1)
  motor.duck(t, 1.6)
  return t + 2
}

/** Kalabalık tezahüratı: filtrelenmiş, dalgalanan gürültü (~2 sn). */
export function tezahurat(t: number, sure = 2) {
  if (!hazir()) return
  const ctx = c()
  const n = motor.gurultuKaynak(t, sure)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1100
  bp.Q.value = 0.6
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3200
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.22, t + 0.35)
  g.gain.setValueAtTime(0.22, t + sure - 0.6)
  g.gain.linearRampToValueAtTime(0.0001, t + sure)
  // dalgalanma: yavaş LFO kazancı oynatır
  const lfo = ctx.createOscillator()
  const lg = ctx.createGain()
  lfo.frequency.value = 3.5 + Math.random() * 2
  lg.gain.value = 0.08
  lfo.connect(lg).connect(g.gain)
  lfo.start(t)
  lfo.stop(t + sure)
  bitince(lfo, lg)
  n.connect(bp).connect(lp).connect(g).connect(out())
  bitince(n, bp, lp, g)
}

/** Konfeti ışıltısı: rastgele, kısa, yüksek sine'lar. */
export function isilti(t: number, adet = 9, sure = 0.9) {
  if (!hazir()) return
  for (let i = 0; i < adet; i++) sinus(t + Math.random() * sure, 2000 + Math.random() * 3000, 0.12 + Math.random() * 0.1, 0.06 + Math.random() * 0.05)
}

/** Rütbe atlama: yükselen arpej + parlak "ding". */
export function rutbeAtladi(t: number) {
  if (!hazir()) return
  ;[72, 76, 79, 84, 88].forEach((m, i) => pluck(out(), t + i * 0.07, mtof(m), 0.2, 0.3))
  sinus(t + 0.38, mtof(96), 1.1, 0.16)
  sinus(t + 0.38, mtof(108), 0.7, 0.05)
  motor.duck(t, 1)
}

export function jingleIyi(t: number) {
  if (!hazir()) return
  ;[67, 72, 76, 79].forEach((m, i) => pluck(out(), t + i * 0.09, mtof(m), 0.2, 0.25))
  brass(t + 0.38, [72, 76, 79], 0.6, 0.07)
}

export function notr(t: number) {
  if (!hazir()) return
  sinus(t, mtof(64), 0.35, 0.12, 'triangle')
  sinus(t + 0.22, mtof(60), 0.6, 0.1, 'triangle')
}

/**
 * Sonuç ekranı töreni. Sıralama satırları CSS'te 0.15 + i·0.12 sn gecikmeyle girer; her satıra bir
 * "dum", ardından gerilim (davul ruleti + riser), sonra 1. için büyük vuruş + fanfar + tezahürat + ışıltı.
 * Bitiş anını döndürür (kutlama döngüsü o an girer).
 */
export function toren(n: number, benSira: number | null, rutbeAtlandi: boolean): number {
  if (!motor.ctx) return 0
  const t0 = motor.simdi + 0.05
  for (let i = 0; i < n; i++) dum(t0 + 0.15 + i * 0.12, n - i)
  const g = t0 + 0.3 + n * 0.12
  davulRuleti(g, 1.1)
  riser(g, 1.1)
  const zafer = g + 1.1
  if (motor.ayar.efekt) {
    kick(out(), zafer, 1)
    crash(out(), zafer, 0.45, 1.8)
  }
  const fanfarSonu = fanfar(zafer + 0.02)
  tezahurat(zafer + 0.05, 2)
  isilti(zafer + 0.1, 12, 1.2)
  let son = fanfarSonu
  // Kendi sonucuna göre kısa jingle (1. ise fanfar zaten onun)
  if (benSira !== null && benSira > 1) {
    if (benSira <= Math.ceil(n / 2)) jingleIyi(fanfarSonu)
    else notr(fanfarSonu)
    son = fanfarSonu + 0.9
  }
  if (rutbeAtlandi) {
    rutbeAtladi(son + 0.1)
    son += 1.4
  }
  return son
}

// ---------------------------------------------------------------------
// Kısa arayüz efektleri (80 ms throttle)
// ---------------------------------------------------------------------
export type EfektAdi = 'tik' | 'dogru' | 'yanlis' | 'pop' | 'kopya' | 'isilti'
const sonCalma = new Map<EfektAdi, number>()

export function efekt(ad: EfektAdi) {
  if (!hazir()) return
  const simdi = performance.now()
  if (simdi - (sonCalma.get(ad) ?? 0) < 80) return
  sonCalma.set(ad, simdi)
  const t = motor.simdi + 0.005
  switch (ad) {
    case 'tik':
      sinus(t, 1800, 0.03, 0.12, 'triangle')
      break
    case 'kopya':
      sinus(t, 2400, 0.025, 0.1)
      break
    case 'dogru':
      sinus(t, mtof(84), 0.14, 0.2, 'triangle')
      sinus(t + 0.09, mtof(91), 0.28, 0.2, 'triangle')
      sinus(t + 0.09, mtof(103), 0.2, 0.04)
      break
    case 'yanlis': {
      const o = sinus(t, 110, 0.22, 0.2, 'sawtooth')
      o.frequency.setValueAtTime(120, t)
      o.frequency.linearRampToValueAtTime(85, t + 0.22)
      break
    }
    case 'pop': {
      const o = sinus(t, 500, 0.09, 0.22)
      o.frequency.setValueAtTime(380, t)
      o.frequency.exponentialRampToValueAtTime(900, t + 0.06)
      break
    }
    case 'isilti':
      isilti(t, 7, 0.5)
      break
  }
}
