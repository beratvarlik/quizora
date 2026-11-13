// Quizora — bellek içi sahte API (Kişi B). Gerçek backend hazır olana kadar
// oyunu baştan sona oynanabilir kılar. Kurallar docs/PROJE.md ile aynıdır.
import type {
  AnswerResult,
  GameInfo,
  GameResult,
  GameReview,
  GameSnapshot,
  GlobalRow,
  Kategori,
  MistakeItem,
  MistakeSummary,
  MyStats,
  PerformanceStats,
  PlayerState,
  PracticeResult,
  Profile,
  Question,
  QuizoraApi,
  RankedPlayer,
  ReviewItem,
  ReviewOutcome,
  Secenek,
  Sinav,
  Unsubscribe,
  XpBreakdown,
} from '../types'
import { rankPlayers, remainingMs, scorePoints } from './scoring'

// ---------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------
const SURE_MS = 120_000
const SORU_SAYISI = 10
const LOBI_SINIRI = 5

const bekle = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const ag = () => bekle(60 + Math.random() * 90) // sahte ağ gecikmesi
const rastgele = (a: number, b: number) => a + Math.random() * (b - a)
const sec = <T,>(dizi: readonly T[]) => dizi[Math.floor(Math.random() * dizi.length)]
function karistir<T>(dizi: readonly T[]): T[] {
  const k = [...dizi]
  for (let i = k.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[k[i], k[j]] = [k[j], k[i]]
  }
  return k
}
// crypto.randomUUID yalnızca güvenli bağlamda (https) var; telefondan LAN IP ile açınca yok.
function kimlik(): string {
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${h()}-${h()}${h()}${h()}`
}
const KOD_HARFLERI = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // I, O, 0, 1 yok
function kodUret(): string {
  let k = 'QZ-'
  for (let i = 0; i < 4; i++) k += sec(KOD_HARFLERI.split(''))
  return k
}
function kodNormalle(kod: string): string {
  const temiz = kod.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const govde = temiz.startsWith('QZ') ? temiz.slice(2) : temiz
  return `QZ-${govde}`
}

function oku<T>(anahtar: string): T | null {
  try {
    const v = localStorage.getItem(anahtar)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
function yaz(anahtar: string, deger: unknown) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger))
  } catch {
    /* gizli sekme vb. — bellekte kalır */
  }
}

function hizliMi(): boolean {
  try {
    if (new URLSearchParams(location.search).get('hizli') === '1') {
      sessionStorage.setItem('quizora.mock.hizli', '1')
      return true
    }
    return sessionStorage.getItem('quizora.mock.hizli') === '1'
  } catch {
    return false
  }
}
hizliMi() // açılıştaki ?hizli=1 bayrağını sakla

// ---------------------------------------------------------------------
// XP / rütbe (PROJE.md tablosu)
// ---------------------------------------------------------------------
const KADEMELER: ReadonlyArray<{ key: string; label: string; min: number }> = [
  { key: 'caylak', label: 'Çaylak', min: 0 },
  { key: 'bronz_1', label: 'Bronz I', min: 100 },
  { key: 'bronz_2', label: 'Bronz II', min: 150 },
  { key: 'bronz_3', label: 'Bronz III', min: 200 },
  { key: 'gumus_1', label: 'Gümüş I', min: 260 },
  { key: 'gumus_2', label: 'Gümüş II', min: 330 },
  { key: 'gumus_3', label: 'Gümüş III', min: 400 },
  { key: 'altin_1', label: 'Altın I', min: 480 },
  { key: 'altin_2', label: 'Altın II', min: 570 },
  { key: 'altin_3', label: 'Altın III', min: 660 },
  { key: 'elmas_1', label: 'Elmas I', min: 760 },
  { key: 'elmas_2', label: 'Elmas II', min: 870 },
  { key: 'elmas_3', label: 'Elmas III', min: 980 },
  { key: 'efsane', label: 'Efsane', min: 1100 },
]
function kademe(xp: number) {
  let i = 0
  while (i + 1 < KADEMELER.length && xp >= KADEMELER[i + 1].min) i++
  return { simdiki: KADEMELER[i], sonraki: KADEMELER[i + 1] ?? null }
}
/** Rütbe sırası (0 = Çaylak). Günlük görevler katmanı ödülde rütbe atlamayı bununla anlar. */
export function kademeSirasi(xp: number): number {
  let i = 0
  while (i + 1 < KADEMELER.length && xp >= KADEMELER[i + 1].min) i++
  return i
}
function istatistik(xp: number, wins: number, gamesPlayed: number): MyStats {
  const { simdiki, sonraki } = kademe(xp)
  return {
    xp,
    rankKey: simdiki.key,
    rankLabel: simdiki.label,
    nextRankLabel: sonraki?.label ?? null,
    xpToNext: sonraki ? sonraki.min - xp : null,
    progressPct: sonraki ? Math.round((100 * (xp - simdiki.min)) / (sonraki.min - simdiki.min)) : 100,
    wins,
    gamesPlayed,
  }
}
const SIRA_XP = [30, 15, 8]

// ---------------------------------------------------------------------
// Soru havuzu — doğru şık her zaman ilk sırada yazılır, oyuna girerken karıştırılır.
// ---------------------------------------------------------------------
type HamSoru = { metin: string; dogru: string; yanlis: string[] }
type Havuz = Record<string, HamSoru[]>

const YKS: Havuz = {
  Matematik: [
    { metin: 'x + 3 = 2x − 5 ise x kaçtır?', dogru: '8', yanlis: ['2', '5', '10', '13'] },
    { metin: 'Bir sayının %20’si 36 ise bu sayı kaçtır?', dogru: '180', yanlis: ['72', '144', '160', '200'] },
    { metin: 'f(x) = 2x² − 3 ise f(2) kaçtır?', dogru: '5', yanlis: ['1', '3', '7', '11'] },
    { metin: 'log₂ 32 ifadesinin değeri kaçtır?', dogru: '5', yanlis: ['4', '6', '8', '16'] },
    { metin: 'İç açılarının toplamı 720° olan çokgen kaç kenarlıdır?', dogru: '6', yanlis: ['5', '7', '8', '10'] },
    { metin: '2’den 20’ye kadar olan çift sayıların toplamı kaçtır?', dogru: '110', yanlis: ['100', '105', '120', '210'] },
  ],
  Fizik: [
    { metin: 'Serbest düşmeye bırakılan bir cisim 2 saniye sonra kaç m/s hıza ulaşır? (g = 10 m/s²)', dogru: '20', yanlis: ['5', '10', '40', '200'] },
    { metin: 'Kuvvetin SI birimi aşağıdakilerden hangisidir?', dogru: 'Newton', yanlis: ['Joule', 'Watt', 'Pascal', 'Volt'] },
    { metin: 'Direnci 5 Ω olan bir iletkenin uçlarına 20 V gerilim uygulanırsa iletkenden kaç A akım geçer?', dogru: '4', yanlis: ['0,25', '2', '15', '100'] },
  ],
  Kimya: [
    { metin: 'Periyodik tablonun 1A grubundaki metallere ne ad verilir?', dogru: 'Alkali metaller', yanlis: ['Halojenler', 'Soy gazlar', 'Toprak alkali metaller', 'Geçiş metalleri'] },
    { metin: 'pH değeri 7’den küçük olan bir çözelti için hangisi doğrudur?', dogru: 'Asidiktir', yanlis: ['Baziktir', 'Nötrdür', 'Elektriği hiç iletmez', 'Yalnızca tuz içerir'] },
    { metin: 'Atom numarası 8 olan elementin sembolü hangisidir?', dogru: 'O', yanlis: ['N', 'C', 'F', 'Ne'] },
  ],
  Biyoloji: [
    { metin: 'Hücrede ATP üretiminin büyük kısmından sorumlu organel hangisidir?', dogru: 'Mitokondri', yanlis: ['Ribozom', 'Golgi cisimciği', 'Lizozom', 'Koful'] },
    { metin: 'Fotosentez bitki hücresinin hangi organelinde gerçekleşir?', dogru: 'Kloroplast', yanlis: ['Mitokondri', 'Ribozom', 'Çekirdek', 'Lizozom'] },
    { metin: 'İnsanın vücut (somatik) hücrelerinde kaç kromozom bulunur?', dogru: '46', yanlis: ['23', '44', '48', '92'] },
  ],
  Tarih: [
    { metin: 'Malazgirt Meydan Muharebesi hangi yıl yapılmıştır?', dogru: '1071', yanlis: ['1040', '1176', '1243', '1453'] },
    { metin: 'İstanbul’u fetheden Osmanlı padişahı kimdir?', dogru: 'Fatih Sultan Mehmet', yanlis: ['Yavuz Sultan Selim', 'Kanuni Sultan Süleyman', 'II. Murad', 'Orhan Bey'] },
    { metin: 'Türkiye Büyük Millet Meclisi hangi tarihte açılmıştır?', dogru: '23 Nisan 1920', yanlis: ['19 Mayıs 1919', '29 Ekim 1923', '30 Ağustos 1922', '3 Mart 1924'] },
  ],
  Coğrafya: [
    { metin: 'Türkiye sınırları içinde doğup denize dökülen en uzun akarsu hangisidir?', dogru: 'Kızılırmak', yanlis: ['Sakarya', 'Fırat', 'Yeşilırmak', 'Dicle'] },
    { metin: 'Dünya’nın kendi ekseni etrafında dönmesinin sonucu hangisidir?', dogru: 'Gece ile gündüzün oluşması', yanlis: ['Mevsimlerin oluşması', 'Güneş’in dönencelere dik gelmesi', 'Kutuplarda 6 ay gece yaşanması', 'Gölge boyunun yıl içinde değişmesi'] },
    { metin: 'Türkiye’nin en yüksek dağı hangisidir?', dogru: 'Ağrı Dağı', yanlis: ['Erciyes', 'Süphan', 'Uludağ', 'Kaçkar'] },
  ],
  Felsefe: [
    { metin: '“Bildiğim tek şey, hiçbir şey bilmediğimdir.” sözü hangi filozofa aittir?', dogru: 'Sokrates', yanlis: ['Platon', 'Aristoteles', 'Descartes', 'Kant'] },
    { metin: 'Bilginin kaynağını, imkânını ve sınırlarını inceleyen felsefe dalı hangisidir?', dogru: 'Epistemoloji', yanlis: ['Ontoloji', 'Etik', 'Estetik', 'Mantık'] },
    { metin: '“Düşünüyorum, öyleyse varım.” diyen filozof kimdir?', dogru: 'Descartes', yanlis: ['Locke', 'Hume', 'Spinoza', 'Kant'] },
  ],
  'Din Kültürü': [
    { metin: 'Aşağıdakilerden hangisi İslam’ın beş şartından biri değildir?', dogru: 'Kurban kesmek', yanlis: ['Namaz kılmak', 'Oruç tutmak', 'Zekât vermek', 'Hacca gitmek'] },
    { metin: 'Kur’an-ı Kerim’in ilk suresi hangisidir?', dogru: 'Fâtiha', yanlis: ['Bakara', 'İhlâs', 'Yâsîn', 'Nâs'] },
    { metin: 'Hz. Muhammed’in Mekke’den Medine’ye göçüne ne ad verilir?', dogru: 'Hicret', yanlis: ['Miraç', 'Bedir', 'Hudeybiye', 'Veda'] },
  ],
  Edebiyat: [
    { metin: '“Sinekli Bakkal” romanının yazarı kimdir?', dogru: 'Halide Edib Adıvar', yanlis: ['Reşat Nuri Güntekin', 'Yakup Kadri Karaosmanoğlu', 'Peyami Safa', 'Sabahattin Ali'] },
    { metin: '“Çalıkuşu” romanının yazarı kimdir?', dogru: 'Reşat Nuri Güntekin', yanlis: ['Halide Edib Adıvar', 'Ömer Seyfettin', 'Refik Halit Karay', 'Orhan Kemal'] },
    { metin: 'Divan şairlerinin şiirlerini bir araya topladıkları esere ne ad verilir?', dogru: 'Divan', yanlis: ['Mesnevi', 'Tezkire', 'Cönk', 'Hamse'] },
    { metin: 'İstiklal Marşı’nın şairi kimdir?', dogru: 'Mehmet Akif Ersoy', yanlis: ['Namık Kemal', 'Ziya Gökalp', 'Tevfik Fikret', 'Yahya Kemal Beyatlı'] },
    { metin: 'Türk edebiyatının ilk yerli romanı kabul edilen eser hangisidir?', dogru: 'Taaşşuk-ı Tal’at ve Fitnat', yanlis: ['İntibah', 'Araba Sevdası', 'Eylül', 'Mai ve Siyah'] },
  ],
  Türkçe: [
    { metin: 'Aşağıdaki sözcüklerden hangisinin yazımı yanlıştır?', dogru: 'birşey', yanlis: ['herkes', 'yalnız', 'yanlış', 'şoför'] },
    { metin: 'Hangi cümlede “kırmak” sözcüğü mecaz anlamda kullanılmıştır?', dogru: 'Sözleriyle annesinin kalbini kırdı.', yanlis: ['Çocuk oynarken bardağı kırdı.', 'Fırtına ağacın dallarını kırdı.', 'Kalemin ucunu kırdı.', 'Cevizleri taşla kırdı.'] },
  ],
}

const LGS: Havuz = {
  Türkçe: [
    { metin: 'Aşağıdaki sözcüklerden hangisinin yazımı yanlıştır?', dogru: 'birşey', yanlis: ['herkes', 'yalnız', 'yanlış'] },
    { metin: '“Ağaç yaşken eğilir.” atasözü hangi anlamda kullanılır?', dogru: 'Eğitim küçük yaşta verilmelidir.', yanlis: ['Ağaçlar genç yaşta budanmalıdır.', 'Zor işler sabırla başarılır.', 'Büyüklere saygı gösterilmelidir.'] },
    { metin: 'Aşağıdakilerden hangisi eş anlamlı bir sözcük çiftidir?', dogru: 'siyah – kara', yanlis: ['uzun – kısa', 'sıcak – soğuk', 'geniş – dar'] },
    { metin: 'Hangi cümlede “kırmak” sözcüğü mecaz anlamda kullanılmıştır?', dogru: 'Sözleriyle annesinin kalbini kırdı.', yanlis: ['Çocuk oynarken bardağı kırdı.', 'Fırtına ağacın dallarını kırdı.', 'Kalemin ucunu kırdı.'] },
    { metin: 'Hangi cümlede soru ekinin yazımı yanlıştır?', dogru: 'Yarın geliyormusun?', yanlis: ['Bunu sen mi yaptın?', 'Ödevini bitirdin mi?', 'Bu kitap senin mi?'] },
  ],
  Matematik: [
    { metin: '2³ × 2² işleminin sonucu kaçtır?', dogru: '32', yanlis: ['10', '16', '64'] },
    { metin: '√49 + √16 işleminin sonucu kaçtır?', dogru: '11', yanlis: ['9', '13', '65'] },
    { metin: 'Dik kenarları 6 cm ve 8 cm olan dik üçgenin hipotenüsü kaç cm’dir?', dogru: '10', yanlis: ['7', '12', '14'] },
    { metin: '3x − 7 = 11 denkleminde x kaçtır?', dogru: '6', yanlis: ['4', '5', '7'] },
    { metin: 'Bir zar atıldığında üst yüze asal sayı gelme olasılığı kaçtır?', dogru: '1/2', yanlis: ['1/6', '1/3', '2/3'] },
    { metin: '0,25 ondalık sayısının en sade kesir hâli hangisidir?', dogru: '1/4', yanlis: ['1/2', '2/5', '5/2'] },
  ],
  'Fen Bilimleri': [
    { metin: 'DNA’nın yapısında bulunan şeker hangisidir?', dogru: 'Deoksiriboz', yanlis: ['Riboz', 'Glikoz', 'Fruktoz'] },
    { metin: 'Mevsimlerin oluşmasının temel nedeni hangisidir?', dogru: 'Dünya’nın eksen eğikliği', yanlis: ['Dünya’nın kendi ekseni etrafında dönmesi', 'Ay’ın Dünya etrafında dolanması', 'Güneş’in kendi ekseni etrafında dönmesi'] },
    { metin: 'Basıncın SI birimi hangisidir?', dogru: 'Pascal', yanlis: ['Newton', 'Joule', 'Watt'] },
    { metin: 'Aşağıdakilerden hangisi asidik bir maddedir?', dogru: 'Limon suyu', yanlis: ['Sabunlu su', 'Çamaşır suyu', 'Kireç suyu'] },
    { metin: 'Periyodik tabloda soy gazlar hangi grupta yer alır?', dogru: '8A', yanlis: ['1A', '2A', '7A'] },
    { metin: 'Bezelyede sarı tohum (S), yeşil tohuma (s) baskındır. Ss × Ss çaprazlamasında yeşil tohumlu birey oluşma olasılığı nedir?', dogru: '1/4', yanlis: ['0', '1/2', '3/4'] },
  ],
  'İnkılap Tarihi': [
    { metin: 'Mustafa Kemal Samsun’a hangi tarihte çıkmıştır?', dogru: '19 Mayıs 1919', yanlis: ['23 Nisan 1920', '29 Ekim 1923', '30 Ağustos 1922'] },
    { metin: 'Cumhuriyet hangi tarihte ilan edilmiştir?', dogru: '29 Ekim 1923', yanlis: ['23 Nisan 1920', '19 Mayıs 1919', '3 Mart 1924'] },
    { metin: 'Kurtuluş Savaşı’nda düzenli ordunun kazandığı ilk zafer hangisidir?', dogru: 'I. İnönü Muharebesi', yanlis: ['Sakarya Meydan Muharebesi', 'Büyük Taarruz', 'Kütahya-Eskişehir Muharebeleri'] },
  ],
  'Din Kültürü': [
    { metin: 'Kur’an-ı Kerim’in ilk suresi hangisidir?', dogru: 'Fâtiha', yanlis: ['Bakara', 'İhlâs', 'Yâsîn'] },
    { metin: 'Müslümanlar hangi ayda oruç tutar?', dogru: 'Ramazan', yanlis: ['Recep', 'Şaban', 'Muharrem'] },
    { metin: 'Hz. Muhammed’in Mekke’den Medine’ye göçüne ne ad verilir?', dogru: 'Hicret', yanlis: ['Miraç', 'Bedir', 'Veda'] },
  ],
  İngilizce: [
    { metin: 'Choose the correct option: She ___ to school every day.', dogru: 'goes', yanlis: ['go', 'going', 'gone'] },
    { metin: 'What is the opposite of “cheap”?', dogru: 'expensive', yanlis: ['easy', 'short', 'quiet'] },
    { metin: '“I’m really into photography.” This sentence shows that the speaker ___ photography.', dogru: 'is interested in', yanlis: ['hates', 'is bad at', 'has never tried'] },
  ],
}

// Kategori başına ders dağılımı (PROJE.md)
const DAGILIM: Record<Kategori, Array<[string, number]>> = {
  sayisal: [['Fizik', 2], ['Kimya', 2], ['Biyoloji', 2], ['Matematik', 4]],
  esit_agirlik: [['Tarih', 1], ['Coğrafya', 1], ['Felsefe', 1], ['Din Kültürü', 1], ['Matematik', 2], ['Edebiyat', 4]],
  sozel: [['Edebiyat', 4], ['Tarih', 2], ['Coğrafya', 2], ['Felsefe', 1], ['Din Kültürü', 1]],
  tyt: [['Türkçe', 1], ['Matematik', 2], ['Kimya', 1], ['Fizik', 1], ['Biyoloji', 1], ['Tarih', 1], ['Coğrafya', 1], ['Felsefe', 1], ['Din Kültürü', 1]],
  lgs_sozel: [['Türkçe', 4], ['İnkılap Tarihi', 2], ['Din Kültürü', 2], ['İngilizce', 2]],
  lgs_sayisal: [['Matematik', 5], ['Fen Bilimleri', 5]],
}

// Her soru için “Neden doğru?” açıklaması (soru metnine göre)
const ACIKLAMA: Record<string, string> = {
  "0,25 ondalık sayısının en sade kesir hâli hangisidir?": "0,25 = 25/100 demektir. Pay ve paydayı 25'e bölünce 1/4 elde edilir; daha fazla sadeleşmez.",
  "2³ × 2² işleminin sonucu kaçtır?": "Tabanları aynı üslü sayılar çarpılırken üsler toplanır: 2³ × 2² = 2⁵ = 32.",
  "2’den 20’ye kadar olan çift sayıların toplamı kaçtır?": "2 + 4 + … + 20 = 2 × (1 + 2 + … + 10) = 2 × 55 = 110.",
  "3x − 7 = 11 denkleminde x kaçtır?": "Her iki tarafa 7 eklenir: 3x = 18. İki taraf 3'e bölünür: x = 6.",
  "Atom numarası 8 olan elementin sembolü hangisidir?": "Atom numarası 8 olan element oksijendir ve sembolü O'dur. N (7) azot, C (6) karbon, F (9) flordur.",
  "Aşağıdaki sözcüklerden hangisinin yazımı yanlıştır?": "“Bir şey” her zaman ayrı yazılır. “Herkes, yalnız, yanlış, şoför” TDK yazım kılavuzuna uygundur.",
  "Aşağıdakilerden hangisi asidik bir maddedir?": "Limon suyu sitrik asit içerir, pH'ı 7'den küçüktür. Sabunlu su, çamaşır suyu ve kireç suyu baziktir.",
  "Aşağıdakilerden hangisi eş anlamlı bir sözcük çiftidir?": "Siyah ile kara aynı anlamı taşır. Diğer seçeneklerdeki çiftler (uzun – kısa, sıcak – soğuk, geniş – dar) zıt anlamlıdır.",
  "Aşağıdakilerden hangisi İslam’ın beş şartından biri değildir?": "İslam'ın şartları: kelime-i şehadet, namaz, oruç, zekât ve hac. Kurban kesmek vacip bir ibadettir ama beş şart arasında yer almaz.",
  "Basıncın SI birimi hangisidir?": "Basınç, birim yüzeye düşen dik kuvvettir (N/m²). Bu birime Pascal (Pa) denir. Newton kuvvetin, Joule enerjinin, Watt gücün birimidir.",
  "Bezelyede sarı tohum (S), yeşil tohuma (s) baskındır. Ss × Ss çaprazlamasında yeşil tohumlu birey oluşma olasılığı nedir?": "Ss × Ss çaprazlamasında SS, Ss, Ss, ss oluşur. Yeşil tohum yalnızca ss genotipinde görülür: 4'te 1, yani 1/4.",
  "Bilginin kaynağını, imkânını ve sınırlarını inceleyen felsefe dalı hangisidir?": "Bilgi felsefesine epistemoloji denir. Ontoloji varlığı, etik ahlakı, estetik güzeli, mantık doğru düşünmenin kurallarını inceler.",
  "Bir sayının %20’si 36 ise bu sayı kaçtır?": "Sayının %20'si, yani 1/5'i 36 ise sayının tamamı 36 × 5 = 180'dir.",
  "Bir zar atıldığında üst yüze asal sayı gelme olasılığı kaçtır?": "Zardaki asal sayılar 2, 3 ve 5'tir. 6 durumdan 3'ü istenen durumdur: 3/6 = 1/2.",
  "Choose the correct option: She ___ to school every day.": "“Every day” geniş zaman (Simple Present) ister. Üçüncü tekil şahıs (she) ile fiil -s/-es alır: she goes.",
  "Cumhuriyet hangi tarihte ilan edilmiştir?": "TBMM 29 Ekim 1923'te anayasada değişiklik yaparak Cumhuriyeti ilan etti; Mustafa Kemal ilk cumhurbaşkanı seçildi.",
  "DNA’nın yapısında bulunan şeker hangisidir?": "DNA, “deoksiribonükleik asit” demektir; yapısındaki beş karbonlu şeker deoksiribozdur. Riboz RNA'da bulunur.",
  "Dik kenarları 6 cm ve 8 cm olan dik üçgenin hipotenüsü kaç cm’dir?": "Pisagor bağıntısı: 6² + 8² = 36 + 64 = 100, hipotenüs √100 = 10 cm.",
  "Direnci 5 Ω olan bir iletkenin uçlarına 20 V gerilim uygulanırsa iletkenden kaç A akım geçer?": "Ohm yasası: I = V / R = 20 V / 5 Ω = 4 A.",
  "Divan şairlerinin şiirlerini bir araya topladıkları esere ne ad verilir?": "Divan şairleri şiirlerini nazım türlerine göre sıralayarak “divan” adlı eserde toplar. Mesnevi bir nazım şekli, tezkire şair biyografileri kitabıdır.",
  "Dünya’nın kendi ekseni etrafında dönmesinin sonucu hangisidir?": "Dünya kendi ekseni etrafında 24 saatte döner ve bu dönüş gece ile gündüzü oluşturur. Mevsimler ise eksen eğikliği ve Güneş etrafındaki dolanma ile oluşur.",
  "Fotosentez bitki hücresinin hangi organelinde gerçekleşir?": "Fotosentez, klorofil pigmentini taşıyan kloroplastlarda gerçekleşir. Mitokondri ise solunumla ATP üretir.",
  "Hangi cümlede soru ekinin yazımı yanlıştır?": "Soru eki “mi” her zaman ayrı yazılır: “geliyor musun?” olmalıdır. Diğer cümlelerde ek doğru biçimde ayrı yazılmıştır.",
  "Hangi cümlede “kırmak” sözcüğü mecaz anlamda kullanılmıştır?": "“Kalbini kırmak” birinin gönlünü incitmek anlamındadır, gerçek bir kırılma yoktur. Diğer cümlelerde nesneler gerçekten kırılmıştır.",
  "Hz. Muhammed’in Mekke’den Medine’ye göçüne ne ad verilir?": "622 yılındaki bu göçe Hicret denir ve Hicri takvimin başlangıcı kabul edilir. Miraç bir yükseliş olayı, Bedir ise bir savaştır.",
  "Hücrede ATP üretiminin büyük kısmından sorumlu organel hangisidir?": "Oksijenli solunumun büyük bölümü mitokondride gerçekleşir; bu yüzden mitokondri hücrenin enerji santrali olarak bilinir.",
  "Kurtuluş Savaşı’nda düzenli ordunun kazandığı ilk zafer hangisidir?": "Düzenli ordu ilk zaferini Ocak 1921'de I. İnönü Muharebesi'nde kazandı. Bu zaferle Teşkilat-ı Esasiye kabul edildi ve İstiklal Marşı yazıldı.",
  "Kur’an-ı Kerim’in ilk suresi hangisidir?": "Mushaf sıralamasında ilk sure Fâtiha'dır; “açan, başlatan” anlamına gelir. Bakara ikinci, Nâs son suredir.",
  "Kuvvetin SI birimi aşağıdakilerden hangisidir?": "Kuvvet F = m × a ile hesaplanır; 1 kg kütleye 1 m/s² ivme kazandıran kuvvet 1 Newton'dur.",
  "Malazgirt Meydan Muharebesi hangi yıl yapılmıştır?": "Sultan Alparslan komutasındaki Selçuklular 1071'de Bizans'ı yendi; bu zaferle Anadolu'nun kapıları Türklere açıldı.",
  "Mevsimlerin oluşmasının temel nedeni hangisidir?": "Dünya'nın ekseni yaklaşık 23,5° eğiktir. Güneş etrafında dolanırken ışınların geliş açısı değişir ve mevsimler oluşur.",
  "Mustafa Kemal Samsun’a hangi tarihte çıkmıştır?": "Mustafa Kemal 19 Mayıs 1919'da Samsun'a çıktı; bu tarih Millî Mücadele'nin başlangıcı kabul edilir.",
  "Müslümanlar hangi ayda oruç tutar?": "Oruç, Hicri takvimin dokuzuncu ayı olan Ramazan'da tutulur. Ramazan'ın sonunda Ramazan Bayramı kutlanır.",
  "Periyodik tabloda soy gazlar hangi grupta yer alır?": "Soy gazlar (He, Ne, Ar…) 8A grubundadır. Son katmanları dolu olduğu için kararlıdırlar ve zor tepkimeye girerler.",
  "Periyodik tablonun 1A grubundaki metallere ne ad verilir?": "1A grubundaki Li, Na, K gibi elementler alkali metallerdir; suyla tepkimeye girip baz oluştururlar. Halojenler 7A, soy gazlar 8A grubundadır.",
  "Serbest düşmeye bırakılan bir cisim 2 saniye sonra kaç m/s hıza ulaşır? (g = 10 m/s²)": "Serbest düşmede hız v = g × t ile bulunur: 10 m/s² × 2 s = 20 m/s.",
  "Türk edebiyatının ilk yerli romanı kabul edilen eser hangisidir?": "Şemsettin Sami'nin 1872'de yayımladığı “Taaşşuk-ı Tal'at ve Fitnat” ilk yerli roman kabul edilir. İntibah ilk edebî roman sayılır.",
  "Türkiye Büyük Millet Meclisi hangi tarihte açılmıştır?": "TBMM 23 Nisan 1920'de Ankara'da açıldı; bu tarih bugün Ulusal Egemenlik ve Çocuk Bayramı olarak kutlanır.",
  "Türkiye sınırları içinde doğup denize dökülen en uzun akarsu hangisidir?": "Kızılırmak yaklaşık 1.355 km ile hem doğduğu hem de denize döküldüğü yer Türkiye'de olan en uzun akarsudur; Karadeniz'e dökülür. Fırat ve Dicle denize sınırlarımız dışında ulaşır.",
  "Türkiye’nin en yüksek dağı hangisidir?": "Ağrı Dağı 5.137 m ile Türkiye'nin en yüksek noktasıdır; volkanik bir dağdır.",
  "What is the opposite of “cheap”?": "“Cheap” ucuz demektir; zıt anlamlısı “expensive” (pahalı) sözcüğüdür.",
  "f(x) = 2x² − 3 ise f(2) kaçtır?": "x yerine 2 yazılır: f(2) = 2 × 2² − 3 = 2 × 4 − 3 = 5.",
  "log₂ 32 ifadesinin değeri kaçtır?": "2'nin kaçıncı kuvveti 32'dir? 2⁵ = 32 olduğundan log₂ 32 = 5.",
  "pH değeri 7’den küçük olan bir çözelti için hangisi doğrudur?": "pH 7 nötrdür; 7'den küçük değerler asidik, büyük değerler baziktir. Asidik çözeltiler iyon içerdiği için elektriği iletebilir.",
  "x + 3 = 2x − 5 ise x kaçtır?": "x'li terimler bir tarafa toplanır: 3 + 5 = 2x − x, yani x = 8.",
  "İnsanın vücut (somatik) hücrelerinde kaç kromozom bulunur?": "İnsanın vücut hücreleri 2n = 46 kromozom taşır. Üreme hücreleri (sperm, yumurta) ise n = 23 kromozomludur.",
  "İstanbul’u fetheden Osmanlı padişahı kimdir?": "İstanbul 29 Mayıs 1453'te II. Mehmed tarafından fethedildi; bu yüzden “Fatih” unvanıyla anılır.",
  "İstiklal Marşı’nın şairi kimdir?": "İstiklal Marşı'nı Mehmet Akif Ersoy yazdı; 12 Mart 1921'de TBMM'de kabul edildi.",
  "İç açılarının toplamı 720° olan çokgen kaç kenarlıdır?": "n kenarlı çokgenin iç açıları toplamı (n − 2) × 180°'dir. (n − 2) × 180 = 720 → n − 2 = 4 → n = 6.",
  "“Ağaç yaşken eğilir.” atasözü hangi anlamda kullanılır?": "Genç ağaç kolay eğilir, yaşlanınca kırılır. Atasözü, eğitimin ve alışkanlık kazandırmanın küçük yaşta yapılması gerektiğini anlatır.",
  "“Bildiğim tek şey, hiçbir şey bilmediğimdir.” sözü hangi filozofa aittir?": "Bu söz Sokrates'e aittir; bilgeliğin, bilmediğinin farkında olmakla başladığını vurgular.",
  "“Düşünüyorum, öyleyse varım.” diyen filozof kimdir?": "“Cogito ergo sum” Descartes'ın sözüdür; şüphe ederken düşünen bir “ben”in var olduğundan emin olur.",
  "“I’m really into photography.” This sentence shows that the speaker ___ photography.": "“Be into something” bir şeye çok ilgi duymak, sevmek demektir. Yani konuşan kişi fotoğrafçılıkla ilgilidir (is interested in).",
  "“Sinekli Bakkal” romanının yazarı kimdir?": "Sinekli Bakkal Halide Edib Adıvar'ın romanıdır; önce İngilizce “The Clown and His Daughter” adıyla yayımlandı.",
  "“Çalıkuşu” romanının yazarı kimdir?": "Çalıkuşu Reşat Nuri Güntekin'in romanıdır; öğretmen Feride'nin Anadolu'daki hayatını anlatır.",
  "√49 + √16 işleminin sonucu kaçtır?": "√49 = 7 ve √16 = 4'tür; toplamları 7 + 4 = 11. Kökler ayrı ayrı hesaplanır, √65 ile aynı değildir."
}

interface IcSoru { ders: string; topic: string | null; text: string; options: Partial<Record<Secenek, string>>; dogru: Secenek; aciklama: string | null }

// Konu atamaları: soru metnindeki ayırt edici parça → konu. Atanmayanlar (Din Kültürü, İngilizce, birkaç soru) null.
const KONU: Array<[string, string]> = [
  ['x + 3 = 2x', 'Denklemler'], ['%20', 'Yüzde Problemleri'], ['f(x)', 'Fonksiyonlar'], ['log₂', 'Logaritma'], ['İç açılarının', 'Çokgenler'],
  ['Serbest düşme', 'Kuvvet ve Hareket'], ['Kuvvetin SI', 'Kuvvet ve Hareket'], ['Direnci 5', 'Elektrik'],
  ['1A grubundaki', 'Periyodik Sistem'], ['pH değeri', 'Asitler ve Bazlar'], ['Atom numarası 8', 'Periyodik Sistem'],
  ['ATP', 'Hücre'], ['Fotosentez', 'Hücre'], ['kromozom', 'Kalıtım'],
  ['Malazgirt', 'Türk-İslam Tarihi'], ['fetheden', 'Osmanlı Tarihi'], ['Büyük Millet Meclisi', 'Kurtuluş Savaşı'],
  ['akarsu', 'Türkiye’nin Fiziki Coğrafyası'], ['ekseni etrafında', 'Dünya’nın Hareketleri'], ['en yüksek dağı', 'Türkiye’nin Fiziki Coğrafyası'],
  ['Bilginin kaynağını', 'Bilgi Felsefesi'],
  ['Sinekli Bakkal', 'Cumhuriyet Dönemi Romanı'], ['Çalıkuşu', 'Cumhuriyet Dönemi Romanı'], ['Divan şairlerinin', 'Divan Edebiyatı'], ['ilk yerli romanı', 'Tanzimat Edebiyatı'],
  ['yazımı yanlıştır', 'Yazım Kuralları'], ['soru ekinin', 'Yazım Kuralları'], ['mecaz anlamda', 'Sözcükte Anlam'], ['Ağaç yaşken', 'Sözcükte Anlam'], ['eş anlamlı', 'Sözcükte Anlam'],
  ['2³ × 2²', 'Üslü Sayılar'], ['√49', 'Kareköklü İfadeler'], ['hipotenüsü', 'Üçgenler'], ['3x − 7', 'Denklemler'], ['zar atıldığında', 'Olasılık'],
  ['DNA’nın', 'DNA ve Genetik Kod'], ['Bezelyede', 'DNA ve Genetik Kod'], ['Mevsimlerin', 'Mevsimler ve İklim'], ['Basıncın', 'Basınç'],
  ['asidik', 'Asitler ve Bazlar'], ['soy gazlar', 'Periyodik Sistem'],
  ['Samsun’a', 'Millî Uyanış'], ['Kurtuluş Savaşı’nda', 'Millî Mücadele'],
]
const konuBul = (metin: string): string | null => KONU.find(([k]) => metin.includes(k))?.[1] ?? null

function sorulariHazirla(kategori: Kategori, sinav: Sinav): IcSoru[] {
  const havuz = sinav === 'lgs' ? LGS : YKS
  const ek = sinav === 'lgs' ? ' (LGS)' : kategori === 'tyt' ? ' (TYT)' : ' (AYT)'
  const harfler: Secenek[] = sinav === 'lgs' ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E']
  const liste: IcSoru[] = []
  for (const [ders, adet] of DAGILIM[kategori]) {
    const kaynak = karistir(havuz[ders] ?? [])
    for (let i = 0; i < adet && kaynak.length; i++) {
      const ham = kaynak[i % kaynak.length] // havuz küçükse başa dön
      const siklar = karistir([ham.dogru, ...ham.yanlis.slice(0, harfler.length - 1)])
      // LGS 4 şıklı: E anahtarı hiç yok (types.ts: options kısmi)
      const options: Partial<Record<Secenek, string>> = {}
      harfler.forEach((h, j) => (options[h] = siklar[j]))
      liste.push({ ders: ders + ek, topic: konuBul(ham.metin), text: ham.metin, options, dogru: harfler[siklar.indexOf(ham.dogru)], aciklama: ACIKLAMA[ham.metin] ?? null })
    }
  }
  return karistir(liste).slice(0, SORU_SAYISI)
}

// ---------------------------------------------------------------------
// Botlar
// ---------------------------------------------------------------------
const BOT_ADLARI = ['Elif', 'Kerem', 'Zeynep', 'Mert', 'Ada', 'Emir', 'Defne', 'Yusuf', 'Nehir', 'Arda', 'Ecrin', 'Baran']
interface Bot { id: string; ad: string; avatarKey: string; xp: number; wins: number; gamesPlayed: number }
const botlar = new Map<string, Bot>()
function botUret(haric: Set<string>): Bot {
  const ad = sec(BOT_ADLARI.filter(a => !haric.has(a))) ?? sec(BOT_ADLARI)
  const b: Bot = {
    id: kimlik(),
    ad,
    avatarKey: `avatar-${1 + Math.floor(Math.random() * 24)}`,
    xp: Math.floor(rastgele(0, 900)),
    wins: Math.floor(rastgele(0, 12)),
    gamesPlayed: Math.floor(rastgele(12, 40)),
  }
  botlar.set(b.id, b)
  return b
}

// ---------------------------------------------------------------------
// Oturum + profil + istatistik (localStorage)
// ---------------------------------------------------------------------
const K_UID = 'quizora.mock.uid'
const K_PROFIL = 'quizora.mock.profil'
const K_STAT = 'quizora.mock.stat'
interface Stat { xp: number; wins: number; gamesPlayed: number }

let uid: string | null = null
function benimId(): string {
  if (uid) return uid
  uid = oku<string>(K_UID)
  if (!uid) {
    uid = kimlik()
    yaz(K_UID, uid)
  }
  return uid
}
let profilBellek: Profile | null = null
function benimProfil(): Profile | null {
  if (profilBellek) return profilBellek
  const p = oku<Profile>(K_PROFIL)
  if (p && p.id === benimId()) profilBellek = p
  return profilBellek
}
let statBellek: Stat | null = null
function benimStat(): Stat {
  if (!statBellek) statBellek = oku<Stat>(K_STAT) ?? { xp: 0, wins: 0, gamesPlayed: 0 }
  return statBellek
}

/** YALNIZCA MOCK (geçici Günlük görevler katmanı için; api nesnesinde değil): XP ekler. */
export function mockXpEkle(n: number): { once: number; sonra: number } {
  const s = benimStat()
  const once = s.xp
  s.xp += n
  yaz(K_STAT, s)
  liderlikYayinla()
  return { once, sonra: s.xp }
}

/** Mock olayları: geçici Günlük görevler katmanı dinler (gerçek backend bunu sunucuda sayar). */
export const MOCK_OYUN_BITTI = 'quizora:mock-oyun-bitti'
export const MOCK_DEFTER_COZULDU = 'quizora:mock-defter-cozuldu'
export interface MockOyunOzeti { matematik: number; dogru: number; toplam: number; kazandi: boolean; oyuncu: number; herkeseAcik: boolean }
function mockOlay(ad: string, detail?: unknown) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(ad, { detail }))
  } catch {
    /* yok say */
  }
}

function fotoKucult(dosya: File): Promise<string> {
  return new Promise((coz, reddet) => {
    const url = URL.createObjectURL(dosya)
    const img = new Image()
    img.onload = () => {
      const boy = 256
      const c = document.createElement('canvas')
      c.width = boy
      c.height = boy
      const ctx = c.getContext('2d')
      if (!ctx) return reddet(new Error('Fotoğraf işlenemedi'))
      const kenar = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - kenar) / 2, (img.height - kenar) / 2, kenar, kenar, 0, 0, boy, boy)
      URL.revokeObjectURL(url)
      coz(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reddet(new Error('Fotoğraf açılamadı'))
    }
    img.src = url
  })
}

// ---------------------------------------------------------------------
// Oyun durumu
// ---------------------------------------------------------------------
interface Cevap { secenek: Secenek | null; dogru: boolean | null; puan: number; sureMs: number }
interface IcOyuncu {
  id: string
  bot: boolean
  ad: string
  avatarKey: string | null
  photoUrl: string | null
  score: number
  currentQ: number
  correctCount: number
  wrongCount: number
  finished: boolean
  totalTimeMs: number
  qStartedAt: number | null
  cevaplar: Map<number, Cevap>
}
interface IcOyun {
  info: GameInfo
  oyuncular: IcOyuncu[]
  sorular: IcSoru[]
  dinleyiciler: Set<(s: GameSnapshot) => void>
  zamanlayicilar: number[]
  saat: number | null
  sonuc: { ranking: RankedPlayer[]; xp: Map<string, XpBreakdown> } | null
}
const oyunlar = new Map<string, IcOyun>()
const kodlar = new Map<string, string>() // kod → id

function oyuncuXp(o: IcOyuncu): number {
  return o.bot ? (botlar.get(o.id)?.xp ?? 0) : benimStat().xp
}
function disOyuncu(o: IcOyuncu): PlayerState {
  const { simdiki } = kademe(oyuncuXp(o))
  return {
    userId: o.id,
    displayName: o.ad,
    avatarKey: o.avatarKey,
    photoUrl: o.photoUrl,
    score: o.score,
    currentQ: o.currentQ,
    correctCount: o.correctCount,
    wrongCount: o.wrongCount,
    finished: o.finished,
    totalTimeMs: o.totalTimeMs,
    rankKey: simdiki.key,
    rankLabel: simdiki.label,
  }
}
function anlik(g: IcOyun): GameSnapshot {
  return { game: { ...g.info }, players: g.oyuncular.map(disOyuncu) }
}
function yayinla(g: IcOyun) {
  const s = anlik(g)
  for (const cb of g.dinleyiciler) {
    try {
      cb(s)
    } catch (e) {
      console.error(e)
    }
  }
}
function zamanla(g: IcOyun, ms: number, is: () => void) {
  g.zamanlayicilar.push(window.setTimeout(is, ms))
}
function oyunBul(id: string): IcOyun {
  const g = oyunlar.get(id)
  if (!g) throw new Error('Oyun bulunamadı')
  return g
}
function oyuncuEkle(g: IcOyun, o: Omit<IcOyuncu, 'score' | 'currentQ' | 'correctCount' | 'wrongCount' | 'finished' | 'totalTimeMs' | 'qStartedAt' | 'cevaplar'>) {
  g.oyuncular.push({ ...o, score: 0, currentQ: 0, correctCount: 0, wrongCount: 0, finished: false, totalTimeMs: 0, qStartedAt: null, cevaplar: new Map() })
}
function botEkle(g: IcOyun) {
  if (g.info.status !== 'lobby' || g.oyuncular.length >= LOBI_SINIRI) return
  // Sunucudaki quick_join gibi: geri sayımın bitmesine 4 sn'den az kalan lobiye yeni oyuncu girmez
  if (g.info.isPublic && g.info.autoStartAt && Date.parse(g.info.autoStartAt) <= Date.now() + 4000) return
  const b = botUret(new Set(g.oyuncular.map(o => o.ad)))
  oyuncuEkle(g, { id: b.id, bot: true, ad: b.ad, avatarKey: b.avatarKey, photoUrl: null })
  otoBaslatGuncelle(g)
  yayinla(g)
}

/**
 * Herkese açık lobi auto_start kuralı (0009_hemen_katil.sql ile aynı):
 * oyuncu sayısı 2'ye ulaşınca şimdi + 10 sn, 5'e ulaşınca şimdi, 2'nin altına düşünce null.
 * 3. ve 4. oyuncu süreyi uzatmaz.
 */
function otoBaslatGuncelle(g: IcOyun) {
  if (!g.info.isPublic) return
  const n = g.oyuncular.length
  if (n < 2) g.info.autoStartAt = null
  else if (n >= LOBI_SINIRI) g.info.autoStartAt = new Date().toISOString()
  else if (n === 2 && !g.info.autoStartAt) g.info.autoStartAt = new Date(Date.now() + 10_000).toISOString()
}

function oyunuSil(g: IcOyun) {
  for (const t of g.zamanlayicilar) window.clearTimeout(t)
  if (g.saat !== null) window.clearInterval(g.saat)
  g.zamanlayicilar = []
  g.dinleyiciler.clear()
  oyunlar.delete(g.info.id)
  kodlar.delete(g.info.code)
}
function yeniOyun(kategori: Kategori, hostId: string, kod = kodUret()): IcOyun {
  while (kodlar.has(kod)) kod = kodUret()
  const sinav: Sinav = kategori.startsWith('lgs_') ? 'lgs' : 'yks'
  const g: IcOyun = {
    info: {
      id: kimlik(),
      code: kod,
      kategori,
      sinav,
      status: 'lobby',
      hostId,
      speedupBy: null,
      startedAt: null,
      speedupAt: null,
      speedupRemainingMs: null,
      durationMs: SURE_MS,
      totalQuestions: SORU_SAYISI,
      isPublic: false,
      autoStartAt: null,
    },
    oyuncular: [],
    sorular: sorulariHazirla(kategori, sinav),
    dinleyiciler: new Set(),
    zamanlayicilar: [],
    saat: null,
    sonuc: null,
  }
  oyunlar.set(g.info.id, g)
  kodlar.set(kod, g.info.id)
  return g
}

function benOyuncuyum(g: IcOyun): IcOyuncu {
  const ben = g.oyuncular.find(o => o.id === benimId())
  if (!ben) throw new Error('Bu oyuna erişimin yok')
  return ben
}

/** İlk bitiren 2× modu başlatır: kalan süre o andan itibaren iki kat hızlı akar. */
function hizlandir(g: IcOyun, kimId: string, simdi: number): boolean {
  if (g.info.speedupAt) return false
  g.info.speedupRemainingMs = remainingMs(g.info, simdi)
  g.info.speedupAt = new Date(simdi).toISOString()
  g.info.speedupBy = kimId
  return true
}

function cevapKaydet(g: IcOyun, o: IcOyuncu, secenek: Secenek | null, sureMs: number): { cevap: Cevap; hizlandi: boolean } {
  const soru = g.sorular[o.currentQ]
  const dogru = secenek === null ? null : secenek === soru.dogru
  const puan = scorePoints(dogru, sureMs / 1000)
  const cevap: Cevap = { secenek, dogru, puan, sureMs }
  o.cevaplar.set(o.currentQ, cevap)
  o.score += puan
  if (dogru === true) o.correctCount++
  if (dogru === false) o.wrongCount++
  o.totalTimeMs += Math.round(sureMs)
  o.currentQ++
  o.qStartedAt = null
  let hizlandi = false
  if (o.currentQ >= g.info.totalQuestions) {
    o.finished = true
    hizlandi = hizlandir(g, o.id, Date.now())
  }
  return { cevap, hizlandi }
}

function botCevaplat(g: IcOyun, o: IcOyuncu) {
  const gecikme = hizliMi() ? rastgele(500, 2000) : rastgele(3000, 12000)
  zamanla(g, gecikme, () => {
    if (g.info.status !== 'playing' || o.finished) return
    if (remainingMs(g.info, Date.now()) <= 0) return
    const soru = g.sorular[o.currentQ]
    const harfler = (Object.keys(soru.options) as Secenek[]).filter(h => soru.options[h])
    const secenek = Math.random() < 0.65 ? soru.dogru : sec(harfler.filter(h => h !== soru.dogru))
    cevapKaydet(g, o, secenek, gecikme)
    yayinla(g)
    bitisKontrol(g)
    if (!o.finished) botCevaplat(g, o)
  })
}

function bitisKontrol(g: IcOyun) {
  if (g.info.status !== 'playing') return
  const kalan = remainingMs(g.info, Date.now())
  const herkesBitti = g.oyuncular.every(o => o.finished)
  if (kalan <= 0 || herkesBitti) sonlandir(g)
}

// ---------------------------------------------------------------------
// Yanlışlarım defteri (bellekte). Yarış bitince (sonlandir) insan oyuncunun gördüğü yanlış/boş
// soruları yazar; doğru yaptığı defter sorusunu çözer. Çözülmüş soru tekrar yanlışsa geri döner.
// ---------------------------------------------------------------------
interface DefterKaydi { item: MistakeItem; dogru: Secenek; aciklama: string | null; cozuldu: boolean }
const defter = new Map<string, DefterKaydi>()
const defterOyun = new Map<string, number>() // gameId → bu yarıştan deftere giren soru sayısı
const SAAT_MS = 3_600_000
const soruKimligi = (ders: string, text: string) => `mq:${ders}|${text}`

function ornekKayit(
  exam: Sinav, subject: string, topic: string | null, text: string, options: Partial<Record<Secenek, string>>, dogru: Secenek,
  lastAnswer: Secenek | null, wrongCount: number, onceMs: number, aciklama: string | null,
) {
  const questionId = soruKimligi(subject, text)
  defter.set(questionId, {
    item: { questionId, exam, subject, topic, text, imageUrl: null, options, lastAnswer, wrongCount, lastWrongAt: new Date(Date.now() - onceMs).toISOString() },
    dogru, aciklama, cozuldu: false,
  })
}
ornekKayit('yks', 'Matematik (TYT)', 'Denklemler', 'x² − 5x + 6 = 0 denkleminin kökleri toplamı kaçtır?',
  { A: '2', B: '3', C: '5', D: '6', E: '−5' }, 'C', 'D', 3, 2 * 24 * SAAT_MS,
  'Kökler toplamı −b/a = −(−5)/1 = 5. Kökler 2 ve 3 olduğundan toplam 5.')
ornekKayit('yks', 'Matematik (AYT)', 'Logaritma', 'log₂ 32 ifadesinin değeri kaçtır?',
  { A: '4', B: '5', C: '6', D: '8', E: '16' }, 'B', null, 1, 5 * SAAT_MS, '2⁵ = 32 olduğundan log₂ 32 = 5.')
ornekKayit('yks', 'Fizik (AYT)', 'Kuvvet ve Hareket', 'Sürtünmesiz yatay düzlemde duran 2 kg kütleli cisme 10 N büyüklüğünde yatay kuvvet uygulanıyor. Cismin ivmesi kaç m/s² olur?',
  { A: '2', B: '4', C: '5', D: '10', E: '20' }, 'C', 'A', 2, 26 * SAAT_MS, 'Newton’un ikinci yasası: F = m·a → a = 10 / 2 = 5 m/s².')
ornekKayit('yks', 'Tarih (TYT)', 'Osmanlı Tarihi', 'Osmanlı Devleti’nde ilk düzenli ordu hangi padişah döneminde kurulmuştur?',
  { A: 'Osman Bey', B: 'Orhan Bey', C: 'I. Murat', D: 'Yıldırım Bayezid', E: 'Fatih Sultan Mehmet' }, 'B', 'C', 1, 3 * 24 * SAAT_MS,
  null) // bilerek boş: "açıklama henüz yok" durumu
ornekKayit('yks', 'Edebiyat (AYT)', null, '“Sefiller” romanının yazarı kimdir?',
  { A: 'Honoré de Balzac', B: 'Victor Hugo', C: 'Gustave Flaubert', D: 'Émile Zola', E: 'Stendhal' }, 'B', 'A', 1, 6 * 24 * SAAT_MS,
  'Sefiller (Les Misérables), Victor Hugo’nun 1862’de yayımlanan romanıdır.')
ornekKayit('yks', 'Kimya (TYT)', 'Mol Kavramı', 'Suyun (H₂O) mol kütlesi kaç g/mol’dür? (H: 1, O: 16)',
  { A: '16', B: '17', C: '18', D: '20', E: '34' }, 'C', 'E', 1, 2 * SAAT_MS, '2 · 1 + 16 = 18 g/mol.')
ornekKayit('lgs', 'Matematik (LGS)', 'Kareköklü İfadeler', '√49 + √16 işleminin sonucu kaçtır?',
  { A: '9', B: '11', C: '13', D: '65' }, 'B', 'C', 2, 4 * 24 * SAAT_MS, '√49 = 7 ve √16 = 4; 7 + 4 = 11.')
ornekKayit('lgs', 'Fen Bilimleri (LGS)', null, 'Bir besin zincirinde aşağıdakilerden hangisi üretici konumundadır?',
  { A: 'Tavşan', B: 'Kartal', C: 'Ot', D: 'Mantar' }, 'C', null, 1, 24 * SAAT_MS,
  'Üreticiler fotosentezle kendi besinini üretir; ot bir üreticidir. Mantar ayrıştırıcıdır.')

/** finish_game gibi: yarış başına bir kez. Hiç görülmeyen (süre bittiği için açılmayan) sorular girmez. */
function defteriYaz(g: IcOyun) {
  if (defterOyun.has(g.info.id)) return
  const ben = g.oyuncular.find(o => !o.bot)
  if (!ben) return
  const simdi = new Date().toISOString()
  let eklenen = 0
  g.sorular.forEach((s, i) => {
    const c = ben.cevaplar.get(i)
    const gordu = c !== undefined || (i === ben.currentQ && ben.qStartedAt !== null)
    if (!gordu) return
    const id = soruKimligi(s.ders, s.text)
    const k = defter.get(id)
    if (c?.dogru) {
      if (k) k.cozuldu = true // yarışta doğru yapınca defterden de çözülür
      return
    }
    eklenen++
    const lastAnswer = c?.secenek ?? null
    if (k) {
      k.item.wrongCount++
      k.item.lastAnswer = lastAnswer
      k.item.lastWrongAt = simdi
      // Mock şıkları her yarışta karıştırır: son cevap harfi son yarıştaki sıraya göre, şıkları da güncelle
      k.item.options = { ...s.options }
      k.dogru = s.dogru
      k.aciklama = s.aciklama ?? k.aciklama
      k.cozuldu = false
    } else {
      defter.set(id, {
        item: { questionId: id, exam: g.info.sinav, subject: s.ders, topic: s.topic, text: s.text, imageUrl: null, options: { ...s.options }, lastAnswer, wrongCount: 1, lastWrongAt: simdi },
        dogru: s.dogru,
        aciklama: s.aciklama,
        cozuldu: false,
      })
    }
  })
  defterOyun.set(g.info.id, eklenen)
}
const defterAcik = () => [...defter.values()].filter(k => !k.cozuldu)

// ---------------------------------------------------------------------
// Akıllı analiz / Performansım (sabit örnek veri; tanımlar 0011_akilli_analiz.sql ile aynı):
// answered = correct + wrong (boşlar ayrı), accuracy 0-100 bir ondalık, lowSample = answered < 3,
// byTopic: önce yeterli örnekliler (doğruluk artan), sonra lowSample; bySubject en çok çözülen önce;
// daily her zaman son 7 gün; streakDays filtrelerden bağımsız.
// ---------------------------------------------------------------------
type PerfHam = [subject: string, topic: string, correct: number, wrong: number, blank: number]
const PERF_KONU: Record<Sinav, PerfHam[]> = {
  yks: [
    ['Matematik (AYT)', 'Türev', 9, 5, 1],
    ['Matematik (AYT)', 'Logaritma', 4, 6, 2],
    ['Matematik (AYT)', 'Fonksiyonlar', 10, 2, 0],
    ['Fizik (AYT)', 'Kuvvet ve Hareket', 3, 6, 2],
    ['Fizik (AYT)', 'Elektrik', 3, 3, 1],
    ['Fizik (AYT)', 'Optik', 1, 1, 0],
    ['Kimya (TYT)', 'Mol Kavramı', 6, 2, 1],
    ['Kimya (TYT)', 'Asitler ve Bazlar', 6, 1, 0],
    ['Türkçe (TYT)', 'Sözcükte Anlam', 9, 6, 2],
    ['Tarih (TYT)', 'Osmanlı Tarihi', 2, 0, 0],
  ],
  lgs: [
    ['Matematik (LGS)', 'Üslü Sayılar', 7, 3, 1],
    ['Matematik (LGS)', 'Kareköklü İfadeler', 3, 5, 2],
    ['Fen Bilimleri (LGS)', 'DNA ve Genetik Kod', 6, 3, 0],
    ['Fen Bilimleri (LGS)', 'Basınç', 2, 4, 1],
    ['Türkçe (LGS)', 'Sözcükte Anlam', 8, 4, 1],
  ],
}
const PERF_SURE: Record<string, number> = {
  'Matematik (AYT)': 9800, 'Fizik (AYT)': 8700, 'Kimya (TYT)': 6900, 'Türkçe (TYT)': 7400, 'Tarih (TYT)': 5200,
  'Matematik (LGS)': 8300, 'Fen Bilimleri (LGS)': 6600, 'Türkçe (LGS)': 7100,
}
/** Son 7 gün (eskiden yeniye): inişli çıkışlı; 2. gün boş → seri 5 gün. */
const PERF_GUN: Record<Sinav, number[]> = { yks: [0.12, 0, 0.14, 0.21, 0.08, 0.17, 0.28], lgs: [0, 0, 0.2, 0.25, 0, 0.25, 0.3] }
const PERF_ISABET = [0.55, 0, 0.62, 0.7, 0.5, 0.68, 0.74]
const oran1 = (d: number, t: number) => (t ? Math.round((1000 * d) / t) / 10 : 0)
function istanbulGunu(onceGun: number): string {
  // Europe/Istanbul = UTC+3 (yaz saati yok)
  const d = new Date(Date.now() + 3 * SAAT_MS - onceGun * 24 * SAAT_MS)
  return d.toISOString().slice(0, 10)
}
function performansHesapla(exams: Sinav[], days: number): PerformanceStats {
  const kat = days <= 7 ? 1 : days <= 30 ? 3 : 6
  const byTopic = exams.flatMap(exam =>
    PERF_KONU[exam].map(([subject, topic, c, w]) => {
      const az = c + w < 3 // az örnekli konular pencereyle büyümez (örnek veri: lowSample kalsın)
      const correct = az ? c : c * kat
      const answered = az ? c + w : (c + w) * kat
      return { exam, subject, topic, answered, correct, accuracy: oran1(correct, answered), lowSample: answered < 3 }
    }),
  )
  byTopic.sort((a, b) => Number(a.lowSample) - Number(b.lowSample) || a.accuracy - b.accuracy || a.topic.localeCompare(b.topic, 'tr'))
  const dersler = new Map<string, PerformanceStats['bySubject'][number]>()
  for (const t of byTopic) {
    const d = dersler.get(t.subject) ?? { exam: t.exam, subject: t.subject, answered: 0, correct: 0, accuracy: 0, avgTimeMs: PERF_SURE[t.subject] ?? 8000 }
    d.answered += t.answered
    d.correct += t.correct
    dersler.set(t.subject, d)
  }
  const bySubject = [...dersler.values()].map(d => ({ ...d, accuracy: oran1(d.correct, d.answered) })).sort((a, b) => b.answered - a.answered)
  const answered = bySubject.reduce((t, d) => t + d.answered, 0)
  const correct = bySubject.reduce((t, d) => t + d.correct, 0)
  const blank = exams.flatMap(e => PERF_KONU[e]).reduce((t, [, , , , b]) => t + b * kat, 0)
  const avgTimeMs = answered ? Math.round(bySubject.reduce((t, d) => t + d.avgTimeMs * d.answered, 0) / answered) : 0

  const haftalik = (e: Sinav) => PERF_KONU[e].reduce((t, [, , c, w, b]) => t + c + w + b, 0)
  const daily = Array.from({ length: 7 }, (_, i) => {
    let a = 0
    let c = 0
    for (const e of exams) {
      const n = Math.round(haftalik(e) * PERF_GUN[e][i])
      a += n
      c += Math.min(n, Math.round(n * PERF_ISABET[i]))
    }
    return { date: istanbulGunu(6 - i), answered: a, correct: c }
  })
  // Seri filtrelerden bağımsız: iki sınavın günleri birlikte
  let streakDays = 0
  for (let i = 6; i >= 0 && (PERF_GUN.yks[i] > 0 || PERF_GUN.lgs[i] > 0); i--) streakDays++

  return {
    totals: { games: Math.max(1, Math.round((answered + blank) / 10)), answered, correct, wrong: answered - correct, blank, avgTimeMs, accuracy: oran1(correct, answered) },
    bySubject,
    byTopic,
    daily,
    streakDays,
  }
}

/** Yarışı kapatır: sıralama + XP bir kez hesaplanır (finish_game ile aynı kurallar). */
function sonlandir(g: IcOyun) {
  if (g.info.status === 'finished') return
  g.info.status = 'finished'
  if (g.saat !== null) clearInterval(g.saat)
  g.saat = null
  g.zamanlayicilar.forEach(t => clearTimeout(t))
  g.zamanlayicilar = []
  defteriYaz(g) // bitiş işaretinden önce: currentQ / qStartedAt ile "görüldü mü" belirlenir
  for (const o of g.oyuncular) o.finished = true

  const sirali = rankPlayers(g.oyuncular.map(disOyuncu))
  const xpUygula = g.oyuncular.length >= 2
  const xp = new Map<string, XpBreakdown>()
  const ranking: RankedPlayer[] = sirali.map(p => {
    const ic = g.oyuncular.find(o => o.id === p.userId)!
    const cevapladi = ic.cevaplar.size >= 1
    const kazanc: XpBreakdown = { participation: 0, points: 0, placement: 0, firstFinisher: 0, total: 0 }
    if (xpUygula && cevapladi) {
      kazanc.participation = 20
      kazanc.points = Math.max(0, Math.floor(p.score / 10))
      kazanc.placement = SIRA_XP[p.rank - 1] ?? 0
      kazanc.firstFinisher = g.info.speedupBy === p.userId ? 10 : 0
      kazanc.total = kazanc.participation + kazanc.points + kazanc.placement + kazanc.firstFinisher
    }
    xp.set(p.userId, kazanc)
    const once = oyuncuXp(ic)
    const sonra = once + kazanc.total
    if (ic.bot) {
      const b = botlar.get(ic.id)
      if (b) {
        b.xp = sonra
        if (cevapladi) b.gamesPlayed++
        if (p.rank === 1 && xpUygula) b.wins++
      }
    } else {
      const s = benimStat()
      s.xp = sonra
      if (cevapladi) s.gamesPlayed++
      if (p.rank === 1 && xpUygula && cevapladi) s.wins++
      yaz(K_STAT, s)
    }
    const kOnce = kademe(once).simdiki
    const kSonra = kademe(sonra).simdiki
    return {
      ...p,
      rankKey: kSonra.key,
      rankLabel: kSonra.label,
      xpGained: kazanc.total,
      xpBefore: once,
      xpAfter: sonra,
      rankLabelBefore: kOnce.label,
      rankLabelAfter: kSonra.label,
      rankedUp: kOnce.key !== kSonra.key,
    }
  })
  g.sonuc = { ranking, xp }
  // Günlük görevler (mock): insan oyuncunun yarış özeti
  const insan = g.oyuncular.find(o => !o.bot)
  if (insan) {
    const sira = ranking.find(p => p.userId === insan.id)?.rank ?? 99
    let matematik = 0
    g.sorular.forEach((q, i) => {
      if (q.ders.startsWith('Matematik') && insan.cevaplar.get(i)?.secenek) matematik++
    })
    const ozet: MockOyunOzeti = {
      matematik,
      dogru: insan.correctCount,
      toplam: g.info.totalQuestions,
      kazandi: xpUygula && sira === 1,
      oyuncu: g.oyuncular.length,
      herkeseAcik: g.info.isPublic,
    }
    mockOlay(MOCK_OYUN_BITTI, ozet)
  }
  yayinla(g)
  liderlikYayinla()
}

// ---------------------------------------------------------------------
// Genel liderlik
// ---------------------------------------------------------------------
const lbDinleyiciler = new Set<(r: GlobalRow[]) => void>()
const sahteLider: Bot[] = [
  { id: kimlik(), ad: 'Elif', avatarKey: 'avatar-7', xp: 1180, wins: 41, gamesPlayed: 88 },
  { id: kimlik(), ad: 'Kerem', avatarKey: 'avatar-12', xp: 905, wins: 30, gamesPlayed: 71 },
  { id: kimlik(), ad: 'Zeynep', avatarKey: 'avatar-3', xp: 640, wins: 19, gamesPlayed: 52 },
  { id: kimlik(), ad: 'Mert', avatarKey: 'avatar-18', xp: 415, wins: 11, gamesPlayed: 34 },
  { id: kimlik(), ad: 'Defne', avatarKey: 'avatar-21', xp: 180, wins: 4, gamesPlayed: 15 },
]
function satir(id: string, ad: string, avatarKey: string | null, photoUrl: string | null, s: Stat): GlobalRow {
  const { simdiki } = kademe(s.xp)
  return { userId: id, displayName: ad, avatarKey, photoUrl, xp: s.xp, rankKey: simdiki.key, rankLabel: simdiki.label, wins: s.wins, gamesPlayed: s.gamesPlayed }
}
function liderlik(): GlobalRow[] {
  const satirlar = sahteLider.map(b => satir(b.id, b.ad, b.avatarKey, null, b))
  const p = benimProfil()
  const s = benimStat()
  if (p && s.gamesPlayed > 0) satirlar.push(satir(p.id, p.displayName, p.avatarKey, p.photoUrl, s))
  return satirlar.sort((a, b) => b.xp - a.xp || b.wins - a.wins).slice(0, 20)
}
function liderlikYayinla() {
  const r = liderlik()
  lbDinleyiciler.forEach(cb => cb(r))
}

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
export const api: QuizoraApi = {
  async ensureSession() {
    return benimId()
  },

  async getServerOffsetMs() {
    return 0
  },

  async getProfile() {
    await ag()
    const p = benimProfil()
    return p ? { ...p } : null
  },

  async saveProfile({ displayName, avatarKey, photoFile }) {
    await ag()
    const ad = displayName.trim()
    if (ad.length < 2 || ad.length > 20) throw new Error('Ad 2–20 karakter olmalı')
    let photoUrl = benimProfil()?.photoUrl ?? null
    if (photoFile) {
      if (photoFile.size > 5 * 1024 * 1024) throw new Error('Fotoğraf çok büyük (en fazla 5 MB)')
      photoUrl = await fotoKucult(photoFile)
    }
    const p: Profile = { id: benimId(), displayName: ad, avatarKey, photoUrl }
    profilBellek = p
    yaz(K_PROFIL, p)
    return { ...p }
  },

  async createGame(kategori) {
    await ag()
    const p = benimProfil()
    if (!p) throw new Error('Önce profilini oluştur')
    const g = yeniOyun(kategori, p.id)
    oyuncuEkle(g, { id: p.id, bot: false, ad: p.displayName, avatarKey: p.avatarKey, photoUrl: p.photoUrl })
    zamanla(g, 1500, () => botEkle(g))
    zamanla(g, 3000, () => botEkle(g))
    return { gameId: g.info.id, code: g.info.code }
  },

  async joinGame(kod) {
    await ag()
    const p = benimProfil()
    if (!p) throw new Error('Önce profilini oluştur')
    const temiz = kodNormalle(kod)
    if (!/^QZ-[A-Z0-9]{4}$/.test(temiz)) throw new Error('Oyun kodu geçersiz')
    const varOlan = kodlar.get(temiz)
    if (varOlan) {
      const g = oyunBul(varOlan)
      if (g.oyuncular.some(o => o.id === p.id)) return { gameId: g.info.id }
      if (g.info.status !== 'lobby') throw new Error('Bu yarış çoktan başladı')
      if (g.oyuncular.length >= LOBI_SINIRI) throw new Error('Lobi dolu (en fazla 5 kişi)')
      if (g.info.isPublic && g.info.autoStartAt && Date.parse(g.info.autoStartAt) <= Date.now()) throw new Error('Oyun başlamak üzere')
      oyuncuEkle(g, { id: p.id, bot: false, ad: p.displayName, avatarKey: p.avatarKey, photoUrl: p.photoUrl })
      otoBaslatGuncelle(g)
      yayinla(g)
      return { gameId: g.info.id }
    }
    // Bilinmeyen kod: botun kurduğu sahte bir lobi; bot 5 sn sonra başlatır.
    const host = botUret(new Set())
    const g = yeniOyun(sec<Kategori>(['sayisal', 'esit_agirlik', 'sozel', 'tyt', 'lgs_sozel', 'lgs_sayisal']), host.id, temiz)
    oyuncuEkle(g, { id: host.id, bot: true, ad: host.ad, avatarKey: host.avatarKey, photoUrl: null })
    oyuncuEkle(g, { id: p.id, bot: false, ad: p.displayName, avatarKey: p.avatarKey, photoUrl: p.photoUrl })
    zamanla(g, 2000, () => botEkle(g))
    zamanla(g, 5000, () => {
      if (g.info.status === 'lobby') baslat(g)
    })
    return { gameId: g.info.id }
  },

  async getGameByCode(kod) {
    await ag()
    const id = kodlar.get(kodNormalle(kod))
    if (!id) throw new Error('Oyun bulunamadı')
    return anlik(oyunBul(id))
  },

  async startGame(gameId) {
    await ag()
    const g = oyunBul(gameId)
    if (g.info.hostId !== benimId()) throw new Error('Yarışı yalnızca lobiyi kuran başlatabilir')
    if (g.info.status !== 'lobby') throw new Error('Yarış zaten başladı')
    if (g.oyuncular.length < 2) throw new Error('Başlamak için en az 2 oyuncu gerekli')
    baslat(g)
  },

  /**
   * Hemen Katıl: mock her zaman yeni herkese açık lobi açar (aynı kategoride hâlâ beklediğin
   * lobin varsa onu döndürür, created=false). 2 sn sonra bir bot girer → autoStartAt = +10 sn;
   * ardından 1-2 bot daha 3-6 sn arayla katılabilir.
   */
  async quickJoin(kategori) {
    await ag()
    const p = benimProfil()
    if (!p) throw new Error('Önce profil oluştur')
    for (const g of oyunlar.values()) {
      if (g.info.isPublic && g.info.status === 'lobby' && g.info.kategori === kategori && g.oyuncular.some(o => o.id === p.id)) {
        return { gameId: g.info.id, code: g.info.code, created: false }
      }
    }
    const g = yeniOyun(kategori, p.id)
    g.info.isPublic = true
    oyuncuEkle(g, { id: p.id, bot: false, ad: p.displayName, avatarKey: p.avatarKey, photoUrl: p.photoUrl })
    let t = 2000
    zamanla(g, t, () => botEkle(g))
    const ekBot = Math.random() < 0.5 ? 1 : 2
    for (let i = 0; i < ekBot; i++) {
      t += rastgele(3000, 6000)
      zamanla(g, t, () => botEkle(g))
    }
    return { gameId: g.info.id, code: g.info.code, created: true }
  },

  /** autoStartAt geçmişse ve en az 2 oyuncu varsa başlatır; aksi hâlde sessizce hiçbir şey yapmaz. */
  async startIfReady(gameId) {
    await ag()
    const g = oyunBul(gameId)
    benOyuncuyum(g)
    if (
      g.info.status === 'lobby' &&
      g.info.isPublic &&
      g.info.autoStartAt !== null &&
      Date.parse(g.info.autoStartAt) <= Date.now() &&
      g.oyuncular.length >= 2
    ) {
      baslat(g)
    }
  },

  /** Lobiden çık. Başlamış oyunda 'Oyun başladı'. İnsan kalmazsa oyun silinir; host ayrılırsa devredilir. */
  async leaveGame(gameId) {
    await ag()
    const g = oyunlar.get(gameId)
    if (!g) return
    const benim = benimId()
    if (!g.oyuncular.some(o => o.id === benim)) throw new Error('Bu oyuna erişimin yok')
    if (g.info.status !== 'lobby') throw new Error('Oyun başladı')
    g.oyuncular = g.oyuncular.filter(o => o.id !== benim)
    // Mock'ta botlar tek başına oynamaz: insan oyuncu kalmadıysa lobiyi kapat
    if (!g.oyuncular.some(o => !o.bot)) {
      oyunuSil(g)
      return
    }
    if (g.info.hostId === benim) g.info.hostId = g.oyuncular[0].id
    otoBaslatGuncelle(g)
    yayinla(g)
  },

  async getQuestion(gameId, position) {
    await ag()
    const g = oyunBul(gameId)
    const ben = benOyuncuyum(g)
    const simdi = Date.now()
    if (g.info.status === 'finished') throw new Error('Oyun bitti')
    if (g.info.status !== 'playing' || !g.info.startedAt || simdi < new Date(g.info.startedAt).getTime()) throw new Error('Oyun başlamadı')
    if (remainingMs(g.info, simdi) <= 0) throw new Error('Süre doldu')
    if (position < 0 || position >= g.info.totalQuestions || position !== ben.currentQ) throw new Error('Sıra dışı soru')
    if (ben.qStartedAt === null) ben.qStartedAt = simdi // tekrar istekte sıfırlanmaz
    const s = g.sorular[position]
    const q: Question = { position, ders: s.ders, text: s.text, imageUrl: null, options: { ...s.options } }
    return q
  },

  async submitAnswer(gameId, position, secenek) {
    await ag()
    const g = oyunBul(gameId)
    const ben = benOyuncuyum(g)
    const simdi = Date.now()
    if (g.info.status === 'finished') throw new Error('Oyun bitti')
    if (g.info.status !== 'playing') throw new Error('Oyun başlamadı')
    // LGS 4 şıklıdır (A–D); YKS 5 şıklı (A–E).
    const gecerli: Secenek[] = g.info.sinav === 'lgs' ? ['A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D', 'E']
    if (secenek !== null && !gecerli.includes(secenek)) throw new Error('Geçersiz şık')
    if (ben.cevaplar.has(position)) throw new Error('Bu soru zaten cevaplandı')
    if (position !== ben.currentQ) throw new Error('Sıra dışı soru')
    if (remainingMs(g.info, simdi) <= 0) throw new Error('Süre doldu')
    if (ben.qStartedAt === null) throw new Error('Soru henüz açılmadı')
    const soru = g.sorular[position]
    const { cevap, hizlandi } = cevapKaydet(g, ben, secenek, simdi - ben.qStartedAt)
    const sonuc: AnswerResult = {
      correct: cevap.dogru === true,
      points: cevap.puan,
      correctOption: soru.dogru,
      newScore: ben.score,
      finished: ben.finished,
      speedupTriggered: hizlandi,
    }
    yayinla(g)
    bitisKontrol(g)
    return sonuc
  },

  async finishGame(gameId) {
    await ag()
    const g = oyunBul(gameId)
    const ben = benOyuncuyum(g)
    if (g.info.status !== 'finished') {
      if (g.info.status === 'lobby') throw new Error('Yarış henüz bitmedi')
      if (remainingMs(g.info, Date.now()) > 0 && g.oyuncular.some(o => !o.finished)) throw new Error('Yarış henüz bitmedi')
      sonlandir(g)
    }
    const { ranking, xp } = g.sonuc!
    let toplamDogru = 0
    for (const c of ben.cevaplar.values()) if (c.dogru) toplamDogru += c.puan
    const result: GameResult = {
      winnerId: ranking[0].userId,
      ranking: ranking.map(r => ({ ...r })),
      breakdown: {
        base: 100 * ben.correctCount,
        bonus: toplamDogru - 100 * ben.correctCount,
        penalty: 25 * ben.wrongCount,
        correct: ben.correctCount,
        wrong: ben.wrongCount,
        blank: Math.max(0, g.info.totalQuestions - ben.correctCount - ben.wrongCount),
      },
      xpBreakdown: { ...(xp.get(ben.id) ?? { participation: 0, points: 0, placement: 0, firstFinisher: 0, total: 0 }) },
    }
    return result
  },

  async getGlobalLeaderboard() {
    await ag()
    return liderlik()
  },

  /** Yarış sonrası soru incelemesi (yalnızca çağıran oyuncunun cevapları). Bitmeden: 'Yarış henüz bitmedi'. */
  async getGameReview(gameId): Promise<GameReview> {
    await ag()
    const g = oyunBul(gameId)
    const ben = benOyuncuyum(g)
    if (g.info.status !== 'finished') throw new Error('Yarış henüz bitmedi')
    const items: ReviewItem[] = g.sorular.map((s, i) => {
      const c = ben.cevaplar.get(i)
      const outcome: ReviewOutcome = !c || c.secenek === null ? 'blank' : c.dogru ? 'correct' : 'wrong'
      return {
        position: i,
        ders: s.ders,
        topic: s.topic,
        text: s.text,
        imageUrl: null,
        options: { ...s.options }, // LGS'de yalnızca A-D
        selected: outcome === 'blank' ? null : (c?.secenek ?? null),
        correctOption: s.dogru,
        outcome,
        points: c?.puan ?? 0,
        timeMs: outcome === 'blank' || !c ? null : Math.round(c.sureMs),
        // Son sorunun açıklaması bilerek boş: gerçek veride çoğu açıklama henüz yüklenmedi
        explanation: i === g.sorular.length - 1 ? null : s.aciklama,
      }
    })
    return { items, addedToNotebook: defterOyun.get(g.info.id) ?? 0 }
  },

  async getMistakeSummary(): Promise<MistakeSummary> {
    await ag()
    const sayac = new Map<string, { exam: Sinav; subject: string; count: number }>()
    const acik = defterAcik()
    for (const { item } of acik) {
      const a = `${item.exam}|${item.subject}`
      const s = sayac.get(a) ?? { exam: item.exam, subject: item.subject, count: 0 }
      s.count++
      sayac.set(a, s)
    }
    return {
      total: acik.length,
      resolvedTotal: defter.size - acik.length,
      bySubject: [...sayac.values()].sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject, 'tr')),
    }
  },

  async getMistakes(opts = {}): Promise<MistakeItem[]> {
    await ag()
    if (opts.exam && opts.exam !== 'yks' && opts.exam !== 'lgs') throw new Error('Geçersiz sınav')
    let l = defterAcik().map(k => k.item)
    if (opts.exam) l = l.filter(m => m.exam === opts.exam)
    if (opts.subject) l = l.filter(m => m.subject === opts.subject)
    l.sort((a, b) => Date.parse(b.lastWrongAt) - Date.parse(a.lastWrongAt))
    if (opts.limit) l = l.slice(0, opts.limit)
    return l.map(m => ({ ...m, options: { ...m.options } })) // doğru şık ve açıklama YOK
  },

  async practiceAnswer(questionId, selected): Promise<PracticeResult> {
    await ag()
    const k = defter.get(questionId)
    if (!k || k.cozuldu) throw new Error('Bu soru defterinde yok')
    if (!k.item.options[selected]) throw new Error('Geçersiz şık')
    const isCorrect = selected === k.dogru
    if (isCorrect) {
      k.cozuldu = true
      mockOlay(MOCK_DEFTER_COZULDU)
    }
    else {
      k.item.wrongCount++
      k.item.lastAnswer = selected
      k.item.lastWrongAt = new Date().toISOString()
    }
    return { isCorrect, correctOption: k.dogru, explanation: k.aciklama, resolved: isCorrect }
  },

  async getPerformance(opts = {}): Promise<PerformanceStats> {
    await ag()
    if (opts.exam && opts.exam !== 'yks' && opts.exam !== 'lgs') throw new Error('Geçersiz sınav')
    const days = Math.min(365, Math.max(1, Math.round(opts.days ?? 30)))
    return performansHesapla(opts.exam ? [opts.exam] : ['yks', 'lgs'], days)
  },

  async removeMistake(questionId) {
    await ag()
    const k = defter.get(questionId)
    if (!k || k.cozuldu) throw new Error('Bu soru defterinde yok')
    k.cozuldu = true
  },

  async getMyStats() {
    await ag()
    const s = benimStat()
    return istatistik(s.xp, s.wins, s.gamesPlayed)
  },

  subscribeGame(gameId, cb): Unsubscribe {
    const g = oyunlar.get(gameId)
    if (!g) return () => {}
    g.dinleyiciler.add(cb)
    const s = anlik(g)
    queueMicrotask(() => {
      if (g.dinleyiciler.has(cb)) cb(s)
    })
    return () => {
      g.dinleyiciler.delete(cb)
    }
  },

  subscribeGlobalLeaderboard(cb): Unsubscribe {
    lbDinleyiciler.add(cb)
    const r = liderlik()
    queueMicrotask(() => {
      if (lbDinleyiciler.has(cb)) cb(r)
    })
    return () => {
      lbDinleyiciler.delete(cb)
    }
  },
}

function baslat(g: IcOyun) {
  g.info.status = 'playing'
  g.info.startedAt = new Date(Date.now() + 3000).toISOString() // 3-2-1 geri sayım
  yayinla(g)
  for (const o of g.oyuncular) if (o.bot) zamanla(g, 3000, () => botCevaplat(g, o))
  g.saat = window.setInterval(() => bitisKontrol(g), 250)
}
