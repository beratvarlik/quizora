# Quizora — Proje Belgesi
Web üzerinde çok oyunculu YKS soru yarışması (İşler Teknoloji EdTech Game Jam, 13-14 Kasım 2026). Herkes aynı 10 soruyu kendi ekranında, eş zamanlı çözer; en yüksek puan kazanır. Demo: 2 kişilik lobi (iPhone Safari). Hedef: 5 kişiye kadar ölçeklenir, QR ile katılım. Arayüz Türkçe. Marka renkleri: #702B3A, #F15A24, #F5F2ED (düzen ve görsel tasarım Kişi B'nin).

## Kategoriler (toplam 10 soru; DİL KATEGORİSİ YOK)
- sayisal: Fizik(AYT) 2, Kimya(AYT) 2, Biyoloji(AYT) 2, Matematik(AYT) 4
- esit_agirlik: Tarih(AYT) 1, Coğrafya(AYT) 1, Felsefe(AYT) 1, Din Kültürü(AYT) 1, Matematik(AYT) 2, Edebiyat(AYT) 4
- sozel: Edebiyat(AYT) 4, Tarih(AYT) 2, Coğrafya(AYT) 2, Felsefe(AYT) 1, Din Kültürü(AYT) 1
- tyt: Türkçe 1, Matematik 2, Kimya 1, Fizik 1, Biyoloji 1, Tarih 1, Coğrafya 1, Felsefe 1, Din Kültürü 1 (hepsi TYT tablolarından)
Sorular 5 şıklı (A–E), görselli olabilir. Tüm oyuncular aynı soruları aynı sırada görür.

## Oyun kuralları
- Lobi: en fazla 5 oyuncu, kod `QZ-XXXX` (4 karakter, I/O/0/1 hariç), QR `/join/QZ-XXXX` adresine gider. Host başlatır, herkese 3-2-1 geri sayım.
- Süre: oyun 120 sn. Herkes soruları kendi hızında çözer. İlk oyuncu 10. soruyu bitirince sunucu `speedup_at`, `speedup_remaining_ms` ve `speedup_by` kaydeder; kalan süre bundan sonra 2× hızlı akar: kalan = speedup_remaining_ms − 2 × (şimdi − speedup_at). Bitirenlerin puanı sabit kalır, diğerleri ve sıralama canlı güncellenir.
- Oyun biter: kalan ≤ 0 veya herkes bitirdi. Cevaplanmayan sorular "boş" (0 puan).
- Kazanan puanını genel liderlik tablosuna (`global_scores`) ekler (+1 galibiyet). Ana menü tablosu canlıdır.

## Puan sistemi (SADECE sunucuda hesaplanır; formül sabittir, değiştirme)
t = oyuncunun soruyu ekranda gördüğü andan cevaplayana kadar geçen GERÇEK saniye (sunucu zamanı; 2× modundan etkilenmez).
- Doğru: 100 + round(100 × max(0, 1 − t/20)) → 100..200
- Yanlış: −25
- Boş: 0
Eşitlikte toplam cevaplama süresi (total_time_ms) kısa olan üstte. İstemci puanı yalnızca önizleme için gösterebilir. Doğru şık cevap verilmeden istemciye ASLA gönderilmez.

