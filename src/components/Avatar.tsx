/** Hazır avatarlar: public/avatars/avatar-N.webp (512px) ve avatar-N-kucuk.webp (256px). avatarKey = 'avatar-1' … 'avatar-10'. */
export const AVATAR_KEYS = Array.from({ length: 10 }, (_, i) => `avatar-${i + 1}`)

export const avatarSrc = (key: string, buyuk = false) => `/avatars/${key}${buyuk ? '' : '-kucuk'}.webp`

interface Props {
  avatarKey: string | null
  /** Kendi yüklediği fotoğraf (varsa avatarKey'in önüne geçer). */
  photoUrl?: string | null
  /** Ad: alt metin ve görsel yoksa baş harf için. */
  ad?: string
  /** Çap (px). 96px ve üstünde 512px sürümü kullanılır. */
  boyut?: number
  /** "Sen" olan oyuncu: turuncu kenar. */
  ben?: boolean
  className?: string
}

/** Daire kırpılmış avatar, 2px krem kenar (bordo ve gece zeminde kaybolmasın). */
export default function Avatar({ avatarKey, photoUrl, ad = '', boyut = 48, ben = false, className = '' }: Props) {
  const src = photoUrl || (avatarKey ? avatarSrc(avatarKey, boyut >= 96) : null)
  return (
    <span className={`av${ben ? ' halka-ben' : ''} ${className}`} style={{ width: boyut, height: boyut }}>
      {src ? (
        <img src={src} alt={ad} width={boyut} height={boyut} decoding="async" draggable={false} />
      ) : (
        <span className="av-harf" style={{ fontSize: boyut * 0.42 }} aria-label={ad}>
          {ad.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?'}
        </span>
      )}
    </span>
  )
}
