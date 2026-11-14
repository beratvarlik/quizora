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
- `/menu`: **önce sınav türü seçilir (YKS / LGS), sonra kategori** (YKS: sayisal, esit_agirlik, sozel, tyt; LGS: lgs_sozel, lgs_sayisal), kategori seçimi + **"Hemen Katıl" düğmesi** (`quickJoin(kategori)` → `/lobi/:code`; aynı kategorideki uygun herkese açık lobiye girer, yoksa yeni açar); "Lobi kur" → createGame (özel lobi) → /lobi/:code; kodla katıl → joinGame; canlı genel liderlik; kullanıcının profili. **Ana menüde rank rozeti ve sonraki ranka ilerleme çubuğu** (`getMyStats`: rankLabel, progressPct, xpToNext). Genel liderlik tablosu **XP'ye göre sıralı ve rank rozetlidir**.
- `/join/:code`: profil yoksa önce /profil, sonra joinGame, /lobi/:code. `/lobi/:code`: QR kod (içeriği `<site>/join/KOD`), kod ve kopyalama, canlı oyuncu listesi (5 slot, boşlar belirgin), host için "Başlat" (min 2 oyuncu; özel lobide), **herkese açık lobide (`game.isPublic`, Hemen Katıl)**: "Rakip aranıyor" durumu (tek oyuncu), oyuncu slotları, kod/QR (arkadaş davet etmek için kalır), `autoStartAt` doluysa "Yarış X saniye sonra başlıyor" geri sayımı (sunucu saatine göre); süre dolunca her istemci `startIfReady` çağırır; host "Başlat" düğmesi gizli ya da isteğe bağlı erken başlatma; geri düğmesi/sayfa kapanışında `leaveGame` (en iyi çaba), oyun `playing` olunca herkeste 3-2-1 geri sayım (startedAt'e göre) sonra /oyun/:code.
- `/oyun/:code`: kalan süre (sunucu saatine göre sayaç), soru no (1-10), kendi puanın; soru metni + opsiyonel görsel + şıklar (YKS 5, LGS 4: **gelen `options` anahtarlarına göre çizilir**); şık seçilince submitAnswer; sonuç ANİMASYONLU doğru/yanlış gösterilir, kazanılan/kaybedilen puan görünür, ~2 sn sonra sonraki soru; canlı sıralama paneli (ad, puan, kaçıncı soruda, "bitirdi" işareti), puan değişince satırlar animasyonla yer değiştirir ve vurgulanır. Süre dolunca kalan sorular boş sayılır ve finishGame çağrılır.
- **2× hız modu** (`game.speedupAt` dolunca): "X bitirdi, süre 2× hızlı akıyor" bildirimi (X = `game.speedupBy` oyuncusu), sayaç hızlanır, belirgin heyecan efektleri (şimşek, elektrik, ateş benzeri animasyonlar), son 10 sn ek vurgu. Bitiren oyuncu bekleme ekranında kalır: puanı sabit, sıralama canlı.
- `/sonuc/:code`: finishGame sonucu: kazanan, sıralama (animasyonlu), kullanıcının doğru/yanlış/boş sayısı ve puan dökümü (taban + hız bonusu − ceza), kazanana kutlama, **XP dökümü** (`xpBreakdown`: katılım + puan + yerleşim + ilk bitiren = toplam), **XP çubuğunun dolması** (`xpBefore` → `xpAfter`) ve rank atlandıysa (`rankedUp`) **rank atlama animasyonu** (`rankLabelBefore` → `rankLabelAfter`), "Ana menüye dön" ve "Tekrar oyna". Ana menüdeki genel tablo kazananı canlı gösterir.
- **Sonuç ekranı soru şeritleri** (`getGameReview`): sonuç ekranında oyuncu 10 soruyu şerit şerit görür. Her şeritte: soru numarası (1-10), ders, durum (doğru / yanlış / boş), seçilen şık ve doğru şık, aldığı puan (`points`) ve cevap süresi (`timeMs`, sn). Şeride tıklayınca açılır: soru metni (+ görsel), şıklar (yalnızca gelen anahtarlar; doğru şık işaretli, oyuncunun seçtiği şık ayrı işaretli) ve çözüm açıklaması (`explanation`). `explanation` null ise "açıklama henüz eklenmedi" yazılır (hata değil). Boş bırakılan soruda seçilen şık ve süre gösterilmez (`selected`/`timeMs` null). Yalnızca yarış bittikten sonra çağrılır; oyuncu yalnızca KENDİ cevaplarını görür.
- **Sonuç ekranında defter bilgisi:** `getGameReview(...).addedToNotebook > 0` ise "N soru Yanlışlarım defterine eklendi" (defter ekranına bağlantı).
- `/defter` (Yanlışlarım defteri): `getMistakeSummary` ile toplam ve ders/sınav kırılımı (filtre çipleri; `subject` metni aynen filtre değeridir), `getMistakes` ile liste (en yeni önce; soru metni + görsel + gelen `options` anahtarları; son cevabın ve yanlış sayısının rozeti). Soruya tıklayınca çözme modu: oyuncu şık seçer → `practiceAnswer` → doğru şık işaretlenir, açıklama (`explanation`, null ise "açıklama henüz eklenmedi") ve doğruysa "Defterden çıktı" gösterilir; "Defterimden çıkar" → `removeMistake`. Liste boşsa "Defterin boş".
- `/performans` (Performansım): `getPerformance({ exam?, days? })`. Üstte özet kartları (yarış sayısı, doğruluk %, cevaplanan, ortalama süre, seri 🔥 `streakDays`); sınav (Hepsi/YKS/LGS) ve dönem (7/30/90 gün) filtresi; son 7 gün çubuk grafiği (`daily`: cevaplanan ve doğru); ders kırılımı (`bySubject`, doğruluk çubuğu); konu kırılımı (`byTopic`): en zayıf konular önce, `lowSample` olanlar "az veri" etiketiyle ayrı bölümde ve zayıf konu önerisine dahil edilmez. Hiç yarış yoksa "Henüz veri yok" ekranı. Yalnızca oyuncunun kendi verisi.
- **Günlük görevler** (menüde kart ya da `/gorevler`): `getDailyTasks()` ile 3 görev: başlık, ilerleme çubuğu (`progress / target`), XP rozeti; tamamlanınca "Ödülü al" düğmesi (`claimDailyTask`), alınınca ✓. Üç görevin ödülü de alınınca bonus kartı (+50 XP) aktif olur (`bonus.completed`). Üstte "Yenilenmesine X sa Y dk" geri sayımı (`resetsAt`). Rütbe atlarsa (`tierBefore !== tierAfter`) kutlama. Yarış bitince ve defterde soru çözünce görevler yeniden çekilir.
- Her ekranda: yükleme durumu, Türkçe hata mesajı, bağlantı koptu bandı. Mobil (iPhone Safari, 100dvh, safe-area) ve web; animasyonlar `prefers-reduced-motion`'da kapanır.

## Veritabanı
24 soru tablosu (aynı şema): matematik_tyt, turkce_tyt, kimya_tyt, fizik_tyt, biyoloji_tyt, tarih_tyt, cografya_tyt, felsefe_tyt, din_kulturu_tyt, fizik_ayt, kimya_ayt, biyoloji_ayt, matematik_ayt, edebiyat_ayt, tarih_ayt, cografya_ayt, felsefe_ayt, din_kulturu_ayt, turkce_lgs, inkilap_lgs, din_kulturu_lgs, ingilizce_lgs, matematik_lgs, fen_lgs. Sütunlar: id uuid pk, soru_metni, gorsel_url null, secenek_a..secenek_e, dogru_sik char(1) A–E (**LGS tablolarında secenek_e NULL olabilir ve dogru_sik yalnız A–D**), aciklama null (dahili not, öğrenciye gösterilmez), cozum_aciklamasi null (en çok 400 karakter; yarış sonrası öğrenciye gösterilir), aktif bool default true, created_at.
Oyun tabloları: profiles, games, game_players, game_questions, answers, global_scores (eski), rank_tiers, player_stats. RPC'ler: create_game, join_game, start_game, get_game, get_game_by_id, get_question, submit_answer, finish_game, get_global_leaderboard, get_my_stats, get_game_review, quick_join, start_if_ready, leave_game, get_mistake_summary, get_mistakes, practice_answer, remove_mistake, get_performance, get_daily_tasks, claim_daily_task, server_time. Defter tabloları: mistake_book (RLS: kullanıcı yalnızca kendi satırlarını okur; yazma yalnız RPC), mistake_games (oyun başına tek uygulama işareti; istemci erişimi yok).
- `finish_game(game_id)`: sıralamayı kesinleştirir, XP'yi yarış başına bir kez uygular (`games.xp_applied`), idempotenttir. Süre dolmadan ve herkes bitirmeden 'Yarış henüz bitmedi' der. Dönüş: `{winner_id, ranking[{rank, user_id, ..., xp_gained, xp_before, xp_after, rank_label_before, rank_label_after, ranked_up}], breakdown, xp_breakdown}`. `global_scores`'a yazılmaz.
- `get_global_leaderboard()`: **XP döner** (`player_stats` + `profiles`), ilk 20; `[{user_id, display_name, avatar_key, photo_url, xp, rank_key, rank_label, wins, games_played}]`, `xp` azalan, eşitlikte `wins` azalan.
- `get_question(game_id, position)`: yalnızca oyuncunun sıradaki sorusu; süre sayacını (`q_started_at`) ilk çağrıda başlatır, tekrar çağrıda sıfırlamaz. Doğru şık, açıklama ve `aktif` ASLA dönmez. `submit_answer(game_id, position, secenek|null)`: puanı sunucu hesaplar; süre bitmişse cevabı boş sayar; 10. soruyu ilk bitiren `speedup_at/speedup_remaining_ms/speedup_by` değerlerini yazar. Hata mesajları listesi: `docs/ENTEGRASYON.md`.
- `quick_join(p_kategori)` → `{game_id, code, created}`: aynı kategoride uygun herkese açık lobiye ekler, yoksa yeni herkese açık lobi açar (`created=true`). Uygun lobi: `status='lobby'`, `is_public`, aynı kategori, 5'ten az oyuncu, `last_activity_at` son 2 dk içinde, `auto_start_at` yok ya da 4 sn'den uzakta, oyuncu üye değil; çok oyunculu olan önce. Zaten (taze, aynı kategoride) üyesi olduğu herkese açık lobiyi tekrar döndürür. Kategori başına advisory lock ile sıralanır. Yalnızca `quick_join` lobileri `is_public` olur; `create_game` lobileri hep özeldir.
- `start_if_ready(p_game_id)`: üye olmalı. `status='lobby'`, `is_public`, `auto_start_at <= now()` ve oyuncu sayısı ≥ `min_players()` ise `start_game` gibi başlatır (`started_at = now() + 3 sn`); aksi hâlde HATA VERMEDEN hiçbir şey yapmaz (idempotent, eşzamanlı çağrılabilir).
- `leave_game(p_game_id)`: lobiden çıkar; oyun `lobby` değilse 'Oyun başladı'. Kimse kalmazsa oyun silinir; host ayrılırsa en eski oyuncuya devredilir; herkese açık lobide sayı 2'nin altına düşerse `auto_start_at = null`.
- Herkese açık lobi `auto_start_at` kuralı (`quick_join` ve `join_game` uygular): oyuncu sayısı 2'ye ulaşınca `now() + 10 sn`, 5'e ulaşınca `now()`, 2'nin altına düşünce null. `auto_start_at` geçmişse kodla katılım 'Oyun başlamak üzere' hatası verir.
- `get_game_review(p_game_id)`: **yalnızca `finished` oyunda ve yalnızca üyeye**; oyunu bitirmez. Çağıranın 10 soruluk incelemesi: `{items:[{position, ders, text, image_url, options, selected, correct_option, outcome, points, time_ms, explanation}]}` (`position` sırasıyla). `options`'ta `secenek_e` boşsa `E` anahtarı yoktur (LGS). `outcome`: `correct` (seçilen = doğru şık) / `wrong` / `blank` (cevap satırı yok ya da şık null; `selected` null, `points` 0, `time_ms` null). `explanation` = `cozum_aciklamasi` (null olabilir). Silinmiş sorunun pozisyonu atlanır. Hatalar: 'Oturum yok', 'Bu oyuna erişimin yok', 'Yarış henüz bitmedi'. Doğru şık ve açıklama başka hiçbir RPC'de (`get_question`, `submit_answer`'ın `correct_option`'ı hariç, `get_game`, `get_game_by_id`) bulunmaz.
- **Yanlışlarım defteri** (`mistake_book`: user_id, question_id, source_table, wrong_count, last_answer (null = boş), first_seen_at, last_wrong_at, last_game_id, resolved_at (null = defterde); PK `(user_id, question_id)`). `finish_game` içinde `_apply_mistakes` oyun başına BİR kez (`mistake_games` işareti; finish_game tekrar çağrılsa wrong_count artmaz) yanlış ve boş soruları upsert eder (varsa `wrong_count+1`, `resolved_at = null`) ve o yarışta doğru yapılan açık soruları `resolved_at = now()` yapar. 'Boş' = cevap satırı yok ya da şık null; ama yalnızca oyuncunun **gördüğü** sorular (cevap satırı var / `position < current_q` / ekrandaki soru). Silinmiş soru sayımda ve listede atlanır. Mevcut bitmiş oyunlar migration'da eskiden yeniye doldurulur (backfill). RPC yanıtları snake_case:
  - `get_mistake_summary()` → `{total, resolved_total, by_subject:[{exam, subject, count}]}` (yalnızca çözülmemişler; `subject` = ders etiketi, örn. 'Fizik (AYT)').
  - `get_mistakes(p_exam, p_subject, p_limit default 50)` → `{items:[{question_id, exam, subject, text, image_url, options, last_answer, wrong_count, last_wrong_at}]}`; çözülmemişler, en yeni önce; limit 1-200; **doğru şık ve açıklama YOK**; `p_exam` yks/lgs ('Geçersiz sınav').
  - `practice_answer(p_question_id, p_selected)` → `{is_correct, correct_option, explanation, resolved}`; soru kullanıcının açık defterinde değilse 'Bu soru defterinde yok'; doğruysa `resolved_at = now()`, yanlışsa `wrong_count+1` ve `last_answer`; LGS'de 'E' → 'Geçersiz şık'.
  - `remove_mistake(p_question_id)`: `resolved_at = now()` (zaten çıkarılmışsa sessiz; defterde hiç yoksa 'Bu soru defterinde yok').
  - `get_game_review` yanıtına `added_to_notebook` eklendi (o oyundan deftere giren soru sayısı).
- **Akıllı analiz** (`get_performance(p_exam default null, p_days default 30)`): yalnızca BİTMİŞ oyunlar, yalnızca çağıranın cevapları (`auth.uid()`); yalnızca oyuncunun **gördüğü** sorular sayılır (cevap satırı var / `position < current_q` / ekrandaki soru). Silinmiş soru atlanır; `topic` boşsa 'Diğer'. Yanıt (snake_case): `{totals:{games, answered, correct, wrong, blank, avg_time_ms, accuracy}, by_subject:[{exam, subject, answered, correct, accuracy, avg_time_ms}], by_topic:[{exam, subject, topic, answered, correct, accuracy, low_sample}], daily:[{date, answered, correct}], streak_days}`. `answered = correct + wrong` (boş hariç); `accuracy` 0-100, 1 ondalık. `p_days` 1-365'e sıkıştırılır ve `totals/by_subject/by_topic` penceresidir; `daily` her zaman son 7 gün (Europe/Istanbul, bugün dahil, boş gün 0); `streak_days` bugün ya da dünden geriye üst üste yarışılan gün (filtrelerden bağımsız). `low_sample` = `answered < 3`; `by_topic` sırası: önce yeterli örnekliler (doğruluk artan), sonra low_sample. 'Geçersiz sınav' (`p_exam` yks/lgs dışı). `get_game_review` ve `get_mistakes` öğelerine `topic` eklendi (`get_question` değişmedi).
- **Günlük görevler** (ilerleme AYRI SAYILMAZ, o günün verisinden anlık hesaplanır; yalnızca ödül alımı `daily_claims(user_id, date, task_id, claimed_at, xp_gained)` PK `(user_id, date, task_id)` tablosunda, istemci erişimi YOK; `task_id='bonus'` bonus için). "Bugün" = Europe/Istanbul; oyun BİTTİĞİ güne yazılır; yalnızca bitmiş ve oyuncunun ≥ 1 soru cevapladığı oyunlar. Havuz (`_daily_pool`, kodda sabit): math10 (10 Matematik cevabı, YKS+LGS, boş hariç; +30), win1 (1. olunan oyun; +40), correct5 (5 doğru; +20), friends2 (3+ oyunculu oyun, hedef 1; +30), notebook3 (bugün `practice_answer` ile doğru çözülen defter sorusu, hedef 3; +30; `mistake_book.practice_resolved_at` yalnızca `practice_answer` doğru çözümünde dolar, `remove_mistake` ve yarışta çözülme DOLDURMAZ), acc70 (≥ 5 cevaplanmış ve doğru/cevaplanan ≥ %70 bir oyun, hedef 1; +30), quick1 (`is_public` oyun, hedef 1; +20), games3 (3 oyun; +30). Günün 3 görevi `md5(tarih || id)` sırasının ilk üçü (deterministik, herkes için aynı). Bonus +50 XP.
  - `get_daily_tasks()` → `{date, resets_at, tasks:[{id, title, target, progress (target ile sınırlı), xp, completed, claimed}], bonus:{xp, completed, claimed}}`; `bonus.completed` = bugünün 3 görevinin ödülü de alınmış.
  - `claim_daily_task(p_task_id)` → `{xp_gained, new_xp, tier_before, tier_after}` (tier = rütbe etiketi). Yalnızca bugünün görevi, completed ve daha önce alınmamışsa; XP `player_stats`'a eklenir. Kullanıcı başına advisory kilit (çift ödül yok). Hatalar: 'Geçersiz görev', 'Bu görev bugünün görevi değil', 'Ödül zaten alındı', 'Görev henüz tamamlanmadı', 'Önce üç görevin ödülünü al'.
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
| `0008_cozum_aciklamasi.sql` | 24 soru tablosuna `cozum_aciklamasi` (≤ 400 karakter) ve `get_game_review` RPC'si |
| `0014_bot_ilk_bitiren.sql` | Demo botları düzeltmesi: 2× modunu ZAMAN SIRASINA göre ilk bitiren tetikler (bot işleme sırasından bağımsız); yalnızca `_bot_isle` yeniden tanımlanır |
| `0013_demo_botlari.sql` | Demo botları (varsayılan KAPALI): `profiles.is_bot`, `bot_profilleri`, `app_settings` bot ayarları, `bot_doldur`/`bot_ilerlet`/`_bot_isle` (iç), `game_snapshot` + `get_game`/`get_game_by_id` (bot tetikleme, `players[].is_bot`), `finish_game` (botlu XP kuralı), `get_global_leaderboard` (bot yok), `leave_game` |
| `0012_gunluk_gorevler.sql` | Günlük görevler: `daily_claims`, `mistake_book.practice_resolved_at`, görev havuzu/ilerleme iç yardımcıları, `practice_answer` (practice_resolved_at), `get_daily_tasks`, `claim_daily_task` |
| `0011_akilli_analiz.sql` | Akıllı analiz: 24 soru tablosuna `topic` (≤ 60 karakter), `get_performance`, `get_game_review`/`get_mistakes` öğelerine `topic`; mevcut soruların konuları `scripts/konu-yukle.ts` ile yüklenir |
| `0010_yanlislarim_defteri.sql` | Yanlışlarım defteri: `mistake_book`, `mistake_games`, iç yardımcılar, `finish_game` (defteri doldurur), `get_game_review.added_to_notebook`, `get_mistake_summary`, `get_mistakes`, `practice_answer`, `remove_mistake`, backfill |
| `0009_hemen_katil.sql` | Hemen Katıl: `games.is_public/auto_start_at/last_activity_at`, `quick_join`, `start_if_ready`, `leave_game`; `create_game` iç yardımcıya taşındı, `join_game` güncellendi |

Eski migration dosyaları değiştirilmez; düzeltmeler yeni dosya olarak eklenir. Geliştirmede `app_settings.min_players` 1 yapılabilir; **demo/yayın öncesi 2 olmalı** (`docs/YAYIN.md`).

## Demo botları (Hemen Katıl için sanal rakipler; YALNIZCA demo)
- **Varsayılan KAPALI** (`app_settings.bot_modu = 'kapali'`). Açma/kapama (Supabase SQL Editor):
  `update app_settings set value = 'acik' where key = 'bot_modu';` · `update app_settings set value = 'kapali' where key = 'bot_modu';`
  Diğer ayarlar: `bot_sayisi` (varsayılan 2, en çok 4) ve `bot_bekleme_sn` (varsayılan 7). Botlar önce `npx tsx scripts/bot-olustur.ts` ile oluşturulur (`--sil` kaldırır).
- **Ne zaman katılır:** mod açıkken, herkese açık (Hemen Katıl) lobide **tek başına** bekleyen insana, o insan `bot_bekleme_sn` kadar beklemişse `bot_sayisi` kadar bot eklenir ve `autoStartAt = şimdi + 5 sn` olur; yarış normal akışla başlar. 2+ insanlı lobiye, özel (kodlu) lobiye ve dolu lobiye bot eklenmez. Kontrol, lobiye bakan istemcinin `getGame`/`getGameByCode` çağrılarıyla (kilit altında, idempotent) yapılır; arka plan işi yoktur.
- **Dürüstlük:** bot adları "(bot)" ile biter (Ada, Mert, Zeynep, Can); `PlayerState.isBot` (isteğe bağlı) `true` gelir; arayüz "BOT" rozeti gösterebilir.
- **Oyun sırasında:** botların cevapları da istemci çağrılarıyla "tembel" yazılır (`get_game`/`get_game_by_id`/`finish_game`): her bot için deterministik plan (soru başına `max(2, ort_sure_sn × (0,6 + 0,8·u))` sn, doğruluk olasılığı; LGS 4, YKS 5 şık). Puan ve süre kuralı gerçek oyuncularla AYNI (`scoring.ts`). Bot ilk bitirirse 2× modunu tetikler (Ada, 6,5 sn ile genelde ilk bitirendir); "ilk bitiren" bot işleme sırasına değil bitirme ZAMANINA göre belirlenir (0014). Çağrı sıklığı sonucu değiştirmez.
- **XP / liderlik etkisi:** botlar `player_stats`'a ve genel liderlik tablosuna HİÇ girmez (botların XP'si 0, rank "Çaylak"); botlu oyunda insan yalnızca **katılım (20) + puan (puan/10)** XP'si alır, derece (1./2./3.) ve ilk bitiren bonusu YOKTUR ve `wins` artmaz. Botlar Yanlışlarım defterine girmez; günlük görev `friends2` ("arkadaşınla yarış") botlu oyunu saymaz. Botsuz oyunlarda hiçbir kural değişmez.
- **Güvenlik:** bot hesapları rastgele şifreyle oluşturulur ve şifre saklanmaz (giriş yapılamaz); istemci `is_bot`, `bot_profilleri` ve `app_settings` yazamaz; bot fonksiyonları istemciye kapalıdır.
- Lobide yalnızca botlar kalırsa (insan `leaveGame` yaparsa) lobi silinir.
- **Sunumda dikkat:** `bot_modu`'nu bir yarış sürerken kapatma; botların cevapları durur ve kalan soruları boş sayılır. Modu yarışlar arasında değiştir. Bot hesapları yalnızca `bot-olustur.ts` ile oluşturulan 4 hesaptır; `bot_profilleri`'nde hız sırası (`ort_sure_sn` artan) ilk `bot_sayisi` botu seçer (Ada, Can, Mert, Zeynep).

