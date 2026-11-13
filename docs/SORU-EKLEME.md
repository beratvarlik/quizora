# Soru ekleme

Sorular bir E-Tablo'da hazırlanır, CSV olarak indirilir ve tek komutla veritabanına yüklenir.

## 1. E-Tablo sütunları
İlk satır başlık olmalı, sütun adları aynen şöyle yazılmalı:

| Sütun | Zorunlu | Açıklama |
|---|---|---|
| `tablo` | evet | Sorunun gideceği tablo (aşağıdaki 24 adetten biri) |
| `soru_metni` | evet | Soru metni |
| `secenek_a` … `secenek_d` | evet | Dört şık dolu olmalı |
| `secenek_e` | YKS: evet, LGS: hayır | **YKS sorularında 5 şık (A-E) zorunludur. LGS soruları 4 şıklıdır (A-D): LGS tablolarında `secenek_e` boş bırakılır.** |
| `dogru_sik` | evet | YKS: `A`-`E`; **LGS: yalnızca `A`-`D`** (küçük harf ve boşluk sorun değil) |
| `topic` | evet | **Dersin alt konusu** (1-60 karakter; kısa ve tutarlı isim, örn. `Türev`, `Paragraf`, `Friendship`). Akıllı analizde "hangi konuda zayıfım" bu alanla hesaplanır. Aşağıdaki konu listesindeki adı AYNEN kullan; yeni konu gerekiyorsa listeye ekle |
| `gorsel_dosya` | hayır | Görselli soruda görselin dosya adı (örn. `sekil-1.png`) |
| `aciklama` | hayır | **Dahili not** (örn. "KONTROL: şık C doğrulandı"); öğrenciye HİÇ gösterilmez |
| `cozum_aciklamasi` | hayır | **Öğrenciye gösterilen çözüm** (1-2 cümle, en çok 400 karakter); yarış bittikten sonra sonuç ekranında görünür. Boşsa "açıklama henüz eklenmedi" gösterilir |

Hazır şablon: `scripts/soru-sablonu.csv`. **Şablondaki `[ÖRNEK]` satırlarını silmeden gerçek yükleme yapma.**

## 2. Tablo adları (24 adet, tam liste)
**YKS – TYT:** `matematik_tyt`, `turkce_tyt`, `kimya_tyt`, `fizik_tyt`, `biyoloji_tyt`, `tarih_tyt`, `cografya_tyt`, `felsefe_tyt`, `din_kulturu_tyt`

**YKS – AYT:** `fizik_ayt`, `kimya_ayt`, `biyoloji_ayt`, `matematik_ayt`, `edebiyat_ayt`, `tarih_ayt`, `cografya_ayt`, `felsefe_ayt`, `din_kulturu_ayt`

**LGS:** `turkce_lgs`, `inkilap_lgs`, `din_kulturu_lgs`, `ingilizce_lgs`, `matematik_lgs`, `fen_lgs`

Tablo adları küçük harfle ve Türkçe karakter OLMADAN yazılır (`cografya`, `kulturu`).

## 2b. Çözüm açıklaması: `cozum_aciklamasi` ve `aciklama` farkı
- `aciklama`: dahili nottur, kimseye gösterilmez.
- `cozum_aciklamasi`: yarış bittikten sonra, sonuç ekranındaki soru şeridinde öğrenciye gösterilir. Doğru şıkkı ele verdiği için yarış bitmeden hiçbir yoldan istemciye gitmez.

Sorular zaten yüklüyse açıklamaları ayrı bir CSV ile ekleyebilirsin (`scripts/aciklama-yukle.ts`). Sütunlar: `tablo, soru_metni, cozum_aciklamasi`. Eşleştirme aynı tabloda `soru_metni` ile yapılır (fazla boşluk ve satır sonları yok sayılır; metin birebir aynı olmalı).
```
tablo,soru_metni,cozum_aciklamasi
matematik_ayt,2x + 6 = 14 denkleminin çözümü kaçtır?,2x = 8 olduğundan x = 4 bulunur.
fen_lgs,Hangisi bir element sembolüdür?,"Demirin sembolü Fe'dir; H2O su, CO2 karbondioksit, NaCl tuzdur."
```
```
# Önce dene (hiçbir şey yazmaz): tablo bazında güncellenen / eşleşmeyen / 400+ karakter / boş
npx tsx scripts/aciklama-yukle.ts aciklamalar.csv --dry-run

# Gerçek yükleme (aynı dosyayı tekrar çalıştırmak güvenlidir)
npx tsx scripts/aciklama-yukle.ts aciklamalar.csv
```
Eşleşmeyen, boş ya da 400 karakteri aşan satırlar satır numarasıyla Türkçe olarak raporlanır ve diğerlerini durdurmaz. Hangi tabloda kaç sorunun açıklaması eksik: `npx tsx scripts/soru-durumu.ts` ("AÇIKLAMASI EKSİK" sütunu, [TEST] hariç). Yeni soru yüklerken de aynı CSV'ye `cozum_aciklamasi` sütunu ekleyebilirsin (`import-questions.ts` kabul eder; şablonda var).

