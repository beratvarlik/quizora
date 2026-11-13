/** Küçük çizgi ikonlar (stroke=currentColor). */
const P = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const IkGeri = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="2.2" {...P} aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
)
export const IkOk = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2.4" {...P} aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const IkArti = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2.8" {...P} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
)
export const IkKamera = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="1.8" {...P} aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
)
export const IkKopya = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...P} aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
)
export const IkTik = ({ boyut = 18 }: { boyut?: number }) => (
  <svg width={boyut} height={boyut} viewBox="0 0 24 24" strokeWidth="2.6" {...P} aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
export const IkCarpi = ({ boyut = 18 }: { boyut?: number }) => (
  <svg width={boyut} height={boyut} viewBox="0 0 24 24" strokeWidth="2.6" {...P} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const Tac = () => (
  <svg viewBox="0 0 50 34" aria-hidden="true"><path d="M4 30 L2 8 L15 18 L25 2 L35 18 L48 8 L46 30 Z" fill="#F15A24" stroke="#2B0E17" strokeWidth="2.5" strokeLinejoin="round" /><circle cx="25" cy="21" r="3.2" fill="#F5F2ED" /></svg>
)
export const IkSimsek = ({ boyut = 22 }: { boyut?: number }) => (
  <svg width={boyut} height={boyut} viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.6h6.6L9.4 22 20 9.8h-6.7L13.5 2z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
)
