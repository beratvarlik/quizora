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

- [ ] 13.11 18:10 — **Yarış sonrası soru incelemesi: yeni `getGameReview` ve tipler. `backend` dalı main'e birleşince `git fetch origin && git merge origin/main` ile al.** — bekliyor
  - **Yeni tipler (`src/types.ts`):** `ReviewOutcome` (`'correct' | 'wrong' | 'blank'`), `ReviewItem` (position, ders, text, imageUrl, options `Partial<Record<Secenek,string>>`, selected, correctOption, outcome, points, timeMs, explanation), `GameReview { items }`; `QuizoraApi`'ye `getGameReview(gameId): Promise<GameReview>` eklendi.
  - **Ne zaman:** `finishGame` sonrası ya da `status === 'finished'` iken. `'Yarış henüz bitmedi'` gelirse 500 ms sonra yeniden dene (en çok 5). Hazır kod: `docs/ENTEGRASYON.md` bölüm 8b. Oyuncu yalnızca kendi cevaplarını görür; doğru şık ve açıklama yarış bitmeden hiçbir yoldan gelmez.
  - **Ekran:** soru şeritleri (numara, ders, durum, seçilen/doğru şık, puan, süre; tıklayınca soru metni, şıklar, açıklama). `explanation` null ise "açıklama henüz eklenmedi". `options`'ı yine gelen anahtarlara göre çiz (LGS 4 şık). `selected` null = boş. Ayrıntı: `docs/PROJE.md` "Sonuç ekranı soru şeritleri".
  - **Mock (`api.mock.ts`):** `getGameReview(gameId)` uygulanmalı. `api.mock.ts` bunu içermeyince `npm run typecheck`/`build` `Property 'getGameReview' is missing` hatası verir. Mock 10 öğe dönsün: oyuncunun mock cevaplarına göre `outcome`/`selected`/`points`/`timeMs`, birkaçında `explanation` dolu, birkaçında `null`; LGS'de 4 şık.
  - Veritabanı tarafı (`0008_cozum_aciklamasi.sql`) Supabase'e uygulandıktan sonra çalışır; gerçek açıklamalar ayrı CSV ile yüklenecek, o zamana kadar `explanation` çoğunlukla `null` gelir.

- [ ] 14.11 — **"Hemen Katıl" (hızlı eşleşme) için backend hazır: yeni `quickJoin`, `leaveGame`, `startIfReady` ve `GameInfo.isPublic/autoStartAt`. `backend` dalı main'e birleşince `git fetch origin && git merge origin/main` ile al.** — bekliyor
  - **Tipler (`src/types.ts`):** `GameInfo`'ya `isPublic: boolean; autoStartAt: string | null`. `QuizoraApi`'ye `quickJoin(kategori): Promise<{gameId, code, created}>`, `leaveGame(gameId): Promise<void>`, `startIfReady(gameId): Promise<void>`.
  - **Akış (`docs/ENTEGRASYON.md` bölüm 7b):** menüde kategori + "Hemen Katıl" → `quickJoin` → `/lobi/:code`. Herkese açık lobide (`isPublic`) host yok: `autoStartAt` null → "Rakip aranıyor"; doluysa "Yarış X saniye sonra başlıyor"; süre dolunca herkes `startIfReady` çağırır (500 ms arayla birkaç kez, hata yutulur); geri düğmesi/sayfa kapanışında `leaveGame` (en iyi çaba). Ayrıntı: `docs/PROJE.md` ekran sözleşmesi.
  - **Yeni hata:** kodla katılırken geri sayım bitmişse `Oyun başlamak üzere`.
  - **Mock (`api.mock.ts`) tamamlanmalı, yoksa typecheck/build kırılır:** `GameInfo` nesnelerine `isPublic`/`autoStartAt` ekle; `quickJoin` yeni herkese açık lobi açsın, 2 sn sonra bir bot oyuncu eklesin ve `autoStartAt = +10 sn` versin; `startIfReady` `autoStartAt` geçmişse oyunu başlatsın (aksi hâlde sessizce hiçbir şey yapmasın); `leaveGame` oyuncuyu çıkarsın.
  - Veritabanı tarafı (`0009_hemen_katil.sql`) Supabase'e uygulanıp tüm testler geçtikten sonra birleştirilecektir.

