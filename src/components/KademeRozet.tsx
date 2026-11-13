import { useId } from 'react'

/** Rütbe ailesine göre renkler (rankKey: caylak, bronz_1…3, gumus_1…3, altin_1…3, elmas_1…3, efsane). */
const RENK: Record<string, [string, string, string]> = {
  caylak: ['#F3E9E2', '#B9A59C', '#4A3A35'],
  bronz: ['#EDB287', '#9A5A2E', '#4E250C'],
  gumus: ['#F6F6FA', '#9EA0AE', '#43454F'],
  altin: ['#FFE58F', '#D49516', '#5E3B00'],
  elmas: ['#D2E9FF', '#3F84DA', '#0F2E5A'],
  efsane: ['#FFD27A', '#E0262B', '#3E0707'],
}
const SERIT = [
  'M17 26.5L24 21.5L31 26.5',
  'M17 23L24 18L31 23M17 29L24 24L31 29',
  'M17 19.5L24 14.5L31 19.5M17 25.5L24 20.5L31 25.5M17 31.5L24 26.5L31 31.5',
]
const YILDIZ = 'M24 14.5L26.6 20.8L33 21.3L28 25.5L29.6 31.8L24 28.4L18.4 31.8L20 25.5L15 21.3L21.4 20.8Z'
const ELMAS = 'M16.5 21L20.5 15.5H27.5L31.5 21L24 32.5ZM16.5 21H31.5M21.5 21L24 32.5L26.5 21'
const TAC = 'M15 30L14 18L19.5 23L24 15L28.5 23L34 18L33 30ZM15 33.5H33'
const HEX = 'M24 3L42 13.5V34.5L24 45L6 34.5V13.5Z'
const IC = 'M24 8.5L37.5 16.3V31.7L24 39.5L10.5 31.7V16.3Z'

/** Altıgen kalkan rütbe rozeti: aile rengi + alt kademe şeridi (I/II/III). */
export default function KademeRozet({ rankKey, boyut = 20, label }: { rankKey: string; boyut?: number; label?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [aile, alt] = rankKey.split('_')
  const [a, b, c] = RENK[aile] ?? RENK.caylak
  const n = Math.min(3, Math.max(1, Number(alt) || 1))
  const amblem = aile === 'caylak' ? YILDIZ : aile === 'elmas' ? ELMAS : aile === 'efsane' ? TAC : SERIT[n - 1]
  const isik = aile === 'efsane' || aile === 'elmas'
  return (
    <svg className="kademe-rozet" viewBox="0 0 48 48" width={boyut} height={boyut} role="img" aria-label={label ?? rankKey}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={HEX} />
        </clipPath>
      </defs>
      <path d={HEX} fill={`url(#${id}g)`} stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      <path d={IC} fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={amblem} fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {isik && (
        <g clipPath={`url(#${id}c)`}>
          <rect className="rozet-isik" x="-8" y="-12" width="10" height="72" fill="rgba(255,255,255,.7)" />
        </g>
      )}
    </svg>
  )
}
