# A → B istekleri

Format: - [ ] gg.aa ss:dd — istek — durum

- [ ] 13.11 11:32 — **src/types.ts değişti (LGS + XP/rank); `backend` dalı main'e birleşince `git fetch origin && git merge origin/main` ile al.** — bekliyor
  - Yeni tip: `Sinav = 'yks' | 'lgs'`. `Kategori` artık 6 değer: `sayisal, esit_agirlik, sozel, tyt, lgs_sozel, lgs_sayisal`.
  - `GameInfo.sinav: Sinav` eklendi. `PlayerState`'e `rankKey: string; rankLabel: string` eklendi (api.mock.ts'teki sahte oyuncular da bunları doldurmalı).
  - Yeni: `RankedPlayer` (`rank, xpGained, xpBefore, xpAfter, rankLabelBefore, rankLabelAfter, rankedUp`), `XpBreakdown` (`participation, points, placement, firstFinisher, total`), `MyStats` (`xp, rankKey, rankLabel, nextRankLabel, xpToNext, progressPct, wins, gamesPlayed`).
  - `GameResult.ranking` artık `RankedPlayer[]`; `GameResult.xpBreakdown` eklendi (çağıran oyuncu için).
  - **`GlobalRow.totalPoints KALKTI`**; yerine `xp, rankKey, rankLabel, wins, gamesPlayed`. Liderlik tablosu XP'ye göre sıralanır, rank rozeti gösterilir.
  - `QuizoraApi`'ye `getMyStats(): Promise<MyStats>` eklendi (api.mock.ts'e de ekle).
  - Ekran sözleşmesi (docs/PROJE.md): Menü önce YKS/LGS seçtirir, sonra kategori; ana menüde rank rozeti + sonraki ranka ilerleme çubuğu; sonuç ekranında XP dökümü, XP çubuğu dolması, rank atlama animasyonu.
  - XP formülü ve rank tablosu: docs/PROJE.md "XP ve rank" bölümü (rank anahtarları: caylak, bronz_1..3, gumus_1..3, altin_1..3, elmas_1..3, efsane).

- [ ] 13.11 12:36 — **Birleştirme 2 hazır.** `backend` dalı main'e PR ile birleştirilmeye hazır: Supabase şeması ve RPC'ler (migration 0001-0005, LGS + XP/rank dahil), `src/lib/api.ts` (`createApi`, varsayılan `api`), `src/types.ts` güncel hâli, test scriptleri. Uçtan uca simülasyon (`scripts/e2e-sim.ts`) 2 ve 5 oyuncuyla, YKS ve LGS kategorilerinde GEÇTİ. — bekliyor
  - Birleşince: `git fetch origin && git merge origin/main` ile main'i `frontend` dalına al.
  - Gerçek backend'i kullanmak için `.env.local`'a `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` yaz, `VITE_USE_MOCK=false` yap; `import { api } from '../lib/api'`. Env eksikse `api`'nin ilk çağrısı "Supabase ayarı eksik: …" hatası fırlatır.
  - Mock (`api.mock.ts`) `QuizoraApi`'yi tam karşılamalı: `getMyStats`, `PlayerState.rankKey/rankLabel`, `GameInfo.sinav`, `GlobalRow` (xp, rankKey, rankLabel, wins, gamesPlayed), `GameResult.xpBreakdown` ve `RankedPlayer` alanları.
  - Hatalar Türkçe `Error.message` olarak gelir ('Kod bulunamadı', 'Lobi dolu', 'Oyun başladı', 'Bağlantı hatası, tekrar dene', 'Oturum yok' vb.); arayüzde olduğu gibi gösterilebilir.
  - Demo için XP aracı: `npx tsx scripts/xp-ayarla.ts "<oyuncu adı>" <xp>` (yalnızca demo hazırlığı; README'de açıklandı).

- [ ] 13.11 14:14 — **Entegrasyon rehberi ve yayın notları hazır; lütfen oku ve onayla.** `docs/ENTEGRASYON.md` (kurulum, YKS/LGS kategori seçimi, oyun akışı sırası, sayaç ve 2× modu, XP/rank ekranları, yenileme sonrası devam, `finishGame` yeniden deneme kodu, abonelikler, tüm Türkçe hata mesajları tablosu) ve `docs/YAYIN.md` (Vercel adımları, ortam değişkenleri, yayın sonrası kontrol listesi). — bekliyor
- [ ] 13.11 14:14 — **`vercel.json` ekle (senin dosyan, repo kökü).** SPA rewrite olmadan `/join/KOD` ve sayfa yenileme 404 verir. İçerik tam olarak şu: — bekliyor
  ```json
  {"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}
  ```
  - Vercel ayarları: Framework Vite, Build `npm run build`, Output `dist`; ortam değişkenleri `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_USE_MOCK=false` (service role ASLA). Ayrıntı: `docs/YAYIN.md`.
  - `src/lib/client.ts` için örnek `docs/ENTEGRASYON.md` bölüm 1'de.

- [ ] 13.11 16:44 — **LGS soruları 4 şıklı (A-D): `src/types.ts` ve arayüz davranışı değişti. `backend` dalı main'e birleşince `git fetch origin && git merge origin/main` ile al.** — bekliyor
  - **Tip değişikliği (tek satır):** `Question.options` artık `Partial<Record<Secenek, string>>` (eskiden `Record<Secenek, string>`). YKS soruları 5 şıklı (A-E), **LGS soruları (`lgs_sozel`, `lgs_sayisal`) 4 şıklı: `options` içinde `E` anahtarı HİÇ gelmez.**
  - **Arayüzde yapman gereken:** şık düğmelerini sabit 5 değil, **gelen anahtarlara göre çiz**: `Object.entries(soru.options)` (A'dan başlayıp sıralı). `E` gelmediyse E düğmesi/boş yer gösterme. Klavye kısayolu (A-E tuşları) varsa yalnızca gelen harfleri kabul et. `Record<Secenek, string>` varsayan `options.E` gibi erişimler artık `string | undefined` döner; TypeScript seni uyarır.
  - **Gönderme:** yalnızca `soru.options`'ta olan harfler gönderilir. Soruda olmayan bir şık (LGS'de `E`) `submitAnswer`'da `Geçersiz şık` hatası verir. Cevapsız/süre dolunca `null` göndermeye devam et.
  - **Mock (`api.mock.ts`):** `lgs_sozel` ve `lgs_sayisal` kategorilerinde `getQuestion` 4 şıklı (`options` = `{A,B,C,D}`) döndürmeli; YKS kategorilerinde 5 şıklı kalmalı. `submitAnswer(…, 'E')` LGS sorusunda `Error('Geçersiz şık')` fırlatmalı; `correctOption` A-D'den biri olmalı.
  - **Belgeler güncel:** `docs/ENTEGRASYON.md` (şık sayısı bölümü ve hata tablosu), `docs/PROJE.md` (tipler bloğu `src/types.ts` ile aynı).
  - Veritabanı tarafı (`0007_lgs_4_sik.sql`) Supabase'e uygulandıktan ve tüm testler geçtikten sonra birleştirilecektir; birleşince bu notun altına "birleşti" yazılır.
