import { useSes } from '../hooks/useSes'

/** Geliştirme: yalnızca ?ses=test ile görünen ses test paneli. */
export function sesTestAcik(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('ses') === 'test') {
      sessionStorage.setItem('quizora.sesTest', '1')
      return true
    }
    return sessionStorage.getItem('quizora.sesTest') === '1'
  } catch {
    return false
  }
}

export default function SesTestPaneli() {
  const { test } = useSes()
  const dugmeler: Array<[string, () => void]> = [
    ['Başlama kornası', test.baslamaKornasi],
    ['Müzik seviye 1', () => test.seviye(1)],
    ['Müzik seviye 2', () => test.seviye(2)],
    ['Müzik seviye 3', () => test.seviye(3)],
    ['Riser', () => void test.riser()],
    ['Bitiş kornası', test.bitisKornasi],
    ['Kutlama', test.kutlama],
    ['Sakin (menü)', test.sakin],
    ['Durdur', test.durdur],
  ]
  return (
    <div className="ses-test" role="region" aria-label="Ses test paneli">
      <b>Ses testi</b>
      {dugmeler.map(([ad, f]) => (
        <button key={ad} type="button" onClick={f}>
          {ad}
        </button>
      ))}
    </div>
  )
}
