import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { dersAdi, macAnalizi, sn } from '../hooks/analiz'
import type { ReviewItem } from '../types'
import Button from './Button'
import { IkParilti } from './Ikon'

/**
 * Sonuç ekranı "Maç analizi": ders çubukları (doğru/toplam, %), 3 küçük istatistik ve kurallarla
 * üretilen "Akıllı öneri". Veri getGameReview'den; hesaplama analiz.ts'te.
 */
export default function MacAnalizi({ liste, onSoruAc }: { liste: ReviewItem[] | null; onSoruAc: (position: number) => void }) {
  const git = useNavigate()
  const a = useMemo(() => (liste?.length ? macAnalizi(liste) : null), [liste])

  if (!liste) {
    return (
      <section className="mac-analiz" aria-label="Maç analizi" aria-busy="true">
        <span className="etiket">Maç analizi</span>
        <div className="ma-iskelet" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    )
  }
  if (!a) return null

  return (
    <section className="mac-analiz" aria-label="Maç analizi">
      <span className="etiket">Maç analizi</span>

      <ul className="ma-dersler">
        {a.dersler.map((d, i) => (
          <li key={d.ders} style={{ '--i': i } as React.CSSProperties}>
            <div className="ma-ders-ust">
              <span className="ma-ad">{d.ad}</span>
              {d.ders === a.enGuclu && <span className="ma-etiket guclu">En güçlü</span>}
              {d.ders === a.enZayif && <span className="ma-etiket zayif">Çalışmalısın</span>}
              <span className="ma-oran">
                {d.dogru}/{d.toplam} · %{d.yuzde}
              </span>
            </div>
            <div className="ma-cubuk" role="img" aria-label={`${d.ad}: ${d.toplam} soruda ${d.dogru} doğru, yüzde ${d.yuzde}`}>
              <i style={{ width: `${d.yuzde}%` }} />
            </div>
          </li>
        ))}
      </ul>

      <div className="ma-istat">
        <div className="ma-kutu">
          <span>Ortalama süre</span>
          <b>{a.ortSureMs !== null ? sn(a.ortSureMs) : '—'}</b>
        </div>
        <div className="ma-kutu">
          <span>En hızlı doğru</span>
          <b>{a.enHizliDogru ? sn(a.enHizliDogru.ms) : '—'}</b>
          {a.enHizliDogru && <small>{dersAdi(a.enHizliDogru.ders)}</small>}
        </div>
        {a.enUzun ? (
          <button type="button" className="ma-kutu ma-tik" onClick={() => onSoruAc(a.enUzun!.position)} aria-label={`En uzun düşündüğün soru: ${a.enUzun.position + 1}. soru, ${sn(a.enUzun.ms)}. İncele`}>
            <span>En uzun düşündüğün</span>
            <b>{sn(a.enUzun.ms)}</b>
            <small>
              {dersAdi(a.enUzun.ders)} · Soru {a.enUzun.position + 1} <em aria-hidden="true">›</em>
            </small>
          </button>
        ) : (
          <div className="ma-kutu">
            <span>En uzun düşündüğün</span>
            <b>—</b>
          </div>
        )}
      </div>

      <div className="ma-oneri">
        <span className="ma-oneri-ikon">
          <IkParilti />
        </span>
        <div className="min-w-0 flex-1">
          <b>Akıllı öneri</b>
          {a.oneriler.map((o, i) => (
            <p key={i}>{o.metin}</p>
          ))}
          {a.oneriler
            .filter(o => o.eylem)
            .slice(0, 1)
            .map(o => (
              <Button key="eylem" tur="iki" className="ma-eylem" onClick={() => git('/yanlislarim/coz', { state: { ders: o.eylem!.ders, konu: o.eylem!.konu } })}>
                {o.eylem!.etiket} →
              </Button>
            ))}
        </div>
      </div>

      <Link to="/performans" className="ma-tum">
        Tüm analizim <span aria-hidden="true">→</span>
      </Link>
    </section>
  )
}