## İşlevsel ekran sözleşmesi (tasarımdan bağımsız; B görseli kendi tasarlar, davranış bu)
- `/` Açılış: oyunun tanıtımı, 4 kategori, "Başla" (profil yoksa /profil, varsa /menu), lobi koduyla katıl alanı, canlı genel liderlik (subscribeGlobalLeaderboard).
- `/profil`: isim (zorunlu, 2-20 karakter) + hazır avatar seçimi (`avatarKey`) VEYA kendi fotoğrafını yükleme (`photoFile`); canlı önizleme; kaydet → saveProfile.
- `/menu`: kategori seç (sayisal, esit_agirlik, sozel, tyt), "Lobi kur" → createGame → /lobi/:code; kodla katıl → joinGame; canlı genel liderlik; kullanıcının profili.
- `/join/:code`: profil yoksa önce /profil, sonra joinGame, /lobi/:code. `/lobi/:code`: QR kod (içeriği `<site>/join/KOD`), kod ve kopyalama, canlı oyuncu listesi (5 slot, boşlar belirgin), host için "Başlat" (min 2 oyuncu), oyun `playing` olunca herkeste 3-2-1 geri sayım (startedAt'e göre) sonra /oyun/:code.
- `/oyun/:code`: kalan süre (sunucu saatine göre sayaç), soru no (1-10), kendi puanın; soru metni + opsiyonel görsel + 5 şık; şık seçilince submitAnswer; sonuç ANİMASYONLU doğru/yanlış gösterilir, kazanılan/kaybedilen puan görünür, ~2 sn sonra sonraki soru; canlı sıralama paneli (ad, puan, kaçıncı soruda, "bitirdi" işareti), puan değişince satırlar animasyonla yer değiştirir ve vurgulanır. Süre dolunca kalan sorular boş sayılır ve finishGame çağrılır.
- **2× hız modu** (`game.speedupAt` dolunca): "X bitirdi, süre 2× hızlı akıyor" bildirimi (X = `game.speedupBy` oyuncusu), sayaç hızlanır, belirgin heyecan efektleri (şimşek, elektrik, ateş benzeri animasyonlar), son 10 sn ek vurgu. Bitiren oyuncu bekleme ekranında kalır: puanı sabit, sıralama canlı.
- `/sonuc/:code`: finishGame sonucu: kazanan, sıralama (animasyonlu), kullanıcının doğru/yanlış/boş sayısı ve puan dökümü (taban + hız bonusu − ceza), kazanana kutlama, "Ana menüye dön" ve "Tekrar oyna". Ana menüdeki genel tablo kazananı canlı gösterir.
- Her ekranda: yükleme durumu, Türkçe hata mesajı, bağlantı koptu bandı. Mobil (iPhone Safari, 100dvh, safe-area) ve web; animasyonlar `prefers-reduced-motion`'da kapanır.

## Veritabanı
18 soru tablosu (aynı şema): matematik_tyt, turkce_tyt, kimya_tyt, fizik_tyt, biyoloji_tyt, tarih_tyt, cografya_tyt, felsefe_tyt, din_kulturu_tyt, fizik_ayt, kimya_ayt, biyoloji_ayt, matematik_ayt, edebiyat_ayt, tarih_ayt, cografya_ayt, felsefe_ayt, din_kulturu_ayt. Sütunlar: id uuid pk, soru_metni, gorsel_url null, secenek_a..secenek_e, dogru_sik char(1) A–E, aciklama null, aktif bool default true, created_at.
Oyun tabloları: profiles, games, game_players, game_questions, answers, global_scores. RPC'ler: create_game, join_game, start_game, get_game, get_game_by_id, get_question, submit_answer, finish_game, get_global_leaderboard, server_time.

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
export type Kategori = 'sayisal' | 'esit_agirlik' | 'sozel' | 'tyt';
export type Secenek = 'A' | 'B' | 'C' | 'D' | 'E';
export type GameStatus = 'lobby' | 'playing' | 'finished';
export type Unsubscribe = () => void;
export interface Profile { id: string; displayName: string; avatarKey: string | null; photoUrl: string | null }
export interface GameInfo {
  id: string; code: string; kategori: Kategori; status: GameStatus; hostId: string; speedupBy: string | null;
  startedAt: string | null; speedupAt: string | null; speedupRemainingMs: number | null;
  durationMs: number; totalQuestions: number;
}
export interface PlayerState {
  userId: string; displayName: string; avatarKey: string | null; photoUrl: string | null;
  score: number; currentQ: number; correctCount: number; wrongCount: number; finished: boolean; totalTimeMs: number;
}
export interface Question { position: number; ders: string; text: string; imageUrl: string | null; options: Record<Secenek, string> }
export interface AnswerResult { correct: boolean; points: number; correctOption: Secenek; newScore: number; finished: boolean; speedupTriggered: boolean }
export interface GameResult {
  winnerId: string;
  ranking: Array<PlayerState & { rank: number }>;
  breakdown: { base: number; bonus: number; penalty: number; correct: number; wrong: number; blank: number };
}
export interface GlobalRow { userId: string; displayName: string; avatarKey: string | null; photoUrl: string | null; totalPoints: number; wins: number }
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
  subscribeGame(gameId: string, cb: (s: GameSnapshot) => void): Unsubscribe;
  subscribeGlobalLeaderboard(cb: (rows: GlobalRow[]) => void): Unsubscribe;
}
```
