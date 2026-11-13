import { useEffect, useRef } from 'react'
import { BONUS_ID, kalanYaz, type DailyTask, type DailyTasks } from '../hooks/gorevler'
import { Konfeti } from './CalismaPaneli'
import {
  IkBayrak,
  IkCarpi,
  IkDefterCizgi,
  IkHedef,
  IkHesap,
  IkKisiler,
  IkKupa,
  IkOnay,
  IkSimsekCizgi,
  IkTakvim,
  IkTik,
} from './Ikon'

const IKON: Record<string, () => React.ReactNode> = {
  math10: () => <IkHesap />,
  win1: () => <IkKupa />,
  correct5: () => <IkOnay />,
  friends2: () => <IkKisiler />,
  notebook3: () => <IkDefterCizgi />,
  acc70: () => <IkHedef />,
  quick1: () => <IkSimsekCizgi />,
  games3: () => <IkBayrak />,
}

/** Devam eden görevin kısayolu (Menü yönlendirir). */
export const KISAYOL: Record<string, string> = {
  math10: 'Oyna',
  win1: 'Oyna',
  correct5: 'Oyna',
  acc70: 'Oyna',
  games3: 'Oyna',
  friends2: 'Lobi kur',
  quick1: 'Hemen Katıl',
  notebook3: "Yanlışlarım'a git",
}

