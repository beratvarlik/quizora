import Avatar, { AVATAR_KEYS } from './Avatar'

interface Props {
  secili: string | null
  onSec: (avatarKey: string) => void
}

/** Profil için hazır avatar ızgarası: 24 avatar, web'de 6×4, mobilde 4 sütun kaydırmalı. Seçilen zıplar. */
export default function AvatarSecici({ secili, onSec }: Props) {
  const sec = (key: string, el: HTMLButtonElement) => {
    onSec(key)
    el.classList.remove('zipla'); void el.offsetWidth; el.classList.add('zipla')
  }
  return (
    <div className="av-secici" role="group" aria-label="Hazır avatarlar">
      {AVATAR_KEYS.map((key, i) => (
        <button key={key} type="button" className="av-sec" aria-pressed={secili === key} aria-label={`Avatar ${i + 1}`}
          onClick={e => sec(key, e.currentTarget)}>
          <Avatar avatarKey={key} boyut={64} />
        </button>
      ))}
    </div>
  )
}
