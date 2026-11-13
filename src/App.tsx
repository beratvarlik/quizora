import { Navigate, Route, Routes } from 'react-router-dom'
import Acilis from './pages/Acilis'
import Profil from './pages/Profil'
import Menu from './pages/Menu'
import Lobi from './pages/Lobi'
import Join from './pages/Join'
import Oyun from './pages/Oyun'
import Sonuc from './pages/Sonuc'
import Yanlislarim from './pages/Yanlislarim'
import Coz from './pages/Coz'
import SesTestPaneli, { sesTestAcik } from './components/SesTestPaneli'
import { useSes } from './hooks/useSes'

export default function App() {
  useSes() // ilk dokunuşta ses motorunun kilidini açmak için dinleyicileri kurar
  return (
    <>
    <Routes>
      <Route path="/" element={<Acilis />} />
      <Route path="/profil" element={<Profil />} />
      <Route path="/menu" element={<Menu />} />
      <Route path="/lobi/:code" element={<Lobi />} />
      <Route path="/join/:code" element={<Join />} />
      <Route path="/oyun/:code" element={<Oyun />} />
      <Route path="/sonuc/:code" element={<Sonuc />} />
      <Route path="/yanlislarim" element={<Yanlislarim />} />
      <Route path="/yanlislarim/coz" element={<Coz />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    {sesTestAcik() && <SesTestPaneli />}
    </>
  )
}
