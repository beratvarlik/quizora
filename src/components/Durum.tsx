import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBaglanti } from '../hooks/useBaglanti'
import { isMock } from '../lib/client'
import Button from './Button'
import DevreHatlari from './DevreHatlari'
import { UstBar } from './Logo'

/** Yükleniyor ekranı. */
export function Yukleniyor({ sag }: { sag?: ReactNode }) {
  return (
    <main className="sayfa">
      <UstBar sag={sag} />
      <div className="yukleniyor" role="status" aria-label="Yükleniyor">
        <span />
      </div>
    </main>
  )
}

/** Tam sayfa hata ekranı: Türkçe mesaj + ana menüye dön. */
export function HataEkrani({ mesaj, onTekrar }: { mesaj: string; onTekrar?: () => void }) {
  const git = useNavigate()
  return (
    <main className="sayfa">
      <DevreHatlari kose="sag-kenar" ust={120} boyut={200} />
      <UstBar />
      <div className="icerik px-5 pt-6">
        <h1 className="baslik">
          Olmadı<em>.</em>
        </h1>
        <p className="alt-metin">{mesaj}</p>
        <div className="mt-8 flex flex-col gap-3">
          {onTekrar && <Button onClick={onTekrar}>Tekrar dene</Button>}
          <Button tur="uc" onClick={() => git('/menu')}>
            Ana menüye dön
          </Button>
        </div>
      </div>
    </main>
  )
}

/** Bağlantı koptuğunda üstte görünen bant + sahte API rozeti. */
export function BaglantiBandi() {
  const cevrimici = useBaglanti()
  return (
    <>
      {!cevrimici && (
        <div className="baglanti-bandi" role="alert">
          Bağlantı koptu. Yeniden bağlanılıyor…
        </div>
      )}
      {isMock && <span className="mock-not">DEMO</span>}
    </>
  )
}
