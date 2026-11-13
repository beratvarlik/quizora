import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CalismaPaneli, { DefterTemiz } from '../components/CalismaPaneli'
import DevreHatlari from '../components/DevreHatlari'
import { HataEkrani, Yukleniyor } from '../components/Durum'
import { getMistakes, tekrarSec, type MistakeItem } from '../hooks/defter'
import { useSes } from '../hooks/useSes'
import { useWeb } from '../hooks/useWeb'

/**
 * /yanlislarim/coz: çalışma modu (mobilde tam sayfa). Sorular state'ten gelir; yoksa defterden 10 tane seçilir
 * (state.ders verilirse yalnızca o dersten; state.konu da varsa o konudan, konuda soru yoksa dersten).
 */
export default function Coz() {
  const git = useNavigate()
  const web = useWeb()
  const durum = useLocation().state as { sorular?: MistakeItem[]; ders?: string; konu?: string } | null
  const gelen = durum?.sorular
  const dersFiltre = durum?.ders
  const konuFiltre = durum?.konu
  const [sorular, setSorular] = useState<MistakeItem[] | null>(gelen?.length ? gelen : null)
  const [tur, setTur] = useState(0)
  const [hata, setHata] = useState(false)
  const { muzikModu } = useSes()
  useEffect(() => muzikModu('sakin'), [muzikModu])

  useEffect(() => {
    if (sorular) return
    getMistakes(dersFiltre ? { subject: dersFiltre } : undefined).then(
      l => {
        // getMistakes konu filtresi almıyor: konu süzgeci istemcide
        const konuda = konuFiltre ? l.filter(m => m.topic === konuFiltre) : l
        setSorular(tekrarSec(konuda.length ? konuda : l))
      },
      () => setHata(true),
    )
  }, [sorular, dersFiltre, konuFiltre])

  if (hata) return <HataEkrani mesaj="Yüklenemedi, tekrar dene." onTekrar={() => setHata(false)} />
  if (!sorular) return <Yukleniyor />

  return (
    <main className="sayfa cz-sayfa">
      <DevreHatlari kose="sag-kenar" ust={300} boyut={200} soluk />
      <div className="icerik">
        {sorular.length === 0 ? (
          <DefterTemiz onDon={() => git('/menu')} />
        ) : (
          <CalismaPaneli
            key={tur}
            sorular={sorular}
            panel={web}
            onKapat={() => git('/yanlislarim')}
            onDeftereDon={() => git('/yanlislarim')}
            onYeniden={k => {
              setSorular(k)
              setTur(t => t + 1)
            }}
          />
        )}
      </div>
    </main>
  )
}
