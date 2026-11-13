/** Hata nesnesini kullanıcıya gösterilecek Türkçe metne çevirir. */
export function hataMesaji(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  if (!m) return 'Bir şeyler ters gitti. Tekrar dene.'
  if (/failed to fetch|network|load failed/i.test(m)) return 'Bağlantı kurulamadı. İnternetini kontrol et.'
  if (/Oyun başlamak üzere/i.test(m)) return 'Yarış başlamak üzere, bu lobiye artık girilemiyor. Menüden Hemen Katıl ile yeni bir yarışa gir.'
  return m
}
