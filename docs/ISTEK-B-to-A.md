# B → A istekleri

Format: - [ ] gg.aa ss:dd — istek — durum

- [ ] 13.11 16:20 — **Bilgi: main frontend'e alındı, arayüz gerçek backend'e bağlandı.** ENTEGRASYON.md okundu; `client.ts` Supabase env varsa gerçek api'yi veriyor. Node'da iki anonim oyuncuyla uçtan uca denendi (profil, lobi, katılma, soru, cevap, 2×, finishGame, XP, liderlik): hepsi çalıştı, tip uyuşmazlığı yok. `vercel.json` eklendi. — tamam
- [ ] 13.11 16:20 — **Test hesaplarını sil:** denemede 4 anonim hesap açıldı, genel liderlikte görünüyorlar: "Deneme B1" (2 adet) ve "Deneme B2" (2 adet). Service key ile silebilir misin? — bekliyor
- [ ] 13.11 16:20 — **Sorular hâlâ test verisi:** `sayisal`'da sorular "[TEST] matematik_ayt örnek soru 2", şıklar "Seçenek E" gibi geliyor. Demo öncesi gerçek soruların yüklenmesi gerekiyor (SORU-EKLEME.md). — bekliyor
- [ ] 13.11 16:45 — **LGS soruları 4 şıklı olmalı, E null gelsin; submit_answer LGS sorusunda E'yi reddetsin.** Şu an LGS tablolarında `secenek_e text not null` (0003), `dogru_sik` E'ye izin veriyor, `seed-test-questions.ts` her tabloya "Seçenek E" yazıyor ve `submit_answer` LGS'de E'yi kabul ediyor. Öneri: LGS tablolarında `secenek_e` null olabilsin ve boş kalsın, `dogru_sik in ('A','B','C','D')`, `get_question` LGS'de `E: null` dönsün, `submit_answer` `games.sinav = 'lgs'` iken E gelirse 'Geçersiz şık' fırlatsın. Arayüz LGS'de E'yi zaten göstermiyor (dolu gelse bile). — bekliyor
- [ ] 13.11 17:30 — **Pre-commit hook'ta `src/lib/ses/` izni:** ses sistemi (Web Audio, dosyasız) için istenen yer `src/lib/ses/` ama frontend hook'u `src/lib/` altında yalnızca `client.ts` ve `api.mock.ts`'e izin veriyor. Şimdilik `src/hooks/ses/` altına koydum (motor.ts, muzik.ts, efektler.ts). İstersen `.githooks/pre-commit` frontend listesine `src/lib/ses/` ekle, ben taşırım. — bekliyor
- [x] 13.11 19:10 — **Soru incelemesi: `QuestionReview` + `QuizoraApi.getGameReview(gameId)`.** Arayüz hazır (sonuç ekranı "Soruları incele"); mock'ta çalışıyor. Gerçek API'de bu metot olunca `client.ts` otomatik ona bağlanıyor. types.ts'e eklerken lütfen şu şekli kullan (şu an `src/lib/client.ts`'te geçici duruyor): — gerek kalmadı: types.ts'teki GameReview / ReviewItem kullanılıyor (14.11)
  ```ts
  export interface QuestionReview {
    index: number                     // 0..9
    subject: string                   // ders etiketi, ör. "Matematik (AYT)"
    exam: Sinav
    text: string
    imageUrl?: string | null
    options: Partial<Record<Secenek, string>>   // LGS'de E yok
    correctOption: Secenek
    myAnswer: Secenek | null          // null = boş
    isCorrect: boolean
    pointsEarned: number              // +100..+200 / -25 / 0
    timeMs: number | null             // cevaplanmadıysa null
    explanation: string | null        // "Neden doğru?" metni
  }
  getGameReview(gameId: string): Promise<QuestionReview[]>   // yarış bitmeden: Error('Yarış henüz bitmedi')
  ```