function tarihYaz(gun: string): string {
  try {
    return new Date(`${gun}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' })
  } catch {
    return gun
  }
}

/** Menünün üstündeki kompakt kart: "2/3 tamamlandı", canlı geri sayım, 3 ince çubuk. */
export function GorevKarti({ veri, tamam, kalanMs, bekleyen, onAc }: { veri: DailyTasks | null; tamam: number; kalanMs: number; bekleyen: boolean; onAc: () => void }) {
  return (
    <button type="button" className={`gorev-kart${bekleyen ? ' bekliyor' : ''}`} onClick={onAc} aria-haspopup="dialog" aria-label={`Günlük görevler: ${tamam}/3 tamamlandı${bekleyen ? ', ödülün seni bekliyor' : ''}`}>
      <span className="gk-ikon">
        <IkTakvim />
      </span>
      <span className="gk-orta">
        <span className="gk-ust">
          <b>Günlük görevler</b>
          {bekleyen && <span className="gk-rozet">Ödülünü al!</span>}
        </span>
        <span className="gk-alt">
          <span>{veri ? `${tamam}/3 tamamlandı` : '…'}</span>
          <span className="gk-sure">Yenilenmesine {kalanYaz(kalanMs)}</span>
        </span>
        <span className="gk-cubuklar" aria-hidden="true">
          {(veri?.tasks ?? [null, null, null]).map((t, i) => (
            <i key={t?.id ?? i} className={t?.completed ? 'tamam' : ''}>
              <b style={{ width: t ? `${(t.progress / t.target) * 100}%` : 0 }} />
            </i>
          ))}
        </span>
      </span>
    </button>
  )
}

interface PanelProps {
  veri: DailyTasks | null
  hata: boolean
  kalanMs: number
  aliniyor: string | null
  kutlama: boolean
  onKapat: () => void
  onAl: (id: string, kaynak: HTMLElement) => void
  onKisayol: (id: string) => void
  onYenile: () => void
}

function GorevSatiri({ t, aliniyor, onAl, onKisayol }: { t: DailyTask; aliniyor: string | null; onAl: PanelProps['onAl']; onKisayol: PanelProps['onKisayol'] }) {
  const durum = t.claimed ? 'alindi' : t.completed ? 'hazir' : 'devam'
  return (
    <li className={`gp-satir ${durum}`}>
      <span className="gp-ikon">{t.claimed ? <IkTik boyut={18} /> : IKON[t.id]?.()}</span>
      <div className="gp-orta">
        <b>{t.title}</b>
        <div className="gp-ilerleme">
          <span className="gp-cubuk" role="progressbar" aria-valuemin={0} aria-valuemax={t.target} aria-valuenow={t.progress} aria-label={t.title}>
            <i style={{ width: `${(t.progress / t.target) * 100}%` }} />
          </span>
          <small>
            {t.progress}/{t.target}
          </small>
        </div>
        {durum === 'devam' && KISAYOL[t.id] && (
          <button type="button" className="gp-kisayol" onClick={() => onKisayol(t.id)}>
            {KISAYOL[t.id]} <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
      <div className="gp-sag">
        {durum === 'devam' && <span className="gp-xp">+{t.xp} XP</span>}
        {durum === 'hazir' && (
          <button type="button" className="gp-al" disabled={aliniyor !== null} onClick={e => onAl(t.id, e.currentTarget)}>
            {aliniyor === t.id ? 'Alınıyor…' : `Al +${t.xp} XP`}
          </button>
        )}
        {durum === 'alindi' && <span className="gp-alindi">Alındı</span>}
      </div>
    </li>
  )
}

/** Görev paneli: mobilde alttan açılan sayfa, web'de sağdan yan panel. */
export function GorevPaneli({ veri, hata, kalanMs, aliniyor, kutlama, onKapat, onAl, onKisayol, onYenile }: PanelProps) {
  const kapatBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    kapatBtn.current?.focus()
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && onKapat()
    window.addEventListener('keydown', tus)
    return () => window.removeEventListener('keydown', tus)
  }, [onKapat])

  const b = veri?.bonus
  const bonusDurum = !b ? 'kilitli' : b.claimed ? 'alindi' : b.completed ? 'hazir' : 'kilitli'

  return (
    <div className="gp-kap" role="presentation">
      <div className="gp-perde" onClick={onKapat} aria-hidden="true" />
      <section className="gp-panel" role="dialog" aria-modal="true" aria-labelledby="gp-baslik">
        {kutlama && <Konfeti />}
        <span className="gp-tutamak" aria-hidden="true" />
        <header className="gp-ust">
          <div className="min-w-0">
            <h2 id="gp-baslik">Günlük görevler</h2>
            <p>
              {veri ? tarihYaz(veri.date) : ''} · Yenilenmesine <b>{kalanYaz(kalanMs)}</b>
            </p>
          </div>
          <button type="button" className="cz-kapat" ref={kapatBtn} aria-label="Paneli kapat" onClick={onKapat}>
            <IkCarpi boyut={20} />
          </button>
        </header>

        {hata ? (
          <div className="hata-kutu" role="alert">
            Görevler yüklenemedi.{' '}
            <button type="button" className="underline" onClick={onYenile}>
              Tekrar dene
            </button>
          </div>
        ) : !veri ? (
          <div className="gp-iskelet" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <>
            {kutlama && (
              <p className="gp-kutlama" role="status">
                Günün tüm görevleri tamam!
              </p>
            )}
            <ul className="gp-liste">
              {veri.tasks.map(t => (
                <GorevSatiri key={t.id} t={t} aliniyor={aliniyor} onAl={onAl} onKisayol={onKisayol} />
              ))}
            </ul>
            <div className={`gp-bonus ${bonusDurum}`}>
              <span className="gp-ikon">{bonusDurum === 'alindi' ? <IkTik boyut={18} /> : <IkKupa />}</span>
              <div className="gp-orta">
                <b>Hepsini tamamla: +{b?.xp ?? 50} XP</b>
                <small>{bonusDurum === 'kilitli' ? '3 görevin ödülünü alınca açılır' : bonusDurum === 'hazir' ? 'Bonus hazır!' : 'Bonus alındı'}</small>
              </div>
              <div className="gp-sag">
                {bonusDurum === 'hazir' ? (
                  <button type="button" className="gp-al" disabled={aliniyor !== null} onClick={e => onAl(BONUS_ID, e.currentTarget)}>
                    {aliniyor === BONUS_ID ? 'Alınıyor…' : `Al +${b?.xp ?? 50} XP`}
                  </button>
                ) : bonusDurum === 'alindi' ? (
                  <span className="gp-alindi">Alındı</span>
                ) : (
                  <span className="gp-xp">+{b?.xp ?? 50} XP</span>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/** Sonuç / çalışma modu bandı: "Görev ilerledi: 5 doğru cevap ver (5/5) ✓ Ödülünü al →" */
export function GorevBandi({ gorev, onAl }: { gorev: DailyTask; onAl: () => void }) {
  return (
    <div className={`gorev-bandi${gorev.completed ? ' tamam' : ''}`} role="status">
      <span className="gb-ikon">{IKON[gorev.id]?.()}</span>
      <span className="gb-metin">
        Görev ilerledi: <b>{gorev.title}</b> ({gorev.progress}/{gorev.target}){gorev.completed ? ' ✓' : ''}
      </span>
      {gorev.completed && !gorev.claimed && (
        <button type="button" className="gb-al" onClick={onAl}>
          Ödülünü al <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  )
}
