import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HataEkrani, Yukleniyor } from '../components/Durum'
import { hataMesaji } from '../hooks/hata'
import { useSession } from '../hooks/useSession'
import { api } from '../lib/client'

/** QR / bağlantıyla gelen: profili yoksa önce profile, sonra lobiye katılır. */
export default function Join() {
  const { code = '' } = useParams()
  const git = useNavigate()
  const { profile, loading, error } = useSession()
  const [hata, setHata] = useState<string | null>(null)
  const basladi = useRef(false)

  useEffect(() => {
    if (loading || error || basladi.current) return
    basladi.current = true
    if (!profile) {
      git(`/profil?sonra=${encodeURIComponent(`/join/${code}`)}`, { replace: true })
      return
    }
    api.joinGame(code).then(
      () => git(`/lobi/${code.toUpperCase()}`, { replace: true }),
      e => setHata(hataMesaji(e)),
    )
  }, [loading, error, profile, code, git])

  if (error || hata) return <HataEkrani mesaj={error ?? hata ?? ''} />
  return <Yukleniyor sag={<span className="etiket">Katılınıyor…</span>} />
}
