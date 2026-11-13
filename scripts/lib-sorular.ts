// Soru araçlarının (import-questions.ts, soru-durumu.ts) ortak sabitleri.
// Kategori dağılımı docs/PROJE.md ve supabase/migrations/0003_lgs_xp.sql (create_game) ile aynı olmalı.

export const YKS_TABLOLARI = [
  'matematik_tyt', 'turkce_tyt', 'kimya_tyt', 'fizik_tyt', 'biyoloji_tyt',
  'tarih_tyt', 'cografya_tyt', 'felsefe_tyt', 'din_kulturu_tyt',
  'fizik_ayt', 'kimya_ayt', 'biyoloji_ayt', 'matematik_ayt', 'edebiyat_ayt',
  'tarih_ayt', 'cografya_ayt', 'felsefe_ayt', 'din_kulturu_ayt',
] as const

export const LGS_TABLOLARI = [
  'turkce_lgs', 'inkilap_lgs', 'din_kulturu_lgs', 'ingilizce_lgs', 'matematik_lgs', 'fen_lgs',
] as const

export const TUM_TABLOLAR: readonly string[] = [...YKS_TABLOLARI, ...LGS_TABLOLARI]

// Kategori → { tablo: oyuna çekilecek soru adedi } (toplam 10)
export const KATEGORI_DAGILIMI: Record<string, Record<string, number>> = {
  sayisal: { fizik_ayt: 2, kimya_ayt: 2, biyoloji_ayt: 2, matematik_ayt: 4 },
  esit_agirlik: { tarih_ayt: 1, cografya_ayt: 1, felsefe_ayt: 1, din_kulturu_ayt: 1, matematik_ayt: 2, edebiyat_ayt: 4 },
  sozel: { edebiyat_ayt: 4, tarih_ayt: 2, cografya_ayt: 2, felsefe_ayt: 1, din_kulturu_ayt: 1 },
  tyt: {
    turkce_tyt: 1, matematik_tyt: 2, kimya_tyt: 1, fizik_tyt: 1, biyoloji_tyt: 1,
    tarih_tyt: 1, cografya_tyt: 1, felsefe_tyt: 1, din_kulturu_tyt: 1,
  },
  lgs_sozel: { turkce_lgs: 4, inkilap_lgs: 2, din_kulturu_lgs: 2, ingilizce_lgs: 2 },
  lgs_sayisal: { matematik_lgs: 5, fen_lgs: 5 },
}

// Test sorularının soru_metni başındaki etiket (scripts/seed-test-questions.ts)
export const TEST_ETIKETI = '[TEST]'

export const STORAGE_KOVASI = 'soru-gorselleri'
