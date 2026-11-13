# Yayın rehberi (Vercel)

Uygulama statik bir Vite/React sitesidir; Vercel `main` dalını otomatik yayınlar. Backend (Supabase) zaten ayrı çalışır.

## 0. Yayından önce (bir kez)
1. Testler geçmeli: `npx tsx scripts/hepsi.ts` → **HEPSİ GEÇTİ**.
2. Gerçek soruları yükle ve hazır olduklarını doğrula (`docs/SORU-EKLEME.md`): `npx tsx scripts/soru-durumu.ts` → "Gerçek sorularla hazır kategoriler".
3. Test sorularını sil (gerçek sorular yeterliyse): `npx tsx scripts/seed-test-questions.ts --temizle`.
4. Demo için lobiyi 2 kişiye ayarla: Supabase → SQL Editor:
   ```sql
   update app_settings set value = '2' where key = 'min_players';
   ```
5. Supabase → Authentication → Providers → **Anonymous Sign-Ins** açık olmalı (uygulama anonim oturum açar).
6. **Anonim giriş hız sınırını yükselt** (etkinlik öncesi, önemli): Supabase → Authentication → **Rate Limits** (Configuration altında) → anonim kullanıcılar için "saatte IP başına giriş" sınırı varsayılan olarak **30**'dur. Etkinlikte oyuncular aynı Wi-Fi'den (tek IP) bağlanırsa saatte 30'dan fazla yeni oyuncu giremez ve "Çok fazla deneme yapıldı" hatası alır. Katılımcı sayısının rahatça üzerinde bir değere çıkar (ör. 500). Aynı sınır test paketini de (`scripts/hepsi.ts`, ~30+ anonim kullanıcı oluşturur) bir saatte tek seferde çalıştırmayı engeller.

## 1. Vercel'e GitHub reposunu bağla
1. https://vercel.com → **Add New… → Project**.
2. GitHub hesabını bağla, `quizora` reposunu seç → **Import**.
3. Ayarlar (Vercel Vite'i genelde otomatik algılar, kontrol et):
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
   - **Production Branch:** `main`
4. **Environment Variables** bölümüne ekle (Production, Preview ve Development için işaretle):

   | Ad | Değer |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Aynı sayfadaki **anon / public** anahtar |
   | `VITE_USE_MOCK` | `false` |

   > **`SUPABASE_SERVICE_ROLE_KEY` Vercel'e ASLA eklenmez** (ne de `VITE_` önekiyle yazılır). `VITE_` ile başlayan her değişken tarayıcıya gömülür; service role anahtarı tüm güvenliği atlar. Yalnızca yerel `.env.local` içinde, scriptler için durur.
5. **Deploy**'a bas. İlk yayın birkaç dakika sürer; sonunda `https://quizora-….vercel.app` adresi verilir.

## 2. `vercel.json` (B'nin dosyası)
Repo kökünde bu dosya olmalı. Sayfa yenilemede ve `/join/KOD` adresinde 404 vermemesi için tüm yolları `index.html`'e yönlendirir:
```json
{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}
```
Bu dosya Kişi B'nindir (`frontend` dalında eklenir); içeriği `docs/ISTEK-A-to-B.md`'ye yazılmıştır.

## 3. Otomatik yayın
- `main` dalına **her merge'de** Vercel otomatik yayın yapar (Pull Request birleşince).
- Diğer dallar ve Pull Request'ler için **Preview** adresi üretilir (test için kullanışlı).
- Ortam değişkenini sonradan değiştirirsen yayın yenilenmelidir: Vercel → Deployments → son yayın → **Redeploy**.

## 4. `/join/KOD` yolu
QR kod `https://<site>/join/QZ-AB12` adresine gider. Bu yol sunucuda gerçek bir dosya değildir; yukarıdaki SPA rewrite sayesinde `index.html` açılır, React Router `/join/:code` sayfasını gösterir. `vercel.json` yoksa bu adres **404** verir; yayından sonra bir `/join/QZ-TEST` adresini doğrudan tarayıcıya yazarak dene.

## 5. iPhone'da "Ana ekrana ekle"
1. iPhone'da **Safari** ile siteyi aç (Chrome'da bu seçenek farklıdır).
2. Alttaki **Paylaş** düğmesine (kare + yukarı ok) bas.
3. Listede aşağı kaydır → **Ana Ekrana Ekle** → **Ekle**.
4. Uygulama simgesi ana ekranda görünür, tam ekran açılır (adres çubuğu olmadan).

## 6. Yayın sonrası kontrol listesi
İki telefonla (veya telefon + bilgisayar), **yayındaki adreste** dene:
- [ ] Site açılıyor, profil oluşturma çalışıyor (isim + avatar; fotoğraf yükleme).
- [ ] Menüde sınav türü (YKS/LGS) ve kategori seçimi, rank rozeti ve ilerleme çubuğu görünüyor.
- [ ] Telefon 1 lobi kuruyor; QR kodu telefon 2'nin kamerasıyla okununca `/join/KOD` açılıp lobiye giriyor.
- [ ] Lobide iki oyuncu görünüyor; host "Başlat"a basınca iki telefonda 3-2-1 geri sayım aynı anda başlıyor.
- [ ] Sorular aynı sırada geliyor; cevap animasyonu ve puan doğru; canlı sıralama güncelleniyor.
- [ ] Birisi 10 soruyu bitirince diğer telefonda "X bitirdi, süre 2× hızlı akıyor" bildirimi ve **2× mod efektleri** çıkıyor; sayaç hızlanıyor.
- [ ] Sonuç ekranı: kazanan, sıralama, doğru/yanlış/boş dökümü, XP dökümü ve XP çubuğu animasyonu.
- [ ] **Rank atlama:** demoda önce `npx tsx scripts/xp-ayarla.ts "<oyuncu adı>" 95` ile oyuncuyu Bronz I eşiğinin altına al; yarış sonunda rank atlama animasyonu görünüyor.
- [ ] Ana menüye dönünce rank/XP güncel; **genel liderlik** XP'ye göre sıralı ve rank rozetli.
- [ ] Oyun sırasında sayfayı yenileyince kaldığı sorudan devam ediyor.
- [ ] Hata durumu: yanlış kodla katılmak "Kod bulunamadı" gösteriyor.

## 7. Sorun giderme
| Belirti | Olası neden / çözüm |
|---|---|
| Sayfa açılıyor ama "Supabase ayarı eksik" | Vercel ortam değişkenleri eksik/yanlış → düzelt, **Redeploy** |
| `/join/KOD` 404 | `vercel.json` yok veya kökte değil |
| "Oturum açılamadı" / oturum hatası | Supabase'de Anonymous Sign-Ins kapalı |
| "Çok fazla deneme yapıldı, biraz bekleyip tekrar dene" (özellikle çok kişi aynı Wi-Fi'de) | Anonim giriş hız sınırı doldu → bölüm 0, adım 6; sınırı yükselt, en çok 1 saat içinde kendiliğinden açılır |
| Lobide "En az 2 oyuncu gerekli" yerine tek kişiyle başlıyor | `min_players` 1 → SQL ile 2 yap (bölüm 0, adım 4) |
| "Bu kategori için yeterli soru yok: …" | O tabloda soru yok → `soru-durumu.ts`, `import-questions.ts` |
| Değişiklik yayında görünmüyor | `main`'e merge edildi mi? Vercel → Deployments'ta son yayın başarılı mı? |