## Test ve doğrulama araçları (`scripts/`, service role gerekir, hepsi `.env.local` okur)
| Komut | Ne yapar |
|---|---|
| `npx tsx scripts/hepsi.ts` | Aşağıdakilerin hepsini sırayla çalıştırır; sonda "HEPSİ GEÇTİ" (8-12 dk) |
| `check-schema.ts` | Şema, kovalar, anon/yazma güvenliği, 24 soru tablosu, `rank_tiers` |
| `rpc-smoke.ts` | RPC'lerin uçtan uca testi (lobi, soru/cevap, bitirme, XP, liderlik) |
| `api-smoke.ts` | `src/lib/api.ts` (`QuizoraApi`) testi, abonelikler dahil |
| `e2e-sim.ts [--oyuncu N] [--kategori ad] [--hizli]` | N sanal oyuncuyla tam yarış simülasyonu |
| `security-test.ts` | Yetkiler, RLS, XP hileleri, süre kuralı, eşzamanlılık, storage |
| `soru-durumu.ts` | 24 tabloda soru sayıları; kategoriler hazır mı |
| `bot-olustur.ts` | Demo botlarını oluşturur / `--sil` ile kaldırır (varsayılan kapalı; açma SQL'i "Demo botları" bölümünde) |
| `import-questions.ts`, `aciklama-yukle.ts`, `konu-yukle.ts`, `seed-test-questions.ts`, `xp-ayarla.ts` | Soru yükleme (`topic` zorunlu), çözüm açıklaması yükleme, konu yükleme, test sorusu, demo XP aracı (`docs/SORU-EKLEME.md`) |

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
  isPublic: boolean; autoStartAt: string | null;
}
export interface PlayerState {
  userId: string; displayName: string; avatarKey: string | null; photoUrl: string | null;
  score: number; currentQ: number; correctCount: number; wrongCount: number; finished: boolean; totalTimeMs: number;
  rankKey: string; rankLabel: string;
  isBot?: boolean; // demo botu (adı '(bot)' ile biter); isteğe bağlı, arayüz 'BOT' rozeti gösterebilir
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
export type ReviewOutcome = 'correct' | 'wrong' | 'blank';
export interface ReviewItem {
  position: number; ders: string; topic: string | null; text: string; imageUrl: string | null;
  options: Partial<Record<Secenek, string>>;
  selected: Secenek | null; correctOption: Secenek; outcome: ReviewOutcome;
  points: number; timeMs: number | null; explanation: string | null;
}
export interface GameReview { items: ReviewItem[]; addedToNotebook: number } // addedToNotebook: bu yarıştan Yanlışlarım defterine giren soru sayısı
export interface MistakeSummary { total: number; resolvedTotal: number; bySubject: { exam: Sinav; subject: string; count: number }[] }
export interface MistakeItem {
  questionId: string; exam: Sinav; subject: string; topic: string | null; text: string; imageUrl: string | null;
  options: Partial<Record<Secenek, string>>; // LGS'de yalnızca A-D
  lastAnswer: Secenek | null; // null = boş bırakılmıştı
  wrongCount: number; lastWrongAt: string; // doğru şık ve açıklama BURADA yok
}
export interface PracticeResult { isCorrect: boolean; correctOption: Secenek; explanation: string | null; resolved: boolean }
// Akıllı analiz / Performansım (yalnızca bitmiş oyunlar, çağıranın kendi verisi).
// answered = correct + wrong (boş bırakılanlar hariç); accuracy = 100 * correct / answered (0-100, 1 ondalık; answered 0 ise 0);
// avgTimeMs: cevaplanan sorularda ortalama süre (veri yoksa 0). topic boş olan sorular 'Diğer' sayılır.
// Günlük görevler: ilerleme o günün (Europe/Istanbul) bitmiş yarışlarından anlık hesaplanır; yalnızca ödül alımı saklanır.
// Görev id'leri: math10, win1, correct5, friends2, notebook3, acc70, quick1, games3. Günün 3 görevi tarihe göre deterministik (herkes aynı).
export interface DailyTask { id: string; title: string; target: number; progress: number; xp: number; completed: boolean; claimed: boolean } // progress target ile sınırlı
export interface DailyTasks {
  date: string; // 'YYYY-MM-DD' (Europe/Istanbul)
  resetsAt: string; // bir sonraki İstanbul gece yarısı (ISO)
  tasks: DailyTask[]; // 3 görev
  bonus: { xp: number; completed: boolean; claimed: boolean }; // completed = 3 görevin ödülü de alındı
}
export interface ClaimResult { xpGained: number; newXp: number; tierBefore: string; tierAfter: string } // tier = rütbe etiketi ('Bronz I')
export interface PerformanceStats {
  totals: { games: number; answered: number; correct: number; wrong: number; blank: number; avgTimeMs: number; accuracy: number };
  bySubject: { exam: Sinav; subject: string; answered: number; correct: number; accuracy: number; avgTimeMs: number }[]; // answered > 0 olanlar, en çok çözülen önce
  byTopic: { exam: Sinav; subject: string; topic: string; answered: number; correct: number; accuracy: number; lowSample: boolean }[]; // lowSample: answered < 3; önce yeterli örnekliler (doğruluk artan), sonra lowSample
  daily: { date: string; answered: number; correct: number }[]; // son 7 gün (Europe/Istanbul, bugün dahil, eskiden yeniye), boş gün 0; 'YYYY-MM-DD'
  streakDays: number; // üst üste yarışılan gün (bugün ya da dünden geriye)
}
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
  quickJoin(kategori: Kategori): Promise<{ gameId: string; code: string; created: boolean }>;
  leaveGame(gameId: string): Promise<void>;
  startIfReady(gameId: string): Promise<void>;
  getQuestion(gameId: string, position: number): Promise<Question>;
  submitAnswer(gameId: string, position: number, secenek: Secenek | null): Promise<AnswerResult>;
  finishGame(gameId: string): Promise<GameResult>;
  getGlobalLeaderboard(): Promise<GlobalRow[]>;
  getMyStats(): Promise<MyStats>;
  getGameReview(gameId: string): Promise<GameReview>;
  getMistakeSummary(): Promise<MistakeSummary>;
  getMistakes(opts?: { exam?: Sinav; subject?: string; limit?: number }): Promise<MistakeItem[]>;
  practiceAnswer(questionId: string, selected: Secenek): Promise<PracticeResult>;
  removeMistake(questionId: string): Promise<void>;
  getPerformance(opts?: { exam?: Sinav; days?: number }): Promise<PerformanceStats>; // days: 1-365, varsayılan 30
  getDailyTasks(): Promise<DailyTasks>;
  claimDailyTask(taskId: string): Promise<ClaimResult>; // taskId: günün görevi ya da 'bonus'
  subscribeGame(gameId: string, cb: (s: GameSnapshot) => void): Unsubscribe;
  subscribeGlobalLeaderboard(cb: (rows: GlobalRow[]) => void): Unsubscribe;
}
```
