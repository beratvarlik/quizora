import type { PerformanceStats } from '../hooks/performans'

const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const gunAdi = (iso: string, son: boolean) => (son ? 'Bugün' : GUNLER[new Date(`${iso}T12:00:00`).getDay()])

/**
 * Son 7 gün sütun grafiği (kütüphanesiz SVG): alt kısım doğru (yeşil), üst kısım yanlış + boş (soluk).
 * Her sütunun üstünde "doğru/toplam" yazılı; renk tek başına anlam taşımaz.
 */
export function HaftalikGrafik({ daily }: { daily: PerformanceStats['daily'] }) {
  const G = 320
  const Y = 168
  const ust = 22
  const alt = 26
  const alan = Y - ust - alt
  const sutunGen = 26
  const adim = (G - 16) / daily.length
  const enCok = Math.max(1, ...daily.map(d => d.answered))
  const ozet = daily
    .map((d, i) => `${gunAdi(d.date, i === daily.length - 1)}: ${d.answered ? `${d.answered} sorudan ${d.correct} doğru` : 'yarış yok'}`)
    .join(', ')

  return (
    <figure className="hg">
      <svg viewBox={`0 0 ${G} ${Y}`} role="img" aria-label={`Son 7 gün. ${ozet}`}>
        <line x1="8" x2={G - 8} y1={Y - alt + 0.5} y2={Y - alt + 0.5} className="hg-taban" />
        {daily.map((d, i) => {
          const x = 8 + i * adim + (adim - sutunGen) / 2
          const h = (d.answered / enCok) * alan
          const hd = (d.correct / enCok) * alan
          const taban = Y - alt
          const son = i === daily.length - 1
          return (
            <g key={d.date}>
              <g className="hg-sutun" style={{ '--i': i } as React.CSSProperties}>
                {d.answered > 0 ? (
                  <>
                    {h - hd > 0 && <rect className="hg-diger" x={x} y={taban - h} width={sutunGen} height={h - hd} rx="5" />}
                    {hd > 0 && <rect className="hg-dogru" x={x} y={taban - hd} width={sutunGen} height={hd} rx="5" />}
                    <text className="hg-deger" x={x + sutunGen / 2} y={taban - h - 6} textAnchor="middle">
                      {d.correct}/{d.answered}
                    </text>
                  </>
                ) : (
                  <text className="hg-deger bos" x={x + sutunGen / 2} y={taban - 6} textAnchor="middle">
                    —
                  </text>
                )}
              </g>
              <text className={`hg-gun${son ? ' bugun' : ''}`} x={x + sutunGen / 2} y={Y - 8} textAnchor="middle">
                {gunAdi(d.date, son)}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="hg-lejant">
        <span>
          <i className="dogru" /> Doğru
        </span>
        <span>
          <i className="diger" /> Yanlış + boş
        </span>
        <span className="hg-not">Sütun üstü: doğru / toplam</span>
      </figcaption>
    </figure>
  )
}

const R = 26
const CEVRE = 2 * Math.PI * R

/** Doğruluk halkası; yüzde ortada yazılı. */
export function DogrulukHalkasi({ yuzde, boyut = 64 }: { yuzde: number; boyut?: number }) {
  const oran = Math.min(1, Math.max(0, yuzde / 100))
  return (
    <span className="dh" style={{ width: boyut, height: boyut }}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="dh-iz" cx="32" cy="32" r={R} />
        <circle
          className="dh-ark"
          cx="32"
          cy="32"
          r={R}
          strokeDasharray={CEVRE}
          strokeDashoffset={CEVRE * (1 - oran)}
          style={{ '--c': `${CEVRE}` } as React.CSSProperties}
        />
      </svg>
      <b>%{yuzde}</b>
    </span>
  )
}
