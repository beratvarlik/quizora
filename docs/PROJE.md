# Quizora — Proje Belgesi
Web üzerinde çok oyunculu YKS ve LGS soru yarışması (İşler Teknoloji EdTech Game Jam, 13-14 Kasım 2026). Herkes aynı 10 soruyu kendi ekranında, eş zamanlı çözer; en yüksek puan kazanır. Demo: 2 kişilik lobi (iPhone Safari). Hedef: 5 kişiye kadar ölçeklenir, QR ile katılım. Arayüz Türkçe. Marka renkleri: #702B3A, #F15A24, #F5F2ED (düzen ve görsel tasarım Kişi B'nin).

## Kategoriler (toplam 10 soru; DİL KATEGORİSİ YOK)
- sayisal: Fizik(AYT) 2, Kimya(AYT) 2, Biyoloji(AYT) 2, Matematik(AYT) 4
- esit_agirlik: Tarih(AYT) 1, Coğrafya(AYT) 1, Felsefe(AYT) 1, Din Kültürü(AYT) 1, Matematik(AYT) 2, Edebiyat(AYT) 4
- sozel: Edebiyat(AYT) 4, Tarih(AYT) 2, Coğrafya(AYT) 2, Felsefe(AYT) 1, Din Kültürü(AYT) 1
- tyt: Türkçe 1, Matematik 2, Kimya 1, Fizik 1, Biyoloji 1, Tarih 1, Coğrafya 1, Felsefe 1, Din Kültürü 1 (hepsi TYT tablolarından)
- lgs_sozel: Türkçe(LGS) 4, T.C. İnkılap Tarihi ve Atatürkçülük(LGS) 2, Din Kültürü ve Ahlak Bilgisi(LGS) 2, İngilizce(LGS) 2
- lgs_sayisal: Matematik(LGS) 5, Fen Bilimleri(LGS) 5
Sınav türü (`games.sinav`, otomatik): kategori `lgs_` ile başlıyorsa `lgs`, değilse `yks`.
YKS soruları 5 şıklı (A–E), **LGS soruları 4 şıklıdır (A–D; `secenek_e` boş)**; görselli olabilir. Tüm oyuncular aynı soruları aynı sırada görür.

## Oyun kuralları
- Lobi: en fazla 5 oyuncu, kod `QZ-XXXX` (4 karakter, I/O/0/1 hariç), QR `/join/QZ-XXXX` adresine gider. Host başlatır, herkese 3-2-1 geri sayım.
- Süre: oyun 120 sn. Herkes soruları kendi hızında çözer. İlk oyuncu 10. soruyu bitirince sunucu `speedup_at`, `speedup_remaining_ms` ve `speedup_by` kaydeder; kalan süre bundan sonra 2× hızlı akar: kalan = speedup_remaining_ms − 2 × (şimdi − speedup_at). Bitirenlerin puanı sabit kalır, diğerleri ve sıralama canlı güncellenir.
- Oyun biter: kalan ≤ 0 veya herkes bitirdi. Cevaplanmayan sorular "boş" (0 puan).
- Yarış bitince oyuncular XP kazanır (aşağıdaki "XP ve rank" bölümü). Genel liderlik tablosu XP'ye göredir (`player_stats`); ana menü tablosu canlıdır. (`global_scores` eski tablodur, artık kullanılmaz.)

## Puan sistemi (SADECE sunucuda hesaplanır; formül sabittir, değiştirme)
t = oyuncunun soruyu ekranda gördüğü andan cevaplayana kadar geçen GERÇEK saniye (sunucu zamanı; 2× modundan etkilenmez).
- Doğru: 100 + round(100 × max(0, 1 − t/20)) → 100..200
- Yanlış: −25
- Boş: 0
Eşitlikte toplam cevaplama süresi (total_time_ms) kısa olan üstte. İstemci puanı yalnızca önizleme için gösterebilir. Doğru şık cevap verilmeden istemciye ASLA gönderilmez.

## XP ve rank (SADECE sunucuda hesaplanır; `finish_game` uygular)
Rank tablosu (`rank_tiers`; XP düşmez, rank yalnızca yükselir):

