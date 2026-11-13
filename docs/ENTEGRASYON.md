# Entegrasyon rehberi (Kişi B için)

Backend hazır: şema, RPC'ler, `src/lib/api.ts`. Arayüz yalnızca `QuizoraApi`'yi (`src/types.ts`) çağırır; Supabase'i doğrudan kullanmaz. Davranış kuralları `docs/PROJE.md` içindedir; bu belge "hangi sırayla hangi fonksiyonu çağırırım" sorusunu yanıtlar.

## 1. Kurulum
`.env.local` (repoya girmez):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_USE_MOCK=false
```
`VITE_USE_MOCK=true` iken `src/lib/client.ts` (senin dosyan) mock'u, `false` iken gerçek api'yi vermeli:
```ts
// src/lib/client.ts
import type { QuizoraApi } from '../types'
import { api as gercekApi } from './api'
import { mockApi } from './api.mock'
export const api: QuizoraApi = import.meta.env.VITE_USE_MOCK === 'true' ? mockApi : gercekApi
```
Sayfalarda hep şu içe aktarma kullanılır:
```ts
import { api } from '../lib/client'
import { remainingMs, scorePoints } from '../lib/scoring' // salt okunur; dosyayı değiştirme
```
`gercekApi` ilk çağrıda oluşur; env eksikse ilk çağrı "Supabase ayarı eksik: …" hatası fırlatır.

## 2. Sınav ve kategori seçimi
Arayüz **önce sınav türünü** (`Sinav = 'yks' | 'lgs'`), sonra kategoriyi seçtirir:

| Sınav | Kategori kimliği | Gösterim | Dersler |
|---|---|---|---|
| YKS | `sayisal` | Sayısal | Fizik, Kimya, Biyoloji, Matematik (AYT) |
| YKS | `esit_agirlik` | Eşit Ağırlık | Tarih, Coğrafya, Felsefe, Din Kültürü, Matematik, Edebiyat (AYT) |
| YKS | `sozel` | Sözel | Edebiyat, Tarih, Coğrafya, Felsefe, Din Kültürü (AYT) |
| YKS | `tyt` | TYT | Türkçe, Matematik, Kimya, Fizik, Biyoloji, Tarih, Coğrafya, Felsefe, Din Kültürü |
| LGS | `lgs_sozel` | Sözel oturum | Türkçe, T.C. İnkılap Tarihi ve Atatürkçülük, Din Kültürü ve Ahlak Bilgisi, İngilizce |
| LGS | `lgs_sayisal` | Sayısal oturum | Matematik, Fen Bilimleri |

```ts
const { gameId, code } = await api.createGame('lgs_sozel') // Kategori kimliği
```
`GameInfo.sinav` sunucudan gelir (`'lgs'` ya da `'yks'`); kendin türetme. Ders adı her soruda hazır etiketle gelir: `Question.ders` (örn. `"Fen Bilimleri (LGS)"`), dönüştürmen gerekmez.

## 3. Oyun akışı (sırayla)
1. **`ensureSession()`**: uygulama açılışında bir kez. Aynı tarayıcıda aynı kullanıcıyı döndürür.
2. **`getProfile()`**: `null` ise `/profil` ekranı → **`saveProfile({ displayName, avatarKey, photoFile? })`**.
3. **`getMyStats()`**: menüde rank rozeti ve ilerleme çubuğu için.
4. **`createGame(kategori)`** (host) veya **`joinGame(code)`** (diğerleri) → `gameId`.
5. **`getGameByCode(code)`** ile ilk durum + **`subscribeGame(gameId, cb)`** ile canlı lobi.
6. Host **`startGame(gameId)`**. `status` `'playing'` olur, `startedAt` = şimdi + 3 sn.
7. **Geri sayım:** `startedAt`'e göre 3-2-1 (aşağıdaki "Sayaç" bölümü).
8. **Her soru için:** `getQuestion(gameId, position)` → oyuncu seçer → `submitAnswer(gameId, position, secenek)` → doğru/yanlış animasyonu + puan (~2 sn) → sonraki soru.
9. **10. sorudan sonra:** bekleme ekranı (puanın sabit, sıralama canlı).
10. **Süre dolunca ya da herkes bitince** `finishGame(gameId)` → sonuç ekranı.
11. **Menüye dönünce** yeniden `getMyStats()` (rank/XP güncel görünsün).

```ts
// Soru döngüsü (özet)
for (let pos = benimCurrentQ; pos < 10; pos++) {
  const soru = await api.getQuestion(gameId, pos)      // süre sayacı sunucuda burada başlar
  const secenek = await oyuncuSecsin(soru)             // süre dolduysa null (boş)
  const sonuc = await api.submitAnswer(gameId, pos, secenek)
  await animasyon(sonuc)                               // ~2 sn; sonuc.correctOption doğru şık
  if (sonuc.finished) break                            // 10. soru bitti
}
```
**Şık sayısı sabit değildir:** YKS soruları 5 şıklıdır (A-E), **LGS soruları 4 şıklıdır (A-D)**. `Question.options` bu yüzden `Partial<Record<Secenek, string>>`dir ve LGS sorularında `E` anahtarı **hiç gelmez**. **Şıkları sabit 5 değil, gelen anahtarlara göre çiz:**
```ts
const siklar = (Object.entries(soru.options) as Array<[Secenek, string]>).sort(([a], [b]) => a.localeCompare(b))
siklar.map(([harf, metin]) => <SecenekDugmesi key={harf} harf={harf} metin={metin} />)
```
Gelmeyen şıkkı (LGS'de E) boş düğme olarak gösterme ve gönderme; gönderirsen `Geçersiz şık` hatası alırsın. `submitAnswer` sonucundaki `correctOption` her zaman o sorunun şıklarından biridir.

`getQuestion` aynı soru için tekrar çağrılabilir (sayfa yenileme); süre **sıfırlanmaz**. Doğru şık yalnızca `submitAnswer` sonucunda (`correctOption`) gelir.

## 4. Sayaç ve 2× modu
```ts
const offset = await api.getServerOffsetMs() // oyun ekranına girerken bir kez
// Her 100-250 ms:
const kalanMs = remainingMs(snapshot.game, Date.now() + offset)
const saniye = Math.ceil(kalanMs / 1000)
```
- `snapshot.game.speedupAt !== null` ise 2× modu açıktır; `remainingMs` bunu zaten hesaplar (iki kat hızlı azalır). Efektleri bu koşulla aç.
- "X bitirdi, süre 2× hızlı akıyor": `snapshot.players.find(p => p.userId === snapshot.game.speedupBy)?.displayName`.
- **Geri sayım (3-2-1):** `Math.ceil((new Date(game.startedAt).getTime() - (Date.now() + offset)) / 1000)`; ≤ 0 olunca `/oyun/:code`'a geç.
- Süre dolunca cevaplanmayan sorular boş sayılır: kendi `currentQ`'dan sonrasını göndermene gerek yok, doğrudan `finishGame` çağır.

## 5. XP ve rank
- **Menü:** `MyStats` = `{ xp, rankKey, rankLabel, nextRankLabel, xpToNext, progressPct, wins, gamesPlayed }`. Çubuk: `progressPct` (0-100). Efsane'de `nextRankLabel` ve `xpToNext` `null`, `progressPct` 100'dür.
- **Lobi ve oyun sıralaması:** `PlayerState.rankLabel` / `rankKey` rozet için.
- **Sonuç ekranı:** `GameResult.ranking[i]` (`RankedPlayer`):
  - XP çubuğu animasyonu: `xpBefore → xpAfter`.
  - `rankedUp === true` ise rank atlama animasyonu: `rankLabelBefore → rankLabelAfter`.
  - Çağıran oyuncunun dökümü `GameResult.xpBreakdown`: `participation` (katılım), `points` (puan), `placement` (yerleşim), `firstFinisher` (ilk bitiren), `total` (toplam = `xpGained`).
- **Genel liderlik:** `getGlobalLeaderboard()` / `subscribeGlobalLeaderboard(cb)` → `GlobalRow[]` (`xp`, `rankLabel`, `wins`, `gamesPlayed`), XP'ye göre sıralı, ilk 20.
- Cevap vermeyen oyuncu 0 XP alır; tek oyunculu yarış XP vermez (yalnızca geliştirme modunda mümkün).

```ts
const ben = sonuc.ranking.find(r => r.userId === benimId)!
animeEtXpCubugu(ben.xpBefore, ben.xpAfter)
if (ben.rankedUp) animeEtRankAtlama(ben.rankLabelBefore, ben.rankLabelAfter)
```

## 6. Puan alanları
- `AnswerResult.points`: doğru `+100…+200`, yanlış `−25`, boş `0`. `newScore` toplam puandır.
- `GameResult.breakdown`: `base` (100 × doğru), `bonus` (hız bonusu), `penalty` (**pozitif sayı**; ekranda "−125" diye eksi ile göster), `correct`, `wrong`, `blank` (cevaplanmayan). `base + bonus − penalty = puan`.
- Puan yalnızca önizleme için istemcide hesaplanabilir (`scorePoints`); asıl puan sunucudan gelir.

## 7. Sayfa yenileme sonrası devam
`/oyun/:code` ve `/lobi/:code` açılırken önce `getGameByCode(code)` çağır, sonra duruma göre yönlendir:
```ts
const snap = await api.getGameByCode(code)
const ben = snap.players.find(p => p.userId === benimId)!
if (snap.game.status === 'lobby')   goLobi()
else if (snap.game.status === 'finished') goSonuc()            // finishGame tekrar çağrılabilir
else if (ben.finished)              goBeklemeEkrani()          // 10. soruyu bitirmiş
else                                devamEt(ben.currentQ)      // currentQ = sıradaki soru (0-9)
```
`finishGame` **idempotenttir**: oyun bittikten sonra kaç kez ve kim çağırırsa çağırsın aynı sonucu döndürür, XP tekrar eklenmez.

## 7b. Hemen Katıl (hızlı eşleşme)
Oda kurmadan ve kod girmeden yarışa girmek için. Menüde kategori seçilir, "Hemen Katıl" → `quickJoin(kategori)`:
```ts
const { gameId, code, created } = await api.quickJoin(kategori) // sunucu: uygun lobiye ekler ya da yenisini açar
navigate(`/lobi/${code}`)
```
- Eşleşme yalnızca AYNI kategoride olur. Yalnızca `quickJoin` lobileri herkese açıktır (`game.isPublic`); `createGame` (özel lobi) ve kodla katılım aynen çalışır.
- Herkese açık lobide host beklenmez. `game.autoStartAt` null iken (tek oyuncu) "Rakip aranıyor" göster. 2. oyuncu girince sunucu `autoStartAt = şimdi + 10 sn` yazar, 5. oyuncuda `şimdi`. 2'nin altına düşerse yeniden null olur. Geri sayımı `autoStartAt`'e ve sunucu saatine (`getServerOffsetMs`) göre çiz.
- **`startIfReady(gameId)` ne zaman çağrılır:** `autoStartAt` süresi dolunca (geri sayım 0), her istemci çağırır; 500 ms arayla birkaç kez (örn. `status` `playing` olana ya da 5 deneme). Hata yutulabilir. Koşullar sağlanmıyorsa hiçbir şey yapmaz, birden çok istemcinin aynı anda çağırması güvenlidir; oyun bir kez başlar. Başlayınca her zamanki gibi `status='playing'` + `startedAt` (≈ +3 sn) ile 3-2-1 geri sayımı.
```ts
async function otomatikBaslat(gameId: string) {
  for (let i = 0; i < 6; i++) {
    try { await api.startIfReady(gameId) } catch { /* yut */ }
    await new Promise((r) => setTimeout(r, 500))
  }
}
```
- **`leaveGame(gameId)`:** lobide geri düğmesi ya da sayfa kapanışında çağır (en iyi çaba; başarısız olabilir). Başlamış oyunda 'Oyun başladı' hatası verir, yut. Kimse kalmazsa oyun silinir; host ayrılırsa host devredilir (`hostId` değişir).
- Kodla katılırken herkese açık lobide geri sayım bittiyse 'Oyun başlamak üzere' hatası gelir (tablo bölüm 10): "Yarış başlamak üzere, yeni bir lobi dene" göster; `quickJoin` yeni lobi açar.
- Aynı kullanıcı arka arkaya `quickJoin` yaparsa aynı lobiyi alır (`created=false`).

## 8. `finishGame` ne zaman çağrılır
`remainingMs ≤ 0` olduğunda **veya** tüm oyuncular `finished` olduğunda. Birden fazla istemcinin aynı anda çağırması güvenlidir. Saat farkı yüzünden bazen sunucu henüz bitmedi diyebilir; kısa süre yeniden dene:
```ts
async function bitir(gameId: string): Promise<GameResult> {
  for (let deneme = 0; ; deneme++) {
    try {
      return await api.finishGame(gameId)
    } catch (e) {
      const yeniden = e instanceof Error && e.message === 'Yarış henüz bitmedi' && deneme < 5
      if (!yeniden) throw e
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}
```

## 8b. Yarış sonrası soru incelemesi (`getGameReview`)
Sonuç ekranındaki soru şeritleri için. Doğru şık ve çözüm açıklaması yarış `finished` olmadan HİÇBİR yoldan istemciye gelmez; bu çağrı yalnızca bitmiş oyunda çalışır ve oyunu bitirmez.

**Ne zaman çağrılır:** `finishGame` döndükten sonra ya da `snapshot.game.status === 'finished'` iken (örn. sayfa yenilenince). `'Yarış henüz bitmedi'` hatasında 500 ms sonra yeniden dene, en çok 5 kez:
```ts
async function incelemeAl(gameId: string): Promise<GameReview> {
  for (let deneme = 0; ; deneme++) {
    try {
      return await api.getGameReview(gameId)
    } catch (e) {
      const yeniden = e instanceof Error && e.message === 'Yarış henüz bitmedi' && deneme < 5
      if (!yeniden) throw e
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}
```

**Dönüş:** `{ items: ReviewItem[] }`, `position` (0-9) sırasıyla; yalnızca ÇAĞIRAN oyuncunun cevapları. Her öğe:
| Alan | Anlam |
|---|---|
| `position` | 0-9 (arayüzde 1-10 göster) |
| `ders` | "Fizik (AYT)", "Fen Bilimleri (LGS)" gibi etiket |
| `text`, `imageUrl` | Soru metni, varsa görsel |
| `options` | **Yalnızca gelen anahtarlar** (YKS A-E, LGS A-D); sabit 5 şık varsayma, `Object.entries(options)` ile çiz |
| `selected` | Oyuncunun seçtiği şık; cevap vermediyse `null` |
| `correctOption` | Doğru şık |
| `outcome` | `'correct'` (seçilen = doğru), `'wrong'` (seçilen ≠ doğru), `'blank'` (cevap yok / `selected` null) |
| `points` | O sorudan aldığı puan (doğru 100-200, yanlış −25, boş 0) |
| `timeMs` | Cevap süresi (ms); boşta `null` |
| `explanation` | 1-2 cümlelik çözüm; `null` olabilir → "açıklama henüz eklenmedi" göster |

- Toplamlar `finishGame` ile tutarlıdır: `outcome` sayıları `breakdown.correct/wrong/blank`, `points` toplamı oyuncunun puanı.
- Silinmiş bir soru varsa o pozisyon listede olmaz (10'dan az öğe gelebilir); hata vermez.
- **Hatalar:** `Yarış henüz bitmedi` (yukarıdaki yeniden deneme), `Bu oyuna erişimin yok` (üye değil), `Oturum yok`, `Bağlantı hatası, tekrar dene`.

## 8c. Yanlışlarım defteri
Yarış bitince yanlış ve boş bırakılan sorular otomatik olarak oyuncunun **defterine** girer (`finishGame` içinde, yarış başına bir kez). Oyuncu defterini istediği zaman açıp o soruları tek tek yeniden çözebilir. Yarışta hiç **görmediği** sorular (yarışı erken bırakırsa) deftere girmez.

```ts
const ozet = await api.getMistakeSummary()
// { total, resolvedTotal, bySubject: [{ exam: 'yks'|'lgs', subject: 'Fizik (AYT)', count }] }  (yalnızca çözülmemişler sayılır)

const sorular = await api.getMistakes({ exam: 'yks', subject: 'Fizik (AYT)', limit: 50 }) // hepsi isteğe bağlı
// MistakeItem[]: { questionId, exam, subject, text, imageUrl, options, lastAnswer, wrongCount, lastWrongAt }  (en yeni önce)

const r = await api.practiceAnswer(soru.questionId, 'C')
// { isCorrect, correctOption, explanation, resolved }
await api.removeMistake(soru.questionId) // oyuncu "defterimden çıkar" derse
```
- **Sonuç ekranı:** `getGameReview(...).addedToNotebook` = bu yarıştan deftere giren soru sayısı ("N soru Yanlışlarım defterine eklendi" göster; 0 ise gösterme).
- **`getMistakes` doğru şık ve açıklama içermez.** Önce oyuncu bir şık seçer, `practiceAnswer` doğru şıkkı ve çözüm açıklamasını (`explanation`, null olabilir → "açıklama henüz eklenmedi") döndürür.
- `practiceAnswer`: doğruysa soru **çözüldü** sayılır (`resolved: true`, listeden ve sayımdan çıkar); yanlışsa `wrongCount` artar ve soru defterde kalır (aynı oturumda tekrar denenebilir; bir sonraki `getMistakes` çağrısı güncel `lastAnswer`'ı verir).
- Soru sonraki bir **yarışta** doğru yapılırsa da otomatik çözülür; çözülmüş soru tekrar yanlış yapılırsa deftere geri döner.
- `options`: YKS 5 şık, LGS 4 şık — yine **gelen anahtarlara göre** çiz. `lastAnswer` null = soru boş bırakılmıştı. `subject` hem görüntü hem filtre değeridir (`bySubject`'taki metni aynen `getMistakes({ subject })`'e ver).
- `exam` yalnızca `'yks' | 'lgs'`. Liste boşsa "Defterin boş" ekranı göster.
- **Hatalar:** `Bu soru defterinde yok` (soru zaten çözülmüş/çıkarılmış ya da başkasının), `Geçersiz şık`, `Geçersiz sınav`, `Soru bulunamadı` (soru yöneticiler tarafından silinmiş), `Oturum yok`, `Bağlantı hatası, tekrar dene`.

## 9. Abonelikler
```ts
useEffect(() => {
  const durdur = api.subscribeGame(gameId, (snap) => setSnapshot((onceki) => { animasyonIcinKarsilastir(onceki, snap); return snap }))
  return durdur // unmount'ta MUTLAKA çağır
}, [gameId])
```
- Callback **ilk çağrıda hemen** veri alır; sonra her değişimde **tam durum** (fark değil) gelir.
- Satır yer değiştirme animasyonu için önceki ve yeni sıralamayı kendin karşılaştır (`rankPlayers` `scoring.ts`'te).
- Kanal koparsa kendiliğinden yeniden bağlanır; ayrıca 3 sn'de bir durum yenilenir. "Bağlantı koptu" bandı için ek bir şey yapman gerekmez (istersen `callback`'in uzun süre gelmemesini kullan).
- `subscribeGlobalLeaderboard(cb)` aynı şekilde çalışır (`Unsubscribe` döndürür).

## 10. Hata mesajları
Her hata `Error.message` içinde **Türkçe** gelir; olduğu gibi gösterebilirsin.

| Mesaj | Ne zaman çıkar | Önerilen davranış |
|---|---|---|
| `Kod bulunamadı` | Yanlış/olmayan lobi kodu (`joinGame`, `getGameByCode`) | Kod alanında hata göster |
| `Lobi dolu` | 5 oyuncu varken `joinGame` | "Lobi dolu" + menüye dön |
| `Oyun başladı` | Başlamış oyuna yeni oyuncu `joinGame` | "Oyun zaten başladı" |
| `Oyun başlamak üzere` | Herkese açık lobide geri sayım bitmiş, kodla `joinGame` | "Yarış başlamak üzere"; `quickJoin` ile yeni lobiye gir |
| `Oyun zaten başladı` | Host ikinci kez `startGame` | Yok say |
| `Sadece host başlatabilir` | Host olmayan `startGame` | Başlat düğmesi yalnızca host'ta görünmeli |
| `En az X oyuncu gerekli` | Yetersiz oyuncuyla `startGame` (X = 2) | Başlat'ı pasif tut, mesajı göster |
| `Önce profil oluştur` | Profilsiz `createGame`/`joinGame` | `/profil`'e yönlendir |
| `Geçersiz kategori` | Tanımsız kategori kimliği | Programlama hatası; kimliği kontrol et |
| `Bu kategori için yeterli soru yok: <tablo>` | O kategori için soru tablosu boş/az | "Bu kategori şu an hazır değil"; başka kategori seçtir |
| `Oyun başlamadı` | Lobide ya da 3 sn geri sayım bitmeden `getQuestion`/`submitAnswer` | Geri sayımı bekle |
| `Süre doldu` | Süre bittikten sonra `getQuestion` | `finishGame`'e geç |
| `Sıra dışı soru` | Beklenen `currentQ` dışında pozisyon | Snapshot'taki `currentQ`'ya dön |
| `Bu soru zaten cevaplandı` | Aynı soruya ikinci `submitAnswer` (çift tıklama) | Yok say, sonraki soruya geç |
| `Önce soruyu getir` | `getQuestion` çağrılmadan `submitAnswer` | Önce `getQuestion` |
| `Geçersiz şık` | A-E dışında bir şık, ya da soruda olmayan şık (LGS sorularında `E`) | Programlama hatası: yalnızca `soru.options`'ta bulunan anahtarlar gönderilmeli |
| `Yarış henüz bitmedi` | Süre dolmadan/herkes bitmeden `finishGame` | 500 ms sonra yeniden dene (en çok 5) |
| `Yarış henüz bitmedi` (`getGameReview`) | Oyun `finished` olmadan inceleme istendi | 500 ms sonra yeniden dene (en çok 5); bölüm 8b |
| `Bu soru defterinde yok` | `practiceAnswer`/`removeMistake`: soru zaten çözülmüş, çıkarılmış ya da defterde değil | Listeyi yenile (`getMistakes`) |
| `Geçersiz sınav` | `getMistakes({ exam })` değeri `'yks'`/`'lgs'` dışında | Programlama hatası |
| `Soru bulunamadı` | `practiceAnswer`: soru veritabanından silinmiş | Listeyi yenile; soru zaten listede görünmez |
| `Oyun bitti` | Biten oyunda `getQuestion`/`submitAnswer` | Sonuç ekranına git |
| `Bu oyuna erişimin yok` | Üye olmayan biri oyun verisi ister | Menüye dön; kodla `joinGame` dene |
| `Oyun bulunamadı` | Olmayan `gameId` | Menüye dön |
| `Oturum yok` | Oturum açılmadan çağrı / oturum bitti | `ensureSession()`'ı çağırıp işlemi tekrarla |
| `Bağlantı hatası, tekrar dene` | Ağ kesildi / zaman aşımı | "Tekrar dene" düğmesi; otomatik yeniden deneme |
| `Çok fazla deneme yapıldı, biraz bekleyip tekrar dene` | Supabase hız sınırı (ör. aynı IP'den çok sayıda yeni anonim giriş) | Birkaç saniye sonra otomatik yeniden dene; sürerse yöneticiye haber ver (`docs/YAYIN.md`) |
| `İsim 2-20 karakter olmalı` | `saveProfile` isim doğrulaması | Form hatası |
| `Fotoğraf çok büyük` | `saveProfile`, fotoğraf > 5 MB | Form hatası |

## 11. Test için
- `npx tsx scripts/e2e-sim.ts` bu akışın tamamını sanal oyuncularla otomatik uygular; arayüzünde ne beklenmesi gerektiğinin canlı örneğidir (`--oyuncu 5`, `--kategori lgs_sozel` seçenekleri var).
- Demoda rank atlamayı göstermek için: `npx tsx scripts/xp-ayarla.ts "<oyuncu adı>" 95` (Bronz I eşiği 100 XP). **Yalnızca demo hazırlığı içindir.**
- Soru yoksa kategori kurulamaz: durumu görmek için `npx tsx scripts/soru-durumu.ts`; soru yükleme `docs/SORU-EKLEME.md`'de.
