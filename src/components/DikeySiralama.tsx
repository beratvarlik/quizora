import { rankPlayers } from '../lib/scoring'
import type { PlayerState } from '../types'
import Avatar from './Avatar'

const SATIR = 64

/**
 * Web (≥1024px) oyun ekranının sağındaki dikey canlı sıralama. Satırlar puana göre dizilir;
 * sollamada satır yeni yerine kayar (top geçişi). Mobilde gizlidir (orada CanliSerit var).
 */
export default function DikeySiralama({ oyuncular, benId, toplamSoru = 10 }: { oyuncular: PlayerState[]; benId: string; toplamSoru?: number }) {
  const sirali = rankPlayers(oyuncular)
  const sira = new Map(sirali.map((p, i) => [p.userId, i]))
  return (
    <aside className="dikey-siralama" aria-label="Canlı sıralama">
      <div className="ds-ust">
        <span className="canli" />
        <span className="etiket">Canlı sıralama</span>
      </div>
      <ol className="ds-liste" style={{ height: oyuncular.length * SATIR }}>
        {oyuncular.map(p => {
          const i = sira.get(p.userId) ?? 0
          const ben = p.userId === benId
          const r = sirali[i]?.rank ?? i + 1
          return (
            <li key={p.userId} className={`ds-satir${ben ? ' ben' : ''}${r === 1 ? ' lider' : ''}`} style={{ top: i * SATIR }}>
              <span className="ds-no">{r}</span>
              <Avatar avatarKey={p.avatarKey} photoUrl={p.photoUrl} ad={p.displayName} boyut={36} ben={ben} />
              <span className="ds-orta">
                <span className="ds-ad">{ben ? 'Sen' : p.displayName}</span>
                <span className="ds-cubuk" aria-hidden="true">
                  <i style={{ width: `${(Math.min(p.currentQ, toplamSoru) / toplamSoru) * 100}%` }} className={p.finished ? 'bitti' : ''} />
                </span>
              </span>
              <span className="ds-puan">{p.score}</span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