| Rank | Anahtar | Min XP |
|---|---|---|
| Çaylak | caylak | 0 |
| Bronz I / II / III | bronz_1 / bronz_2 / bronz_3 | 100 / 150 / 200 |
| Gümüş I / II / III | gumus_1 / gumus_2 / gumus_3 | 260 / 330 / 400 |
| Altın I / II / III | altin_1 / altin_2 / altin_3 | 480 / 570 / 660 |
| Elmas I / II / III | elmas_1 / elmas_2 / elmas_3 | 760 / 870 / 980 |
| Efsane | efsane | 1100 |

Bir yarıştan kazanılan XP = **20** (katılım) + **max(0, floor(puan / 10))** + **yerleşim bonusu** (1.: 30, 2.: 15, 3.: 8, diğerleri 0) + **ilk bitiren bonusu** (+10; 10 soruyu ilk bitiren oyuncuya).
- Yalnızca **≥ 2 oyunculu** ve oyuncunun **≥ 1 cevap** verdiği yarışlarda XP verilir.
- XP yarış başına **bir kez** uygulanır (`games.xp_applied`); `finish_game` ikinci kez çağrılırsa sonuç `game_players.xp_*` sütunlarından okunur.
- Rank düşme yok. Efsane en üst rank (sonraki rank yok, ilerleme %100).
- `get_my_stats()` → `{xp, rank_key, rank_label, next_rank_label, xp_to_next, progress_pct, wins, games_played}`. `progress_pct = round(100 × (xp − mevcut_min) / (sonraki_min − mevcut_min))`.

