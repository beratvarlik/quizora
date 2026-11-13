# Quizora

Çok oyunculu YKS soru yarışması (İşler Teknoloji EdTech Game Jam, 13-14 Kasım 2026). Vite + React + TypeScript + Tailwind + Supabase.

## Kurulum
1. Zip'i aç.
2. Klasörde `npm install` çalıştır.
3. `.env.example` dosyasını `.env.local` olarak kopyala ve değerleri doldur (`VITE_USE_MOCK=true` ile Supabase'siz de çalışır).

## Çalıştırma
- `npm run dev` — geliştirme sunucusu
- `npm run build` — üretim derlemesi
- `npm run test` — testler (vitest)
- `npm run typecheck` — tip kontrolü

## Dal düzeni (13 Kasım 11:00'den itibaren)
- `main`: doğrudan commit yok, yalnızca Pull Request ile.
- `backend`: Kişi A.
- `frontend`: Kişi B.

## Belgeler
- Proje, kurallar ve dosya sahipliği: [docs/PROJE.md](docs/PROJE.md)
- Git kullanımı: [docs/GIT-REHBERI.md](docs/GIT-REHBERI.md)
