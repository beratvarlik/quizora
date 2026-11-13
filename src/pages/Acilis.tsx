import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar, { AVATAR_KEYS } from '../components/Avatar'
import AvatarSecici from '../components/AvatarSecici'
import Button from '../components/Button'
import Card from '../components/Card'
import Cip from '../components/Cip'
import DevreHatlari from '../components/DevreHatlari'
import HizDemo from '../components/HizDemo'
import { UstBar } from '../components/Logo'

/** Geçici: B1 temel bileşen vitrini. Asıl açılış sayfası (W1) B6'da yapılacak. */
export default function Acilis() {
  const [secili, setSecili] = useState<string | null>('avatar-3')
  const git = useNavigate()
  return (
    <main className="sayfa pb-10">
      <DevreHatlari kose="sag-kenar" ust={120} boyut={200} />
      <DevreHatlari kose="sol-alt" boyut={200} />
      <UstBar sag={<span className="etiket">Vitrin</span>} />
      <div className="mx-auto max-w-[480px] px-5 pt-4">
        <h1 className="baslik">
          Sınav değil,
          <br />
          düello<em>.</em>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--soluk)]">Açılış sayfası B6’da gelecek. Şimdilik buradan oyuna gir.</p>
        <div className="mt-6">
          <Button onClick={() => git('/menu')}>Hemen oyna</Button>
        </div>

        <section className="mt-8 flex flex-col gap-3">
          <span className="etiket">Button</span>
          <Button>Lobi kur</Button>
          <Button tur="iki">Katıl</Button>
          <Button tur="uc">Ana menüye dön</Button>
          <Button disabled>Pasif</Button>
        </section>

        <section className="mt-8">
          <span className="etiket">Cip</span>
          <div className="mt-3 flex flex-wrap gap-2">
            <Cip>Matematik ×4</Cip>
            <Cip>Fizik ×2</Cip>
            <Cip dolu>Seçili</Cip>
            <Cip dolu kucuk>HOST</Cip>
          </div>
        </section>

        <section className="mt-8">
          <span className="etiket">Avatar</span>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Avatar avatarKey={secili} ad="Deniz" boyut={104} ben />
            {AVATAR_KEYS.slice(0, 4).map(k => <Avatar key={k} avatarKey={k} boyut={48} />)}
            <Avatar avatarKey={null} ad="Elif" boyut={48} />
          </div>
          <div className="mt-4">
            <AvatarSecici secili={secili} onSec={setSecili} />
          </div>
        </section>

        <section className="mt-8">
          <span className="etiket">2× hız modu · 5 oyuncu</span>
          <HizDemo />
        </section>

        <section className="mt-8">
          <Card bant="Canlı sıralama" bantSag="Tüm zamanlar">
            <div className="flex items-center gap-3 px-4 py-3">
              <Avatar avatarKey="avatar-7" ad="Elif" boyut={32} />
              <span className="flex-1 font-semibold">Elif</span>
              <span className="font-baslik text-[17px] font-extrabold">1.120</span>
            </div>
          </Card>
        </section>
      </div>
    </main>
  )
}