## İşlevsel ekran sözleşmesi (tasarımdan bağımsız; B görseli kendi tasarlar, davranış bu)
- `/` Açılış: oyunun tanıtımı, 6 kategori (YKS 4 + LGS 2), "Başla" (profil yoksa /profil, varsa /menu), lobi koduyla katıl alanı, canlı genel liderlik (subscribeGlobalLeaderboard).
- `/profil`: isim (zorunlu, 2-20 karakter) + hazır avatar seçimi (`avatarKey`) VEYA kendi fotoğrafını yükleme (`photoFile`); canlı önizleme; kaydet → saveProfile.
- `/menu`: **önce sınav türü seçilir (YKS / LGS), sonra kategori** (YKS: sayisal, esit_agirlik, sozel, tyt; LGS: lgs_sozel, lgs_sayisal), "Lobi kur" → createGame → /lobi/:code; kodla katıl → joinGame; canlı genel liderlik; kullanıcının profili. **Ana menüde rank rozeti ve sonraki ranka ilerleme çubuğu** (`getMyStats`: rankLabel, progressPct, xpToNext). Genel liderlik tablosu **XP'ye göre sıralı ve rank rozetlidir**.
- `/join/:code`: profil yoksa önce /profil, sonra joinGame, /lobi/:code. `/lobi/:code`: QR kod (içeriği `<site>/join/KOD`), kod ve kopyalama, canlı oyuncu listesi (5 slot, boşlar belirgin), host için "Başlat" (min 2 oyuncu), oyun `playing` olunca herkeste 3-2-1 geri sayım (startedAt'e göre) sonra /oyun/:code.
- `/oyun/:code`: kalan süre (sunucu saatine göre sayaç), soru no (1-10), kendi puanın; soru metni + opsiyonel görsel + şıklar (YKS 5, LGS 4: **gelen `options` anahtarlarına göre çizilir**); şık seçilince submitAnswer; sonuç ANİMASYONLU doğru/yanlış gösterilir, kazanılan/kaybedilen puan görünür, ~2 sn sonra sonraki soru; canlı sıralama paneli (ad, puan, kaçıncı soruda, "bitirdi" işareti), puan değişince satırlar animasyonla yer değiştirir ve vurgulanır. Süre dolunca kalan sorular boş sayılır ve finishGame çağrılır.
- **2× hız modu** (`game.speedupAt` dolunca): "X bitirdi, süre 2× hızlı akıyor" bildirimi (X = `game.speedupBy` oyuncusu), sayaç hızlanır, belirgin heyecan efektleri (şimşek, elektrik, ateş benzeri animasyonlar), son 10 sn ek vurgu. Bitiren oyuncu bekleme ekranında kalır: puanı sabit, sıralama canlı.
- `/sonuc/:code`: finishGame sonucu: kazanan, sıralama (animasyonlu), kullanıcının doğru/yanlış/boş sayısı ve puan dökümü (taban + hız bonusu − ceza), kazanana kutlama, **XP dökümü** (`xpBreakdown`: katılım + puan + yerleşim + ilk bitiren = toplam), **XP çubuğunun dolması** (`xpBefore` → `xpAfter`) ve rank atlandıysa (`rankedUp`) **rank atlama animasyonu** (`rankLabelBefore` → `rankLabelAfter`), "Ana menüye dön" ve "Tekrar oyna". Ana menüdeki genel tablo kazananı canlı gösterir.
- Her ekranda: yükleme durumu, Türkçe hata mesajı, bağlantı koptu bandı. Mobil (iPhone Safari, 100dvh, safe-area) ve web; animasyonlar `prefers-reduced-motion`'da kapanır.

## Veritabanı
24 soru tablosu (aynı şema): matematik_tyt, turkce_tyt, kimya_tyt, fizik_tyt, biyoloji_tyt, tarih_tyt, cografya_tyt, felsefe_tyt, din_kulturu_tyt, fizik_ayt, kimya_ayt, biyoloji_ayt, matematik_ayt, edebiyat_ayt, tarih_ayt, cografya_ayt, felsefe_ayt, din_kulturu_ayt, turkce_lgs, inkilap_lgs, din_kulturu_lgs, ingilizce_lgs, matematik_lgs, fen_lgs. Sütunlar: id uuid pk, soru_metni, gorsel_url null, secenek_a..secenek_e, dogru_sik char(1) A–E (**LGS tablolarında secenek_e NULL olabilir ve dogru_sik yalnız A–D**), aciklama null, aktif bool default true, created_at.
Oyun tabloları: profiles, games, game_players, game_questions, answers, global_scores (eski), rank_tiers, player_stats. RPC'ler: create_game, join_game, start_game, get_game, get_game_by_id, get_question, submit_answer, finish_game, get_global_leaderboard, get_my_stats, server_time.
- `finish_game(game_id)`: sıralamayı kesinleştirir, XP'yi yarış başına bir kez uygular (`games.xp_applied`), idempotenttir. Süre dolmadan ve herkes bitirmeden 'Yarış henüz bitmedi' der. Dönüş: `{winner_id, ranking[{rank, user_id, ..., xp_gained, xp_before, xp_after, rank_label_before, rank_label_after, ranked_up}], breakdown, xp_breakdown}`. `global_scores`'a yazılmaz.
- `get_global_leaderboard()`: **XP döner** (`player_stats` + `profiles`), ilk 20; `[{user_id, display_name, avatar_key, photo_url, xp, rank_key, rank_label, wins, games_played}]`, `xp` azalan, eşitlikte `wins` azalan.
- `get_question(game_id, position)`: yalnızca oyuncunun sıradaki sorusu; süre sayacını (`q_started_at`) ilk çağrıda başlatır, tekrar çağrıda sıfırlamaz. Doğru şık, açıklama ve `aktif` ASLA dönmez. `submit_answer(game_id, position, secenek|null)`: puanı sunucu hesaplar; süre bitmişse cevabı boş sayar; 10. soruyu ilk bitiren `speedup_at/speedup_remaining_ms/speedup_by` değerlerini yazar. Hata mesajları listesi: `docs/ENTEGRASYON.md`.
- `get_my_stats()`: çağıranın XP/rank özeti (satır yoksa 0 ile oluşturur). Tüm RPC'ler oturum ister (anon çağıramaz); iç yardımcılar (`min_players`, `remaining_ms`, `question_label`, `game_snapshot`) istemciye kapalıdır.
- Soru tablolarına ve `answers`/`game_questions`'a istemci erişimi YOKTUR (RLS açık, policy yok, yetki alınmış); `player_stats`, `rank_tiers`, `global_scores`, `games`, `game_players` istemciye yalnızca okunur.

## Migration'lar (Supabase SQL Editor'de bu sırayla, hepsi yeniden çalıştırılabilir)
| Dosya | İçerik |
|---|---|
| `0001_schema.sql` | 18 YKS soru tablosu, oyun tabloları, RLS, realtime, storage |
| `0002_rpc_lobby.sql` | `create_game`, `join_game`, `start_game`, `get_game`, `get_game_by_id`, `server_time`, yardımcılar |
| `0003_lgs_xp.sql` | 6 LGS tablosu, 6 kategori, `rank_tiers`, `player_stats`, `get_my_stats`, XP sütunları |
| `0004_rpc_game.sql` | `get_question`, `submit_answer` |
| `0005_rpc_finish.sql` | `finish_game` (XP + rank), `get_global_leaderboard` |
| `0006_fix_is_member.sql` | `is_member` anon erişimini kapatır (güvenlik testi bulgusu) |
| `0006b_fix_submit_lock.sql` | `submit_answer` eşzamanlı son soru kilitlenmesini giderir (`for no key update`) |
| `0007_lgs_4_sik.sql` | LGS soruları 4 şıklı: LGS tablolarında `secenek_e` boş olabilir, `dogru_sik` yalnız A-D; `get_question` boş E'yi `options`'a koymaz; `submit_answer` soruda olmayan şık için 'Geçersiz şık' der. **0006b'den SONRA çalıştırılır** (`submit_answer`'ın en güncel hâlini içerir). |

