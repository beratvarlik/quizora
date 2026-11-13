/** Hazır avatarlar: public/avatars/avatar-N.webp (256px) ve avatar-N-kucuk.webp (128px), N = 1…24.
 *  Dosyalar zaten daire kesimli ve arka planı şeffaf. avatarKey = 'avatar-1' … 'avatar-24'. */
export const AVATAR_KEYS = Array.from({ length: 24 }, (_, i) => `avatar-${i + 1}`)

export const avatarSrc = (key: string, buyuk = false) => `/avatars/${key}${buyuk ? '' : '-kucuk'}.webp`

interface Props {
  avatarKey: string | null
  /** Kendi yüklediği fotoğraf (varsa avatarKey'in önüne geçer; daireye kırpılır). */
  photoUrl?: string | null
  /** Ad: alt metin ve görsel yoksa baş harf için. */
  ad?: string
  /** Çap (px). 64px'ten büyükse 256px sürümü kullanılır (128px sürümü 2× ekranda 64px'e kadar net). */
  boyut?: number
  /** "Sen" olan oyuncu: turuncu hale. */
  ben?: boolean
  className?: string
}

/** Avatar: 2px krem kenar (bordo ve gece zeminde kaybolmasın) box-shadow ile; "sen" turuncu hale. */
export default function Avatar({ avatarKey, photoUrl, ad = '', boyut = 48, ben = false, className = '' }: Props) {
  const src = photoUrl || (avatarKey ? avatarSrc(avatarKey, boyut > 64) : null)
  return (
    <span className={`av${ben ? ' halka-ben' : ''}${photoUrl ? ' av-foto' : ''} ${className}`} style={{ width: boyut, height: boyut }}>
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
