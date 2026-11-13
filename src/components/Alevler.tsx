import { useEffect, useId, useMemo, useRef } from 'react'

/**
 * 2× modunun alt kenar alevleri (taslak.html'den): 3 katman alev dili (arka kırmızı, orta turuncu,
 * ön sarı), parıltı, taban ve kıvılcımlar. Sayfanın altına sabitlenir; içeriğin ALTINDA ama sayfa
 * zemininin ÜSTÜNDE durur (z-index 0, pointer-events: none).
 * - Hareketi azalt açıksa alevler gizlenmez, animasyonsuz sabit durur.
 * - feTurbulence filtresi yoksa ya da cihaz takılıyorsa (≈45 fps altı) filtresiz devam eder.
 *   ?filtre=0 → hep kapalı, ?filtre=1 → hep açık.
 */

// Sabit tohumlu rastgele (mulberry32): her yüklemede aynı alev şekilleri
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const azHareket = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const filtreDestekli = () => typeof window !== 'undefined' && 'SVGFETurbulenceElement' in window && 'SVGFEDisplacementMapElement' in window

function alevHTML(id: string, filtreli: boolean, hareketli: boolean): string {
  const H = 101, W = 390
  const r = rng(20261113)
  const ar = (a: number, b: number) => a + r() * (b - a)
  const f = (v: number) => v.toFixed(1)
  const KAT = [
    { ad: 'arka', n: 11, h: [0.55, 0.87], w: [52, 86], t: 1.6, renk: ['#C8102E', '#E0262B'], o: [1, 0.85] },
    { ad: 'orta', n: 12, h: [0.36, 0.62], w: [38, 66], t: 1.1, renk: ['#F15A24', '#FF7A3D'], o: [0.95, 0.7] },
    { ad: 'on', n: 10, h: [0.16, 0.32], w: [24, 44], t: 0.7, renk: ['#FFB15C', '#FFD9A0'], o: [0.9, 0.55] },
  ] as const
  // Kıvrımlı alev dili: sol kenar S eğrisiyle yükselir, uç yana kıvrılır, sağ kenar yumuşakça iner
  const dil = (cx: number, w: number, h: number, L: number) => {
    const B = H + 6, x0 = cx - w / 2, x1 = cx + w / 2, tx = cx + L, ty = B - h
    return (
      `M${f(x0)} ${B} C${f(x0)} ${f(B - h * 0.38)} ${f(cx - w * 0.3 + L * 0.35)} ${f(B - h * 0.58)} ${f(cx + L * 0.65)} ${f(B - h * 0.86)}` +
      ` Q${f(tx - L * 0.05)} ${f(ty + h * 0.04)} ${f(tx)} ${f(ty)}` +
      ` C${f(cx + L * 0.45 + w * 0.1)} ${f(B - h * 0.76)} ${f(cx + w * 0.42 + L * 0.15)} ${f(B - h * 0.5)} ${f(x1)} ${f(B - h * 0.18)} L${f(x1)} ${B} Z`
    )
  }
  const filtre = filtreli
    ? `<filter id="${id}boz" x="-15%" y="-25%" width="130%" height="135%" color-interpolation-filters="sRGB">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.016 0.055" numOctaves="2" seed="7" result="gurultu">` +
      (hareketli ? `<animate attributeName="baseFrequency" dur="5s" values="0.016 0.055;0.021 0.08;0.016 0.055" repeatCount="indefinite"/>` : '') +
      `</feTurbulence><feDisplacementMap in="SourceGraphic" in2="gurultu" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>`
    : ''
  const katlar = KAT.map((k, ki) => {
    let p = ''
    for (let i = 0; i < k.n; i++) {
      const cx = -12 + i * ((W + 24) / (k.n - 1)) + ar(-14, 14)
      const w = ar(k.w[0], k.w[1]), h = ar(k.h[0], k.h[1]) * H, L = ar(-0.5, 0.5) * w
      const yon = r() < 0.5 ? -1 : 1
      const st =
        `--t:${(k.t * ar(0.8, 1.25)).toFixed(2)}s;--g:-${ar(0, k.t * 2).toFixed(2)}s;--y0:${ar(0.85, 0.95).toFixed(3)};--y1:${ar(1.05, 1.15).toFixed(3)};` +
        `--k0:${(ar(1, 4) * yon).toFixed(1)}deg;--k1:${(ar(1, 4) * -yon).toFixed(1)}deg`
      p += `<path class="dil" d="${dil(cx, w, h, L)}" style="${st}"/>`
    }
    return (
      `<svg class="alev-kat alev-${k.ad}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs>` +
      `<linearGradient id="${id}g${ki}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${k.renk[0]}" stop-opacity="${k.o[0]}"/>` +
      `<stop offset=".45" stop-color="${k.renk[1]}" stop-opacity="${k.o[1]}"/><stop offset="1" stop-color="${k.renk[1]}" stop-opacity="0"/></linearGradient>` +
      `${ki === 0 ? filtre : ''}</defs><g class="alev-boz"${filtreli ? ` filter="url(#${id}boz)"` : ''} fill="url(#${id}g${ki})">${p}</g></svg>`
    )
  }).join('')
  let kv = ''
  for (let i = 0; i < 9; i++) {
    const c = ['#FFB15C', '#FFD9A0', '#F15A24'][i % 3]
    kv +=
      `<span class="kivilcim" style="left:${((ar(16, 374) / W) * 100).toFixed(1)}%;bottom:${ar(22, 56).toFixed(0)}px;--t:${ar(1.8, 3.2).toFixed(2)}s;` +
      `--g:-${ar(0, 3).toFixed(2)}s;--h:-${ar(110, 200).toFixed(0)}px;--s:${ar(0.5, 0.9).toFixed(2)}s;--x:${ar(4, 10).toFixed(1)}px;--r:${ar(2, 4).toFixed(1)}px;--c:${c}"><i></i></span>`
  }
  return `<div class="alevler"><div class="alev-parilti"></div><div class="alev-taban"></div>${katlar}</div><div class="kivilcimlar">${kv}</div>`
}

