import type { Kategori, Sinav } from '../types'

export interface KategoriBilgi { k: Kategori; sinav: Sinav; kisa: string; ad: string; dagilim: string[] }

export const KATEGORILER: KategoriBilgi[] = [
  { k: 'sayisal', sinav: 'yks', kisa: 'SAY', ad: 'Sayısal', dagilim: ['Matematik ×4', 'Fizik ×2', 'Kimya ×2', 'Biyoloji ×2'] },
  { k: 'esit_agirlik', sinav: 'yks', kisa: 'EA', ad: 'Eşit Ağırlık', dagilim: ['Edebiyat ×4', 'Matematik ×2', 'Tarih ×1', 'Coğrafya ×1', 'Felsefe ×1', 'Din ×1'] },
  { k: 'sozel', sinav: 'yks', kisa: 'SÖZ', ad: 'Sözel', dagilim: ['Edebiyat ×4', 'Tarih ×2', 'Coğrafya ×2', 'Felsefe ×1', 'Din ×1'] },
  { k: 'tyt', sinav: 'yks', kisa: 'TYT', ad: 'Temel Yeterlilik', dagilim: ['Matematik ×2', 'Türkçe ×1', 'Fizik ×1', 'Kimya ×1', 'Biyoloji ×1', 'Tarih ×1', 'Coğrafya ×1', 'Felsefe ×1', 'Din ×1'] },
  { k: 'lgs_sozel', sinav: 'lgs', kisa: 'SÖZ', ad: 'LGS Sözel', dagilim: ['Türkçe ×4', 'İnkılap ×2', 'Din ×2', 'İngilizce ×2'] },
  { k: 'lgs_sayisal', sinav: 'lgs', kisa: 'SAY', ad: 'LGS Sayısal', dagilim: ['Matematik ×5', 'Fen ×5'] },
]
export const kategoriBul = (k: Kategori) => KATEGORILER.find(c => c.k === k) ?? KATEGORILER[0]

const KISA_AD: Record<Kategori, string> = {
  sayisal: 'Sayısal',
  esit_agirlik: 'Eşit Ağırlık',
  sozel: 'Sözel',
  tyt: 'TYT',
  lgs_sozel: 'Sözel',
  lgs_sayisal: 'Sayısal',
}
/** "LGS · Sözel" / "YKS · Sayısal" */
export const sinavEtiketi = (k: Kategori) => `${k.startsWith('lgs_') ? 'LGS' : 'YKS'} · ${KISA_AD[k] ?? k}`

/** Sınava göre şık harfleri: LGS 4 şık (A–D), YKS 5 şık (A–E). */
export const sinavHarfleri = (sinav: Sinav): Array<'A' | 'B' | 'C' | 'D' | 'E'> => (sinav === 'lgs' ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E'])

// Çizgi ikonlar: aynı stil (stroke=currentColor, 2px, yuvarlak uç) → renk kartın CSS'inden gelir.
function abakus(x0: number, y0: number, w: number, h: number, teller: Array<[number, number[]]>, r: number) {
  let d = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${r * 1.2}"/>`
  for (const [y, boncuk] of teller) {
    let x = x0
    for (const bx of boncuk) {
      if (bx - r - x > 0.5) d += `<path d="M${x} ${y}H${bx - r}"/>`
      d += `<circle cx="${bx}" cy="${y}" r="${r}"/>`
      x = bx + r
    }
    if (x0 + w - x > 0.5) d += `<path d="M${x} ${y}H${x0 + w}"/>`
  }
  return d
}
const kitap = (y: number, h: number) =>
  `<path d="M24 ${y}C18 ${y - 3.5} 11 ${y - 4} 5 ${y - 3}V${y + h - 3}C11 ${y + h - 4} 18 ${y + h - 3.5} 24 ${y + h}"/><path d="M24 ${y}C30 ${y - 3.5} 37 ${y - 4} 43 ${y - 3}V${y + h - 3}C37 ${y + h - 4} 30 ${y + h - 3.5} 24 ${y + h}"/><path d="M24 ${y}V${y + h}"/>`
const tuy = (x: number, y: number, s: number) =>
  `<path d="M${x} ${y}C${x - 8 * s} ${y + 1 * s} ${x - 14 * s} ${y + 9 * s} ${x - 15 * s} ${y + 21 * s}C${x - 10 * s} ${y + 17 * s} ${x - 2 * s} ${y + 10 * s} ${x} ${y}Z"/><path d="M${x - 16 * s} ${y + 25 * s}L${x - 6 * s} ${y + 9 * s}"/>`

const IKON: Record<Kategori, string> = {
  sayisal: abakus(5, 8, 38, 30, [[16, [12, 18, 32]], [23, [12, 18, 24, 37]], [30, [12, 28, 34]]], 2.6) + '<path d="M10 38v4M38 38v4"/>',
  esit_agirlik: abakus(3, 3, 22, 16, [[8.5, [8, 13, 20]], [14, [8, 17]]], 1.9) + kitap(29, 15) + tuy(45, 3, 0.78),
  sozel: kitap(17, 24) + '<path d="M9 20.5C12.5 20 16 20.4 20 21.6M9 26.5C12.5 26 16 26.4 20 27.6M9 32.5C12.5 32 16 32.4 20 33.6"/>' + tuy(46, 2, 1),
  tyt: '<circle cx="21" cy="27" r="17"/><circle cx="21" cy="27" r="11"/><circle cx="21" cy="27" r="5"/><path d="M21 27L40 8"/><path d="M21 27l6.5-.8M21 27l.8-6.5"/><path d="M40 8l5-1M40 8l1-5M36.5 11.5l5-1M36.5 11.5l1-5"/>',
  lgs_sozel: kitap(21, 22) + '<path d="M9 24.5C12.5 24 16 24.4 20 25.6M9 30.5C12.5 30 16 30.4 20 31.6"/><path d="M27 3h16a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-9l-5 4v-4h-2a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z"/><path d="M31 9.5h8"/>',
  lgs_sayisal: '<path d="M13 6h12M16 6v12L6 37.5A3.5 3.5 0 0 0 9 43h20a3.5 3.5 0 0 0 3-5.5L22 18V6"/><path d="M10 31h18"/><path d="M33 4l11 11H33z"/><path d="M36 11v4M39.5 14.5v.5"/>',
}

export function KategoriIkon({ k }: { k: Kategori }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: IKON[k] }} />
  )
}