Eski migration dosyaları değiştirilmez; düzeltmeler yeni dosya olarak eklenir. Geliştirmede `app_settings.min_players` 1 yapılabilir; **demo/yayın öncesi 2 olmalı** (`docs/YAYIN.md`).

## Test ve doğrulama araçları (`scripts/`, service role gerekir, hepsi `.env.local` okur)
| Komut | Ne yapar |
|---|---|
| `npx tsx scripts/hepsi.ts` | Aşağıdakilerin hepsini sırayla çalıştırır; sonda "HEPSİ GEÇTİ" (8-12 dk) |
| `check-schema.ts` | Şema, kovalar, anon/yazma güvenliği, 24 soru tablosu, `rank_tiers` |
| `rpc-smoke.ts` | RPC'lerin uçtan uca testi (lobi, soru/cevap, bitirme, XP, liderlik) |
| `api-smoke.ts` | `src/lib/api.ts` (`QuizoraApi`) testi, abonelikler dahil |
| `e2e-sim.ts [--oyuncu N] [--kategori ad]` | N sanal oyuncuyla tam yarış simülasyonu |
| `security-test.ts` | Yetkiler, RLS, XP hileleri, süre kuralı, eşzamanlılık, storage |
| `soru-durumu.ts` | 24 tabloda soru sayıları; kategoriler hazır mı |
| `import-questions.ts`, `seed-test-questions.ts`, `xp-ayarla.ts` | Soru yükleme, test sorusu, demo XP aracı (`docs/SORU-EKLEME.md`) |

Entegrasyon ve yayın: [ENTEGRASYON.md](ENTEGRASYON.md) (B için akış, sayaç, hata mesajları), [YAYIN.md](YAYIN.md) (Vercel).

