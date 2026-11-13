# Git Rehberi (yeni başlayanlar için)

## 1. Genel kural
13 Kasım 11:00'e kadar Git kullanılmaz. Sonrasında elle git komutu yazmıyoruz; Claude Code'a şunları söylüyoruz:
- "Değişikliklerimi küçük commitlere böl ve dalımı push et"
- "main'deki yenilikleri dalıma al; çakışma çıkarsa dur ve bana göster"
- "Şu an hangi daldayım, ne değişti, açıkla"
- "Hiçbir şeyi silme veya geri alma; önce ne olduğunu açıkla"

## 2. Pull Request (PR) nasıl açılır ve birleştirilir
1. GitHub'da repoyu aç; "Compare & pull request" butonuna bas (ya da Pull requests → New pull request).
2. compare: kendi dalın (backend/frontend) → base: main olsun.
3. "Create pull request" → sonra "Merge pull request" → "Confirm merge".
4. "Delete branch" butonuna BASMA.
5. Sonra Claude Code'a: "main'deki yenilikleri dalıma al" de. Önce A birleştirir, sonra B.

## 3. Yapılmayacaklar
- main'e doğrudan commit atma.
- Force push (`git push --force`) yapma.
- Kendi listende olmayan dosyayı değiştirme (gerekirse ISTEK dosyasına yaz).
- Başkasının dalına commit atma.

## 4. Hook hata verirse
Dosyayı silme, geri alma. Hata mesajını olduğu gibi Claude Code'a göster; ne yapılacağını o açıklar.

## 5. Birleştirme saatleri
12:15, 17:00, 23:00, 04:00, 08:00
