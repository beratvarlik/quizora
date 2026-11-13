# Soru ekleme

Sorular bir E-Tablo'da hazırlanır, CSV olarak indirilir ve tek komutla veritabanına yüklenir.

## 1. E-Tablo sütunları
İlk satır başlık olmalı, sütun adları aynen şöyle yazılmalı:

| Sütun | Zorunlu | Açıklama |
|---|---|---|
| `tablo` | evet | Sorunun gideceği tablo (aşağıdaki 24 adetten biri) |
| `soru_metni` | evet | Soru metni |
| `secenek_a` … `secenek_e` | evet | Beş şıkkın beşi de dolu olmalı |
| `dogru_sik` | evet | `A`, `B`, `C`, `D` veya `E` (küçük harf ve boşluk sorun değil) |
| `gorsel_dosya` | hayır | Görselli soruda görselin dosya adı (örn. `sekil-1.png`) |
| `aciklama` | hayır | Çözüm açıklaması (oyunda gösterilmez) |

Hazır şablon: `scripts/soru-sablonu.csv`. **Şablondaki `[ÖRNEK]` satırlarını silmeden gerçek yükleme yapma.**

## 2. Tablo adları (24 adet, tam liste)
**YKS – TYT:** `matematik_tyt`, `turkce_tyt`, `kimya_tyt`, `fizik_tyt`, `biyoloji_tyt`, `tarih_tyt`, `cografya_tyt`, `felsefe_tyt`, `din_kulturu_tyt`

**YKS – AYT:** `fizik_ayt`, `kimya_ayt`, `biyoloji_ayt`, `matematik_ayt`, `edebiyat_ayt`, `tarih_ayt`, `cografya_ayt`, `felsefe_ayt`, `din_kulturu_ayt`

**LGS:** `turkce_lgs`, `inkilap_lgs`, `din_kulturu_lgs`, `ingilizce_lgs`, `matematik_lgs`, `fen_lgs`

Tablo adları küçük harfle ve Türkçe karakter OLMADAN yazılır (`cografya`, `kulturu`).

## 3. CSV'ye çevirme
- **Google E-Tablolar:** Dosya → İndir → Virgülle ayrılmış değerler (.csv)
- **Excel:** Farklı Kaydet → CSV UTF-8 (virgülle ayrılmış)

Ayırıcı (`,` veya `;`) ve Türkçe karakter kodlaması (UTF-8) otomatik algılanır; metinde virgül, tırnak veya satır sonu olabilir.

## 4. Görselli soru
1. Görselleri tek bir klasöre koy (örn. `gorseller/`).
2. CSV'de `gorsel_dosya` sütununa yalnızca dosya adını yaz (`sekil-1.png`), klasör yolunu yazma.
3. Dosya adı yalnızca **harf (a-z), rakam, nokta, tire ve alt çizgi** içermeli: boşluk ve Türkçe karakter (ş, ğ, ı …) YOK. Uzantı: png, jpg, jpeg, webp, gif veya svg.
4. Komuta klasörü ver: `--gorsel-klasor gorseller`.

Görsel `soru-gorselleri` kovasına `<tablo>/<dosya>` olarak yüklenir. Aynı tabloda aynı adlı görsel varsa üzerine yazılır.

## 5. Komutlar
```
# Önce dene: hiçbir şey yazmaz, hataları ve eklenecek sayıyı gösterir
npx tsx scripts/import-questions.ts sorular.csv --dry-run --gorsel-klasor gorseller

# Gerçek yükleme
npx tsx scripts/import-questions.ts sorular.csv --gorsel-klasor gorseller

# Hangi kategori hazır?
npx tsx scripts/soru-durumu.ts

# Test sorularını sil (gerçek sorular yeterli olunca)
npx tsx scripts/seed-test-questions.ts --temizle
```
- Hatalı satırlar diğerlerinin yüklenmesini durdurmaz; her hata satır numarasıyla yazılır. Düzeltip dosyayı tekrar çalıştırabilirsin.
- Aynı tabloda aynı `soru_metni` zaten varsa soru **atlanır** ("yinelenen"). Yani aynı dosyayı tekrar çalıştırmak güvenlidir. Var olan bir soruyu düzeltmek için Supabase → Table Editor'ü kullan.
- Test sorularını ([TEST] ile başlayanlar) gerçek sorular yeterli olmadan silme: kategori için yeterli soru kalmazsa oyun kurulamaz ("Bu kategori için yeterli soru yok").

