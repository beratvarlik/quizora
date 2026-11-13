import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import DevreHatlari from './DevreHatlari'

/** B3'te dolacak sayfaların geçici iskeleti: rota çalışıyor mu görmek için. */
export default function YapimAsamasi({ baslik, children }: { baslik: string; children?: ReactNode }) {
  const { code } = useParams()
  return (
    <main className="sayfa">
      <DevreHatlari kose="sag-kenar" ust={120} boyut={200} />
      <DevreHatlari kose="sol-alt" boyut={200} />
      <div className="px-5 pt-14">
        <span className="etiket">{code ? `${baslik} · ${code}` : baslik}</span>
        <h1 className="baslik mt-3">
          {baslik}
          <em>.</em>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--soluk)]">Bu ekran B3 adımında yapılacak.</p>
        {children}
      </div>
    </main>
  )
}
