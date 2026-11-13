// Tüm backend testlerini sırayla çalıştırır ve tek bir özet tablo verir.
// Kullanım:
//   npx tsx scripts/hepsi.ts            (çıktılar toplanır; yalnızca kalan adımın çıktısı gösterilir)
//   npx tsx scripts/hepsi.ts --canli    (her adımın çıktısı canlı akar)
// Süre: yaklaşık 8-12 dakika. Önce: npx tsx scripts/seed-test-questions.ts (24 tabloda soru olmalı)
import { spawn } from 'node:child_process'

interface Adim {
  ad: string
  dosya: string
  args: string[]
  zamanAsimiMs: number
}

const DAKIKA = 60_000
const ADIMLAR: Adim[] = [
  { ad: 'check-schema', dosya: 'check-schema.ts', args: [], zamanAsimiMs: 3 * DAKIKA },
  { ad: 'rpc-smoke', dosya: 'rpc-smoke.ts', args: [], zamanAsimiMs: 6 * DAKIKA },
  { ad: 'api-smoke', dosya: 'api-smoke.ts', args: [], zamanAsimiMs: 3 * DAKIKA },
  { ad: 'e2e-sim (2 oyuncu: sayisal, lgs_sozel, lgs_sayisal)', dosya: 'e2e-sim.ts', args: [], zamanAsimiMs: 8 * DAKIKA },
  { ad: 'e2e-sim (5 oyuncu)', dosya: 'e2e-sim.ts', args: ['--oyuncu', '5'], zamanAsimiMs: 8 * DAKIKA },
  { ad: 'security-test', dosya: 'security-test.ts', args: [], zamanAsimiMs: 6 * DAKIKA },
  { ad: 'soru-durumu', dosya: 'soru-durumu.ts', args: [], zamanAsimiMs: 3 * DAKIKA },
]

const canli = process.argv.includes('--canli')

interface Sonuc {
  ad: string
  gecti: boolean
  sureMs: number
  ozet: string
  cikti: string
}

// Çıktının anlamlı son satırı (örn. "OK — tüm adımlar geçti", "TÜM TESTLER GEÇTİ")
function ozetSatiri(cikti: string, gecti: boolean): string {
  const satirlar = cikti.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const isaretli = [...satirlar].reverse().find((s) => /^(OK\b|TÜM |HATA|\d+ ADIM KALDI)/.test(s))
  if (isaretli) return isaretli
  return satirlar[satirlar.length - 1] ?? (gecti ? '' : 'çıktı yok')
}

function calistir(adim: Adim): Promise<Sonuc> {
  return new Promise((coz) => {
    const t0 = Date.now()
    let cikti = ''
    // node'u doğrudan başlat (npx/kabuk yok): zaman aşımında süreç gerçekten sonlanır
    const cocuk = spawn(process.execPath, ['--import', 'tsx', `scripts/${adim.dosya}`, ...adim.args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let zamanAsimi = false
    const sayac = setTimeout(() => {
      zamanAsimi = true
      cocuk.kill()
    }, adim.zamanAsimiMs)

    const topla = (parca: Buffer): void => {
      const metin = parca.toString('utf8')
      cikti += metin
      if (canli) process.stdout.write(metin)
    }
    cocuk.stdout.on('data', topla)
    cocuk.stderr.on('data', topla)
    cocuk.on('error', (e) => {
      clearTimeout(sayac)
      coz({ ad: adim.ad, gecti: false, sureMs: Date.now() - t0, ozet: `başlatılamadı: ${e.message}`, cikti })
    })
    cocuk.on('close', (kod) => {
      clearTimeout(sayac)
      const gecti = kod === 0 && !zamanAsimi
      const hizSiniri = !gecti && /rate limit/i.test(cikti)
      const ozet = zamanAsimi
        ? `ZAMAN AŞIMI (${Math.round(adim.zamanAsimiMs / 1000)} sn)`
        : hizSiniri
          ? 'ORTAM SORUNU: Supabase anonim giriş sınırı (kod hatası değil)'
          : ozetSatiri(cikti, gecti)
      coz({ ad: adim.ad, gecti, sureMs: Date.now() - t0, ozet, cikti })
    })
  })
}

async function main(): Promise<void> {
  console.log(`${ADIMLAR.length} adım çalışacak (yaklaşık 8-12 dakika)...\n`)
  const sonuclar: Sonuc[] = []
  for (const adim of ADIMLAR) {
    console.log(`>>> ${adim.ad}`)
    const s = await calistir(adim)
    sonuclar.push(s)
    console.log(`${s.gecti ? 'geçti' : 'KALDI'} — ${s.ad} (${(s.sureMs / 1000).toFixed(1)} sn)`)
    if (!s.gecti && !canli) {
      // Kalan adımın çıktısının sonunu göster (ayrıntı için tamamı değil, son 30 satır)
      const son = s.cikti.split(/\r?\n/).filter((l) => l.trim() !== '').slice(-30)
      console.log(son.map((l) => `    | ${l}`).join('\n'))
    }
    console.log('')
  }

  // ---- Özet tablo ----
  const adGenislik = Math.max(4, ...sonuclar.map((s) => s.ad.length))
  console.log('ÖZET')
  console.log(`${'ADIM'.padEnd(adGenislik)}  SONUÇ  SÜRE (sn)  NOT`)
  console.log(`${'-'.repeat(adGenislik)}  -----  ---------  ---`)
  for (const s of sonuclar) {
    console.log(`${s.ad.padEnd(adGenislik)}  ${(s.gecti ? 'geçti' : 'KALDI').padEnd(5)}  ${(s.sureMs / 1000).toFixed(1).padStart(9)}  ${s.ozet.slice(0, 80)}`)
  }
  const toplamSn = sonuclar.reduce((t, s) => t + s.sureMs, 0) / 1000
  console.log(`\nToplam süre: ${Math.floor(toplamSn / 60)} dk ${Math.round(toplamSn % 60)} sn`)

  const kalanlar = sonuclar.filter((s) => !s.gecti)
  if (kalanlar.length > 0) {
    console.error(`\n${kalanlar.length} ADIM KALDI: ${kalanlar.map((s) => s.ad).join(', ')}`)
    if (kalanlar.some((s) => /rate limit/i.test(s.cikti))) {
      console.error(
        '\nNOT: "Request rate limit reached" Supabase Auth\'un anonim giriş sınırıdır (varsayılan: IP başına saatte 30). ' +
          'Tüm paket 30\'dan fazla anonim kullanıcı oluşturur. Çözüm: Supabase → Authentication → Rate Limits → ' +
          'anonim giriş sınırını yükselt (ör. 500), ya da sınır sıfırlanana kadar (en çok 1 saat) bekle; sonra tekrar çalıştır. ' +
          'Etkinlikte aynı Wi-Fi\'den çok oyuncu girecekse bu sınır orada da yükseltilmeli (docs/YAYIN.md).',
      )
    }
    process.exit(1)
  }
  console.log('\nHEPSİ GEÇTİ')
}

main().catch((e) => {
  console.error(`HATA: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