## 6. Sık hatalar
| Hata mesajı | Neden |
|---|---|
| `tablo adı geçersiz` | Tablo adı yanlış yazılmış (büyük harf değil, Türkçe karakter yok: `cografya_ayt`, `coğrafya_ayt` değil) |
| `secenek_c boş` | Beş şıktan biri boş bırakılmış |
| `dogru_sik A-E olmalı` | Doğru şık harfi yazılmamış ya da A-E dışında (`F`, `1`, boş) |
| `gorsel_dosya klasörde yok` | Dosya adı yanlış ya da dosya klasörde değil |
| `gorsel_dosya dolu ama --gorsel-klasor verilmedi` | Komuta `--gorsel-klasor` eklenmemiş |
| `gorsel_dosya adı yalnızca harf…` | Dosya adında boşluk, Türkçe karakter ya da klasör yolu var |
| `sütun sayısı başlıktan fazla` | Metinde virgül/noktalı virgül var ama alan tırnak içinde değil (Excel/Sheets normalde otomatik tırnaklar) |
| `başlık satırında eksik sütun` | İlk satır başlık değil ya da sütun adı yanlış |

## 7. Hangi tablodan kaç soru gerekir?
Bir oyun, kategorinin dağılımına göre her tablodan rastgele soru çeker. Tabloda en az o kadar **aktif** soru olmalı; yoksa kategori için oyun kurulamaz.

| Tablo | Kullanıldığı kategoriler (oyun başına soru) | En az |
|---|---|---|
| `matematik_tyt` | tyt: 2 | 2 |
| `turkce_tyt` | tyt: 1 | 1 |
| `kimya_tyt` | tyt: 1 | 1 |
| `fizik_tyt` | tyt: 1 | 1 |
| `biyoloji_tyt` | tyt: 1 | 1 |
| `tarih_tyt` | tyt: 1 | 1 |
| `cografya_tyt` | tyt: 1 | 1 |
| `felsefe_tyt` | tyt: 1 | 1 |
| `din_kulturu_tyt` | tyt: 1 | 1 |
| `fizik_ayt` | sayisal: 2 | 2 |
| `kimya_ayt` | sayisal: 2 | 2 |
| `biyoloji_ayt` | sayisal: 2 | 2 |
| `matematik_ayt` | sayisal: 4, esit_agirlik: 2 | 4 |
| `edebiyat_ayt` | esit_agirlik: 4, sozel: 4 | 4 |
| `tarih_ayt` | esit_agirlik: 1, sozel: 2 | 2 |
| `cografya_ayt` | esit_agirlik: 1, sozel: 2 | 2 |
| `felsefe_ayt` | esit_agirlik: 1, sozel: 1 | 1 |
| `din_kulturu_ayt` | esit_agirlik: 1, sozel: 1 | 1 |
| `turkce_lgs` | lgs_sozel: 4 | 4 |
| `inkilap_lgs` | lgs_sozel: 2 | 2 |
| `din_kulturu_lgs` | lgs_sozel: 2 | 2 |
| `ingilizce_lgs` | lgs_sozel: 2 | 2 |
| `matematik_lgs` | lgs_sayisal: 5 | 5 |
| `fen_lgs` | lgs_sayisal: 5 | 5 |

## 8. Öneri: nereden başlamalı
**Önce Sayısal, TYT, LGS Sayısal ve LGS Sözel kategorilerini doldurun.** Bunlar şu tablolardır: `fizik_ayt`, `kimya_ayt`, `biyoloji_ayt`, `matematik_ayt`; dokuz TYT tablosunun hepsi; `matematik_lgs`, `fen_lgs`; `turkce_lgs`, `inkilap_lgs`, `din_kulturu_lgs`, `ingilizce_lgs`.

**Her derse 15-20 soru yeterli.** "En az" sütunundaki sayı yalnızca oyunun kurulabilmesi içindir; 15-20 soru olunca aynı oyuncular arka arkaya oynasa da sorular çok tekrar etmez. İlerleme durumunu `npx tsx scripts/soru-durumu.ts` ile takip et ("gerçek sorularla hazır kategoriler" bölümü).
