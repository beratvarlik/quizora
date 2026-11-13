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
