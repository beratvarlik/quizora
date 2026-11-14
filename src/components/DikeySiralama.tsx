import { rankPlayers } from '../lib/scoring'
import type { PlayerState } from '../types'
import Avatar from './Avatar'

/** Her satır aynı yükseklikte (lider dahil; büyütme yok) → sabit slot: satır + boşluk. */
const SATIR_YUKSEKLIK = 56
const BOSLUK = 12
const SLOT = SATIR_YUKSEKLIK + BOSLUK

/**
 * Web (≥1024px) oyun ekranının sağındaki dikey canlı sıralama. Satırlar puana göre dizilir;
 * sollamada satır yeni slotuna transform ile kayar. Mobilde gizlidir (orada CanliSerit var).
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
      <ol className="ds-liste" style={{ height: Math.max(0, oyuncular.length * SLOT - BOSLUK) }}>
        {oyuncular.map(p => {
          const i = sira.get(p.userId) ?? 0
          const ben = p.userId === benId
          const r = sirali[i]?.rank ?? i + 1
          const lider = r === 1
          return (
            <li
              key={p.userId}
              className={`ds-satir${ben ? ' ben' : ''}${lider ? ' ds-lider' : ''}`}
              style={{ height: SATIR_YUKSEKLIK, transform: `translateY(${i * SLOT}px)` }}
            >
              <span className="ds-no">{r}</span>
              <Avatar avatarKey={p.avatarKey} photoUrl={p.photoUrl} ad={p.displayName} boyut={lider ? 40 : 36} ben={ben} />
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