## Roller ve dosya sahipliği (kesin; akşam da geçerli)
Kişi A (backend, dal: backend) SADECE: supabase/**, scripts/**, src/lib/api.ts, src/lib/scoring.ts, src/lib/scoring.test.ts, src/types.ts, .env.example, README.md, docs/PROJE.md, docs/GIT-REHBERI.md, docs/SORU-EKLEME.md, docs/ENTEGRASYON.md, docs/YAYIN.md, docs/SUPABASE-KURULUM.md, docs/ISTEK-A-to-B.md
Kişi B (frontend, dal: frontend) SADECE: src/pages/**, src/components/**, src/hooks/**, src/styles/**, src/App.tsx, src/main.tsx, src/lib/client.ts, src/lib/api.mock.ts, public/**, index.html, vercel.json, docs/ISTEK-B-to-A.md
Dondurulmuş: package.json, package-lock.json, tsconfig*, vite.config.ts, .gitignore, .githooks/**. Yeni paket gerekirse A'ya söylenir; A paketi kurar ve iskeleti yeniden paylaşır (13 Kasım 11:00'den sonra: `paket-<ad>` dalı, yalnızca package dosyaları, hemen birleştirilir).
Kural: Kendi listende olmayan dosyayı DEĞİŞTİRME; diğer kişiden bir şey gerekirse kendi ISTEK dosyana yaz (A → ISTEK-A-to-B.md, B → ISTEK-B-to-A.md). Akşam dosyalar ayrı klasörlerde olduğundan istekler mesajla iletilir.

## Git kuralları (13 Kasım 11:00'den itibaren)
- 13 Kasım 11:00'e kadar commit YOK. main'e doğrudan commit YOK (hook engeller). A `backend`, B `frontend` dalında çalışır.
- Küçük ve sık commit (Türkçe kısa mesaj); her çalışma bloğu sonunda `git push`.
- `git push --force`, `git reset --hard`, `git rebase`, `git commit --amend`, `--date` KULLANMA.
- Birleştirme: GitHub'da PR (compare: kendi dalın → base: main) → "Merge pull request" → Confirm. "Delete branch"e BASMA. Sonra ikisi de `git fetch origin && git merge origin/main` ile main'i kendi dalına alır. Önce A merge eder, sonra B.
- Çakışma çıkarsa DUR, dosyaları kullanıcıya göster, kendi başına çözme.

## Sözleşme
Arayüz ile backend arasındaki tek bağ `src/types.ts` ve `QuizoraApi` arayüzüdür. Değiştirmek için iki taraf da onaylamalı.

### `src/types.ts` içeriği (birebir)
```ts
export type Sinav = 'yks' | 'lgs';
export type Kategori = 'sayisal' | 'esit_agirlik' | 'sozel' | 'tyt' | 'lgs_sozel' | 'lgs_sayisal';
export type Secenek = 'A' | 'B' | 'C' | 'D' | 'E';
export type GameStatus = 'lobby' | 'playing' | 'finished';
export type Unsubscribe = () => void;
export interface Profile { id: string; displayName: string; avatarKey: string | null; photoUrl: string | null }
export interface GameInfo {
  id: string; code: string; kategori: Kategori; sinav: Sinav; status: GameStatus; hostId: string; speedupBy: string | null;
  startedAt: string | null; speedupAt: string | null; speedupRemainingMs: number | null;
  durationMs: number; totalQuestions: number;
}
export interface PlayerState {
  userId: string; displayName: string; avatarKey: string | null; photoUrl: string | null;
  score: number; currentQ: number; correctCount: number; wrongCount: number; finished: boolean; totalTimeMs: number;
  rankKey: string; rankLabel: string;
}
export interface Question { position: number; ders: string; text: string; imageUrl: string | null; options: Partial<Record<Secenek, string>> }
export interface AnswerResult { correct: boolean; points: number; correctOption: Secenek; newScore: number; finished: boolean; speedupTriggered: boolean }
export interface RankedPlayer extends PlayerState {
  rank: number; xpGained: number; xpBefore: number; xpAfter: number;
  rankLabelBefore: string; rankLabelAfter: string; rankedUp: boolean;
}
export interface XpBreakdown { participation: number; points: number; placement: number; firstFinisher: number; total: number }
export interface GameResult {
  winnerId: string;
  ranking: RankedPlayer[];
  breakdown: { base: number; bonus: number; penalty: number; correct: number; wrong: number; blank: number };
  xpBreakdown: XpBreakdown; // çağıran oyuncu için
}
export interface GlobalRow { userId: string; displayName: string; avatarKey: string | null; photoUrl: string | null; xp: number; rankKey: string; rankLabel: string; wins: number; gamesPlayed: number }
export interface MyStats { xp: number; rankKey: string; rankLabel: string; nextRankLabel: string | null; xpToNext: number | null; progressPct: number; wins: number; gamesPlayed: number }
export interface GameSnapshot { game: GameInfo; players: PlayerState[] }
export interface QuizoraApi {
  ensureSession(): Promise<string>;
  getServerOffsetMs(): Promise<number>;
  getProfile(): Promise<Profile | null>;
  saveProfile(p: { displayName: string; avatarKey: string | null; photoFile?: File }): Promise<Profile>;
  createGame(kategori: Kategori): Promise<{ gameId: string; code: string }>;
  joinGame(code: string): Promise<{ gameId: string }>;
  getGameByCode(code: string): Promise<GameSnapshot>;
  startGame(gameId: string): Promise<void>;
  getQuestion(gameId: string, position: number): Promise<Question>;
  submitAnswer(gameId: string, position: number, secenek: Secenek | null): Promise<AnswerResult>;
  finishGame(gameId: string): Promise<GameResult>;
  getGlobalLeaderboard(): Promise<GlobalRow[]>;
  getMyStats(): Promise<MyStats>;
  subscribeGame(gameId: string, cb: (s: GameSnapshot) => void): Unsubscribe;
  subscribeGlobalLeaderboard(cb: (rows: GlobalRow[]) => void): Unsubscribe;
}
```
