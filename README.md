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

## Test ve yardımcı scriptler (scripts/)
Hepsi `.env.local` okur ve `SUPABASE_SERVICE_ROLE_KEY` gerektirir (anahtar yalnızca `.env.local`'da durur, repoya girmez).
- `npx tsx scripts/seed-test-questions.ts` — 24 soru tablosuna 8'er `[TEST]` sorusu ekler (`--temizle` ile siler).
- `npx tsx scripts/check-schema.ts` — şema ve güvenlik kontrolü.
- `npx tsx scripts/rpc-smoke.ts` — RPC'lerin uçtan uca testi.
- `npx tsx scripts/api-smoke.ts` — `src/lib/api.ts` (QuizoraApi) testi.
- `npx tsx scripts/import-questions.ts <dosya.csv> [--dry-run] [--gorsel-klasor <klasör>]` — CSV'den soru yükler. Ayrıntı: [docs/SORU-EKLEME.md](docs/SORU-EKLEME.md) (şablon: `scripts/soru-sablonu.csv`).
- `npx tsx scripts/soru-durumu.ts` — 24 tablodaki soru sayıları ve hangi kategorilerin hazır olduğu.
- `npx tsx scripts/security-test.ts` — güvenlik ve dayanıklılık testi (yetkiler, RLS, XP hileleri, süre kuralı, eşzamanlılık, storage). Geçici olarak `min_players` ve `fen_lgs.aktif` değiştirir, sonda geri alır.
- `npx tsx scripts/e2e-sim.ts [--oyuncu N] [--kategori ad]` — N sanal oyuncuyla tam yarış simülasyonu (varsayılan: 2 oyuncu, `sayisal` + `lgs_sozel` + `lgs_sayisal`; N en çok 5).

## Demo hazırlığı: XP aracı
> **BU ARAÇ YALNIZCA DEMO HAZIRLIĞI İÇİNDİR.** Gerçek oyuncuların XP'sini değiştirmek için kullanma.

`npx tsx scripts/xp-ayarla.ts "<oyuncu adı>" <xp>` bir oyuncunun XP'sini doğrudan ayarlar, yeni rank etiketini ve sonraki ranka kalan XP'yi yazar. Amaç: demoda oyuncunun XP'sini rank eşiğinin hemen altına koyup (ör. Bronz I eşiği 100 XP için `95`) sunum sırasında rank atlamasını göstermek. Aynı adda birden fazla oyuncu varsa hiçbir şey değiştirmeden listeler ve durur.
