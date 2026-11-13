import type { CSSProperties } from 'react'

/**
 * İmza öğe: kenarlardan içeri giren devre kartı hatları; içlerinden kırmızı-turuncu ışık akar,
 * ışık uca varınca ped parlar. Hatlar yalnızca ekranın dış kenar şeridinde dolaşır (~58px içeri),
 * her zaman içeriğin ALTINDA durur (z-index 0, pointer-events: none) ve içe doğru maskeyle söner.
 * reduced-motion'da sadece statik iz kalır (tema.css).
 */
export type DevreKose = 'sol-ust' | 'sag-ust' | 'sol-alt' | 'sag-alt' | 'sol-kenar' | 'sag-kenar'

interface Iz { d: string; p: [number, number]; dolu: boolean; s: number; g: number }

// KENAR: sol kenar için çizildi (x=0 kenar), sağ kenar aynalanır. viewBox 62×210.
// Paralel şerit düzeni: kenara yakın giren hat daha derin şeritte koşar, hiçbiri kesişmez.
const KENAR: Iz[] = [
  { d: 'M0 12 H40 L54 26 V92', p: [54, 96], dolu: true, s: 2.6, g: 0 },
  { d: 'M0 34 H24 L36 46 V78', p: [36, 82], dolu: false, s: 3.4, g: 0.9 },
  { d: 'M0 56 H6 L16 66 V96', p: [16, 100], dolu: true, s: 2.4, g: 1.7 },
  { d: 'M0 198 H40 L54 184 V120', p: [54, 116], dolu: false, s: 3.9, g: 0.4 },
  { d: 'M0 176 H24 L36 164 V128', p: [36, 124], dolu: true, s: 3.1, g: 2.2 },
  { d: 'M0 154 H6 L16 144 V126', p: [16, 122], dolu: false, s: 2.8, g: 1.2 },
]
// KÖŞE: sol-üst köşe için çizildi; bir kol sol kenar, bir kol üst kenar boyunca koşar. viewBox 210×160.
const KOSE: Iz[] = [
  { d: 'M0 10 H40 L54 24 V150', p: [54, 154], dolu: true, s: 3.6, g: 0 },
  { d: 'M0 30 H24 L36 42 V126', p: [36, 130], dolu: false, s: 3.0, g: 1.1 },
  { d: 'M0 50 H6 L16 60 V104', p: [16, 108], dolu: true, s: 2.4, g: 0.5 },
  { d: 'M70 0 V40 L84 54 H186', p: [190, 54], dolu: false, s: 3.8, g: 1.8 },
  { d: 'M92 0 V24 L104 36 H164', p: [168, 36], dolu: true, s: 2.8, g: 0.8 },
  { d: 'M114 0 V8 L124 18 H200', p: [204, 18], dolu: false, s: 3.3, g: 2.3 },
]
const AYNA: Record<DevreKose, string> = {
  'sol-ust': 'none', 'sag-ust': 'scaleX(-1)', 'sol-alt': 'scaleY(-1)', 'sag-alt': 'scale(-1,-1)',
  'sol-kenar': 'none', 'sag-kenar': 'scaleX(-1)',
}

interface Props {
  kose: DevreKose
  /** Köşede genişlik, kenarda yükseklik (px). */
  boyut?: number
  /** Kenar parçasının üstten konumu (px) ya da dikeyde ortala. */
  ust?: number | 'orta'
  /** Bordo/gece zeminde açık renkli iz. */
  koyu?: boolean
  /** Işık hızı çarpanı (2× modda 2.5). */
  hiz?: number
  /** İçi boş pedlerin dolgusu = arka plan rengi. */
  zemin?: string
  soluk?: boolean
  className?: string
}

export default function DevreHatlari({ kose, boyut, ust = 'orta', koyu = false, hiz = 1, zemin, soluk = false, className = '' }: Props) {
  const kenar = kose.endsWith('kenar')
  const izler = kenar ? KENAR : KOSE
  const [vw, vh] = kenar ? [62, 210] : [210, 160]
  const [yan, dik] = kose.split('-') as ['sol' | 'sag', string]
  const b = boyut ?? (kenar ? 210 : 200)
  const w = kenar ? Math.round((vw * b) / vh) : b
  const h = kenar ? b : Math.round((vh * b) / vw)

  // İçe doğru solan maske: kenarda tam görünür, ekranın içine doğru şeffaflaşır
  const maske = kenar
    ? `linear-gradient(to ${yan === 'sol' ? 'right' : 'left'}, #000 35%, transparent 100%)`
    : `radial-gradient(ellipse 120% 120% at ${yan === 'sol' ? '0' : '100%'} ${dik === 'ust' ? '0' : '100%'}, #000 50%, transparent 100%)`

  const stil: CSSProperties & Record<string, string | number> = {
    width: w,
    height: h,
    [yan === 'sol' ? 'left' : 'right']: 0,
    ...(kenar
      ? { top: ust === 'orta' ? `calc(50% - ${h / 2}px)` : ust }
      : { [dik === 'ust' ? 'top' : 'bottom']: 0 }),
    '--devre-hiz': hiz,
    ...(zemin ? { '--devre-zemin': zemin } : {}),
    ...(soluk ? { opacity: 0.55 } : {}),
    WebkitMaskImage: maske,
    maskImage: maske,
  }
  const zaman = (o: Iz) => ({ '--s': `${o.s}s`, '--g': `${o.g}s` }) as CSSProperties

  return (
    <div className={`devre${koyu ? ' koyu' : ''} ${className}`} style={stil} aria-hidden="true">
      <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" style={{ transform: AYNA[kose] }}>
        {izler.map((o, i) => <path key={`iz${i}`} className="iz" d={o.d} />)}
        <g className="isiklar">
          {izler.map((o, i) => <path key={`is${i}`} className="isik" pathLength={100} d={o.d} style={zaman(o)} />)}
        </g>
        {izler.map((o, i) => (
          <circle key={`p${i}`} className={`ped ${o.dolu ? 'dolu' : 'bos'}`} cx={o.p[0]} cy={o.p[1]} r={4.5} style={zaman(o)} />
        ))}
      </svg>
    </div>
  )
}
