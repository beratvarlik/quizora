# Supabase Kurulumu

## Manuel adımlar
1. supabase.com'da yeni proje aç (bölge: Frankfurt / eu-central-1).
2. Authentication → Providers → **Anonymous sign-ins** seçeneğini aç.
3. Project Settings → API sayfasından Project URL, `anon` anahtarı ve servis rolü (service role) anahtarını kopyala; `.env.local` dosyasına yaz.

## `.env.local` formatı
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_USE_MOCK=true
SUPABASE_SERVICE_ROLE_KEY=
```
- `.env.local` repoya girmez (`.gitignore`'da). Anahtarları sohbete veya koda yazma.
- `SUPABASE_SERVICE_ROLE_KEY` yalnızca `scripts/` içindir, ASLA `VITE_` önekiyle yazılmaz.

## Bağlantı kontrolü
```
npx tsx scripts/ping.ts
```
Sonda `OK` görmelisin; eksik değişken varsa hangisi olduğunu Türkçe yazar.