export default function Alevler({ son10 = false }: { son10?: boolean }) {
  const kok = useRef<HTMLDivElement>(null)
  const id = 'alev' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const html = useMemo(() => {
    let filtreli = filtreDestekli()
    try {
      const q = new URLSearchParams(window.location.search).get('filtre')
      if (q === '0') filtreli = false
    } catch {
      /* yok say */
    }
    return alevHTML(id, filtreli, !azHareket())
  }, [id])

  // Cihaz takılıyorsa (≈45 fps altı) filtreyi kaldır; yalnızca transform animasyonu kalır.
  useEffect(() => {
    let iptal = false
    let zaman = 0
    const kapat = () => kok.current?.querySelectorAll('.alev-boz').forEach(g => g.removeAttribute('filter'))
    let q: string | null = null
    try {
      q = new URLSearchParams(window.location.search).get('filtre')
    } catch {
      /* yok say */
    }
    if (q === '1' || azHareket()) return
    const basla = () => {
      if (iptal) return
      if (document.hidden) {
        zaman = window.setTimeout(basla, 2000)
        return
      }
      let n = 0, t0 = 0
      const olc = (now: number) => {
        if (iptal) return
        if (!t0) t0 = now
        n++
        if (now - t0 < 2000) requestAnimationFrame(olc)
        else if (document.hidden) zaman = window.setTimeout(basla, 2000)
        else if (n / ((now - t0) / 1000) < 45) kapat()
      }
      requestAnimationFrame(olc)
    }
    zaman = window.setTimeout(basla, 1500)
    return () => {
      iptal = true
      window.clearTimeout(zaman)
    }
  }, [])

  return <div ref={kok} className={`alev-kok${son10 ? ' son10' : ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
}