## 2c. Konu (`topic`) kuralları ve mevcut konu listesi
- Her soru bir konu taşır. Yeni soru yüklerken `topic` sütunu **zorunludur** (boşsa satır reddedilir). Konu adı kısa, tek biçimli ve **ders içinde** tutarlı olmalı: "Türev" her yerde "Türev" (ne "türev", ne "Türev Konusu", ne "Türevler"). Büyük/küçük harf ve yazım farkı ayrı konu sayılır.
- LGS İngilizce'de konu = müfredat ünite adı (Friendship, Teen Life, In The Kitchen, On The Phone, The Internet, Adventures, Tourism, Chores, Science, Natural Forces). LGS Fen ve İnkılap'ta da ünite adları kullanılır.
- Mevcut sorulara konu eklemek için: `npx tsx scripts/konu-yukle.ts konular.csv --dry-run`, sonra aynı komut `--dry-run`'sız. Sütunlar: `tablo`, `id` (ya da `soru_metni`), `topic`. Hazır dosya: `scripts/konu-atamalari.csv` (ilk 94 gerçek soru). `konu-yukle.ts` ayrıca [TEST] sorularının boş konusunu 'Test Konusu 1' yapar.
- Hangi sorularda konu eksik: `npx tsx scripts/soru-durumu.ts` ("KONUSU EKSİK" sütunu).

Şu an kullanılan konular (yeni soru eklerken önce buradan seç):

| Tablo | Konular |
|---|---|
| `matematik_tyt` | Denklemler, Problemler, Temel Kavramlar |
| `turkce_tyt` | Cümlede Anlam, Sözcükte Anlam |
| `kimya_tyt` | Bileşikler, Kimya Bilimi |
| `fizik_tyt` | Elektrik Devreleri, Madde ve Özellikleri |
| `biyoloji_tyt` | Hücre, Ekosistem |
| `tarih_tyt` | İlk Çağ Uygarlıkları, Tarih Bilimi |
| `cografya_tyt` | Harita Bilgisi |
| `felsefe_tyt` | Varlık Felsefesi, Ahlak Felsefesi |
| `din_kulturu_tyt` | Bilgi ve İnanç, Allah-İnsan İlişkisi |
| `fizik_ayt` | Newton'un Hareket Yasaları, Modern Fizik, Işık ve Optik |
| `kimya_ayt` | Kimyasal Tepkimelerde Enerji, Modern Atom Teorisi, Kimyasal Hesaplamalar, Periyodik Sistem |
| `biyoloji_ayt` | Kan Grupları, Bağışıklık, Ekoloji, Boşaltım Sistemi |
| `matematik_ayt` | Özdeşlikler, Fonksiyonlar, Logaritma, Trigonometri |
| `edebiyat_ayt` | Tanzimat Edebiyatı, Divan Edebiyatı, Halk Edebiyatı, İslamiyet Öncesi Türk Edebiyatı, Anlam Bilgisi, Paragraf |
| `tarih_ayt` | İlk Türk Devletleri, Orta Çağ'da Dünya |
| `cografya_ayt` | Çevre ve Toplum, Ekonomik Faaliyetler |
| `felsefe_ayt` | Felsefeye Giriş, Psikoloji |
| `din_kulturu_ayt` | Din ve Özgürlük, Allah-İnsan İlişkisi |
| `turkce_lgs` | Cümlede Anlam, Sözcükte Anlam, Fiilde Çatı, Fiilimsiler, Cümlenin Ögeleri, Cümle Türleri |
| `inkilap_lgs` | Bir Kahraman Doğuyor, Milli Uyanış, Atatürkçülük ve Çağdaşlaşan Türkiye |
| `din_kulturu_lgs` | Zekât ve Sadaka, Kader İnancı |
| `ingilizce_lgs` | Friendship, The Internet |
| `matematik_lgs` | Çarpanlar ve Katlar, Üslü İfadeler, Kareköklü İfadeler, Rasyonel Sayılar, Denklemler |
| `fen_lgs` | Mevsimler ve İklim, DNA ve Genetik Kod, Basınç, Basit Makineler, Periyodik Sistem |

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
| `secenek_c boş` / `secenek_e boş` | Şıklardan biri boş bırakılmış (YKS tablosunda `secenek_e` de zorunlu; LGS tablosunda yalnızca A-D zorunlu) |
| `dogru_sik A-E olmalı` | Doğru şık harfi yazılmamış ya da A-E dışında (`F`, `1`, boş) |
| `dogru_sik A-D (LGS soruları 4 şıklıdır) olmalı` | LGS tablosuna doğru şık olarak `E` yazılmış; LGS sorularında E şıkkı yoktur |
| `topic boş (dersin alt konusu zorunludur)` / `topic en çok 60 karakter olmalı` | `topic` sütunu boş ya da çok uzun; konu listesinden (bölüm 2c) bir ad yaz |
| `cozum_aciklamasi en çok 400 karakter olmalı` | Çözüm açıklaması çok uzun; 1-2 cümleye kısalt |
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