- [ ] 14.11 — **Yanlışlarım defteri hazır, `backend` dalında (henüz `main`'e BİRLEŞMEDİ). Mock'u `frontend`'e ekleyip "push'landı" de; ardından önce `backend` → `main`, hemen arkasından `frontend` → `main` birleştirilecek.** — bekliyor
  - **Tipler (`src/types.ts`):** `MistakeSummary`, `MistakeItem`, `PracticeResult`; `QuizoraApi`'ye `getMistakeSummary()`, `getMistakes({ exam?, subject?, limit? })`, `practiceAnswer(questionId, selected)`, `removeMistake(questionId)`; **`GameReview`'e `addedToNotebook: number`** (o yarıştan deftere giren soru sayısı; sonuç ekranında "N soru Yanlışlarım defterine eklendi").
  - **Akış (`docs/ENTEGRASYON.md` bölüm 8c, ekran sözleşmesi `docs/PROJE.md` `/defter`):** `getMistakeSummary` (toplam + ders/sınav kırılımı), `getMistakes` (en yeni önce; **doğru şık ve açıklama yok**), `practiceAnswer` (cevap sonrası `correctOption` + `explanation`; doğruysa `resolved: true` → listeden çıkar), `removeMistake`. `options`'ı yine gelen anahtarlara göre çiz (LGS 4 şık). `subject` metnini aynen filtre olarak geri ver.
  - **Mock (`api.mock.ts`) tamamlanmalı, yoksa typecheck/build kırılır:** (1) `getGameReview` yanıtına `addedToNotebook` (yanlış + boş sayısı); (2) mock oyun bitince yanlış/boş soruları bellekte bir "defter"e yaz (`wrongCount`, `lastAnswer` null = boş, `lastWrongAt`); (3) `getMistakeSummary` çözülmemişleri sayar, `bySubject`'ta `{exam, subject, count}`; (4) `getMistakes` filtreleri + `limit` uygular, doğru şık/açıklama içermez; (5) `practiceAnswer` doğruysa soruyu çözülmüş yapar (`resolved: true`), yanlışsa `wrongCount+1`; defterde olmayan soruda `Error('Bu soru defterinde yok')`; (6) `removeMistake` çözülmüş yapar. Birkaç mock soruda `explanation` dolu, birkaçında `null` olsun.
  - **Yeni hatalar:** `Bu soru defterinde yok`, `Geçersiz sınav`, `Soru bulunamadı` (bölüm 10 tablosunda).
  - Veritabanı tarafı (`0010_yanlislarim_defteri.sql`) Supabase'e uygulanıp tüm testler geçtikten sonra birleştirilecektir.

- [ ] 14.11 — **Performansım (akıllı analiz) hazır, `backend` dalında (henüz `main`'e BİRLEŞMEDİ). Mock'u `frontend`'e ekleyip "push'landı" de; ardından önce `backend` → `main`, hemen arkasından `frontend` → `main` birleştirilecek.** — bekliyor
  - **Tipler (`src/types.ts`):** yeni `PerformanceStats` (`totals`, `bySubject`, `byTopic`, `daily`, `streakDays`); `QuizoraApi`'ye `getPerformance(opts?: { exam?: Sinav; days?: number })`. **`ReviewItem.topic` ve `MistakeItem.topic` eklendi (`string | null`; null = konusu girilmemiş).**
  - **Akış (`docs/ENTEGRASYON.md` bölüm 8d, ekran sözleşmesi `docs/PROJE.md` `/performans`):** `accuracy` 0-100 (1 ondalık); `answered = correct + wrong` (boşlar ayrı `blank`); `days` yalnızca `totals/bySubject/byTopic` penceresi; **`daily` her zaman son 7 gün** (`YYYY-MM-DD`, eskiden yeniye, boş gün 0); `streakDays` filtrelerden bağımsız. `byTopic` sırası sunucudan gelir (önce en zayıf yeterli örnekli konular, sonra `lowSample: true` olanlar); `lowSample` konuları "az veri" etiketiyle göster, "zayıf konu" önerisine katma.
  - **Mock (`api.mock.ts`) tamamlanmalı, yoksa typecheck/build kırılır:** (1) `getPerformance` — mock oyun geçmişinden ya da sabit örnek veriden `PerformanceStats` döndürsün: `totals`, birkaç ders (`bySubject`), birkaç konu (en az 2'si `lowSample: true`), `daily` tam 7 öğe (bugün dahil, birkaç gün 0), `streakDays` (örn. 3); `exam` filtresi uygulansın; (2) `ReviewItem` ve `MistakeItem` nesnelerine `topic` ekle (birkaçı `null`).
  - **Veri:** mevcut 94 gerçek sorunun konuları `scripts/konu-atamalari.csv` ile yüklenecek (A yapar). Yeni eklenen sorularda `topic` zorunlu (`docs/SORU-EKLEME.md` bölüm 2c).
  - Veritabanı tarafı (`0011_akilli_analiz.sql`) Supabase'e uygulanıp tüm testler geçtikten sonra birleştirilecektir.
