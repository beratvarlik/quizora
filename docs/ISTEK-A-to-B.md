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
