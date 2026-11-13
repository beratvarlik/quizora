import { useId } from 'react'

interface Props {
  kalanMs: number
  toplamMs?: number
  /** 2× hız modu: halka turuncu-kırmızı gradyana döner, üzerinde kıvılcım dolaşır. */
  hizli?: boolean
  boyut?: number
}

const R = 27
const CEVRE = 2 * Math.PI * R

/** Kalan süre halkası (kalan / toplam). Son 10 sn'de kırmızı ve nabızlı. */
export default function SureHalkasi({ kalanMs, toplamMs = 120000, hizli = false, boyut = 62 }: Props) {
  const id = 'sh' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const oran = Math.min(1, Math.max(0, kalanMs / toplamMs))
  const sn = Math.ceil(Math.max(0, kalanMs) / 1000)
  const son10 = kalanMs > 0 && kalanMs <= 10000
  return (
    <div className={`sure-halka${hizli ? ' hizli' : ''}${son10 ? ' son10' : ''}`} style={{ width: boyut, height: boyut }} role="timer" aria-label={`${sn} saniye kaldı`}>
      <svg viewBox="0 0 62 62" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFB15C" />
            <stop offset=".5" stopColor="#F15A24" />
            <stop offset="1" stopColor="#E0262B" />
          </linearGradient>
        </defs>
        <circle className="sh-iz" cx="31" cy="31" r={R} />
        <circle className="sh-ark" cx="31" cy="31" r={R} strokeDasharray={CEVRE} strokeDashoffset={CEVRE * (1 - oran)}
          style={hizli ? { stroke: `url(#${id})` } : undefined} />
      </svg>
      {hizli && <span className="sh-yorunge" aria-hidden="true"><i /></span>}
      <b>{sn}</b>
    </div>
  )
}