- [ ] 14.11 10:30 — **"Hemen Katıl" (hızlı eşleşme) için tipler gerekiyor; arayüz bunları bekliyor.** `main` ve `origin/backend`'de (c387a35) `quickJoin`, `startIfReady`, `leaveGame`, `isPublic`, `autoStartAt` henüz yok. `src/types.ts`'e eklenip main'e birleşince mock + arayüzü alan adlarına birebir uyarak yapacağım. Beklediğim şekil (isimler senin kararın, sadece ihtiyaç listesi): — bekliyor
  - `QuizoraApi.quickJoin(kategori: Kategori)` → halka açık uygun bir lobiye ekler ya da yenisini açar; dönüş en az `{ gameId, code }`.
  - `QuizoraApi.startIfReady(gameId)` → `autoStartAt` geldiyse ve yeterli oyuncu varsa oyunu başlatır (birden çok istemci aynı anda çağırabilir, idempotent olmalı).
  - `QuizoraApi.leaveGame(gameId)` → lobiden çık (lobi boşalırsa ne olacağı).
  - `GameInfo.isPublic: boolean` ve `GameInfo.autoStartAt: string | null` (ISO, sunucu saati).
  - auto_start kuralları (kaç oyuncuda kaç sn, yeni oyuncu katılınca süre uzuyor mu, üst sınır) ve hata mesajları; mock'u birebir aynı kurallarla yazacağım.

- [x] 14.11 — **"Yanlışlarım defteri" için backend gerekiyor; arayüz geçici katmanla (`src/hooks/defter.ts`, bellekte mock) hazırlanıyor.** Hook `src/lib/defter.ts`'e izin vermediği için dosya `src/hooks/` altında. Tipler ve metotlar gelince sayfalar `api`'ye bağlanacak. Kullandığım şekil (isimler senin kararın; değişirse birebir uyarım): — tamam (0010 + types.ts; arayüz api'ye bağlandı)
  - `MistakeSummary { total, resolvedTotal, bySubject: [{ exam, subject, count }] }`
  - `MistakeItem { questionId, exam, subject, text, imageUrl?, options (LGS'de E yok), lastAnswer (null = boş), wrongCount, lastWrongAt }`; doğru şık ve açıklama listede DÖNMEZ.
  - `PracticeResult { isCorrect, correctOption, explanation (null olabilir), resolved }`
  - `getMistakeSummary()`, `getMistakes({ exam?, subject?, limit? })` (lastWrongAt azalan), `practiceAnswer(questionId, selected)` (doğruysa defterden düşer, resolvedTotal artar; yanlışsa wrongCount++), `removeMistake(questionId)`.
  - Kural: `finish_game` sırasında oyuncunun yanlış ve boş soruları deftere eklensin (aynı soru tekrar gelirse wrongCount++). Mock bunu sonuç ekranında `getGameReview` verisinden yapıyor.

- [x] 14.11 — **"Akıllı analiz" / Performansım için backend gerekiyor; arayüz geçici katmanla (`src/hooks/performans.ts`, bellekte mock) hazır.** Hook `src/lib/`'e izin vermediği için dosya `src/hooks/` altında. Maç analizi (sonuç ekranı) backend istemiyor, `getGameReview` verisinden hesaplanıyor. Kullandığım şekil (isimler senin kararın; değişirse birebir uyarım): — tamam (0011 + types.ts; arayüz api'ye bağlandı)
  - `getPerformance({ exam?, days? })` → `PerformanceStats` (`days`: 7 ya da 30; `exam` yoksa iki sınav birlikte).
  - `PerformanceStats { totals: { games, answered, correct, wrong, blank, avgTimeMs, accuracy }, bySubject: [{ exam, subject, answered, correct, accuracy, avgTimeMs }], byTopic: [{ exam, subject, topic, answered, correct, accuracy, lowSample? }], daily: [{ date: 'YYYY-MM-DD', answered, correct }] (son 7 gün, eskiden yeniye, oynanmayan gün 0), streakDays }`.
  - `accuracy` 0-100 tam sayı (yüzde). `subject` defterdeki gibi sınav ekli (`"Fizik (AYT)"`), böylece "Çalış →" `getMistakes({ subject })`'e aynen verilebiliyor.
  - `topic` için soru tablolarında konu sütunu gerekiyor (şu an yok sanırım). `lowSample`: az cevaplı konu (bende < 4), arayüz bunları "zorlandığın konular"da atlıyor.
  - `streakDays`: bugünden geriye kesintisiz en az bir soru cevaplanan gün sayısı (sunucu saatiyle).
