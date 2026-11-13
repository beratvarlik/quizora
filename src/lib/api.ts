// Quizora — QuizoraApi'nin Supabase uygulaması.
// Arayüz ile backend arasındaki tek bağ src/types.ts'tir; bu dosya snake_case RPC
// yanıtlarını types.ts'teki camelCase şekillere çevirir.
// Bu dosyada service role anahtarı ASLA olmamalı (yalnızca anon anahtar kullanılır).
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AnswerResult,
  GameInfo,
  GameResult,
  GameSnapshot,
  GameStatus,
  GlobalRow,
  Kategori,
  MyStats,
  GameReview,
  ReviewItem,
  ReviewOutcome,
  PlayerState,
  Profile,
  QuizoraApi,
  Question,
  RankedPlayer,
  Secenek,
  Sinav,
  Unsubscribe,
} from '../types'

// createClient()'ın varsayılan dönüş tipi (şemasız istemci). Supabase'in jenerik varsayılanları
// çıplak SupabaseClient tipini createClient sonucuna atanamaz yaptığından açıkça yazılır.
export type Istemci = SupabaseClient<any, 'public', 'public', any, any>

// =====================================================================
// Hata yönetimi
// =====================================================================
const BAGLANTI_HATASI = 'Bağlantı hatası, tekrar dene'
const AG_HATASI = /failed to fetch|fetch failed|networkerror|network request failed|load failed|econn|enotfound|etimedout|timeout/i

interface HamHata {
  message: string
  code?: string
}

// RPC'lerin fırlattığı Türkçe mesajlar (P0001) olduğu gibi kalır; ağ ve oturum hataları çevrilir.
function mesajCevir(h: HamHata): string {
  const kod = h.code ?? ''
  if (kod === 'PGRST301' || kod === 'PGRST303') return 'Oturum yok'
  // Oturumsuz (anon) istemci RPC'leri çağıramaz: yetki hatası = oturum yok
  if (kod === '42501' && /permission denied for function/i.test(h.message)) return 'Oturum yok'
  // Supabase Auth hız sınırı (ör. anonim giriş sınırı aşıldı): İngilizce mesaj yerine Türkçe
  if (/rate limit/i.test(h.message)) return 'Çok fazla deneme yapıldı, biraz bekleyip tekrar dene'
  if (kod === '' && AG_HATASI.test(h.message)) return BAGLANTI_HATASI
  return h.message
}

// Kendi fırlattığımız hatalar tekrar çevrilmesin diye ayrı sınıf
class QuizoraHata extends Error {
  constructor(mesaj: string) {
    super(mesaj)
    this.name = 'QuizoraHata'
  }
}

function hata(h: HamHata): QuizoraHata {
  return new QuizoraHata(mesajCevir(h))
}

function hataCevir(e: unknown): QuizoraHata {
  if (e instanceof QuizoraHata) return e
  if (e instanceof Error) return hata({ message: e.message })
  return new QuizoraHata(BAGLANTI_HATASI)
}

// =====================================================================
// Ham (snake_case) RPC şekilleri
// =====================================================================
interface HamOyun {
  id: string
  code: string
  kategori: Kategori
  sinav: Sinav
  status: GameStatus
  host_id: string
  speedup_by: string | null
  started_at: string | null
  speedup_at: string | null
  speedup_remaining_ms: number | null
  duration_ms: number
  total_questions: number
  is_public: boolean
  auto_start_at: string | null
}

interface HamOyuncu {
  user_id: string
  display_name: string
  avatar_key: string | null
  photo_url: string | null
  score: number
  current_q: number
  correct_count: number
  wrong_count: number
  finished: boolean
  total_time_ms: number
  rank_key: string
  rank_label: string
}

interface HamSnapshot {
  game: HamOyun
  players: HamOyuncu[]
}

interface HamSoru {
  position: number
  ders: string
  text: string
  image_url: string | null
  options: Partial<Record<Secenek, string>> // LGS soruları 4 şıklıdır: E anahtarı yoktur
}

interface HamCevap {
  correct: boolean
  points: number
  correct_option: Secenek
  new_score: number
  finished: boolean
  speedup_triggered: boolean
}

interface HamSiraliOyuncu extends HamOyuncu {
  rank: number
  xp_gained: number
  xp_before: number
  xp_after: number
  rank_label_before: string
  rank_label_after: string
  ranked_up: boolean
}

interface HamSonuc {
  winner_id: string
  ranking: HamSiraliOyuncu[]
  breakdown: { base: number; bonus: number; penalty: number; correct: number; wrong: number; blank: number }
  xp_breakdown: { participation: number; points: number; placement: number; first_finisher: number; total: number }
}

interface HamGlobalSatir {
  user_id: string
  display_name: string
  avatar_key: string | null
  photo_url: string | null
  xp: number
  rank_key: string
  rank_label: string
  wins: number
  games_played: number
}

interface HamIstatistik {
  xp: number
  rank_key: string
  rank_label: string
  next_rank_label: string | null
  xp_to_next: number | null
  progress_pct: number
  wins: number
  games_played: number
}

interface HamIncelemeSatir {
  position: number
  ders: string
  text: string
  image_url: string | null
  options: Partial<Record<Secenek, string>>
  selected: Secenek | null
  correct_option: Secenek
  outcome: ReviewOutcome
  points: number
  time_ms: number | null
  explanation: string | null
}

interface HamProfil {
  id: string
  display_name: string
  avatar_key: string | null
  photo_url: string | null
}

// =====================================================================
// Mapper'lar (snake_case → types.ts)
// =====================================================================
function mapProfile(h: HamProfil): Profile {
  return { id: h.id, displayName: h.display_name, avatarKey: h.avatar_key, photoUrl: h.photo_url }
}

function mapGameInfo(h: HamOyun): GameInfo {
  return {
    id: h.id,
    code: h.code,
    kategori: h.kategori,
    sinav: h.sinav,
    status: h.status,
    hostId: h.host_id,
    speedupBy: h.speedup_by,
    startedAt: h.started_at,
    speedupAt: h.speedup_at,
    speedupRemainingMs: h.speedup_remaining_ms,
    durationMs: h.duration_ms,
    totalQuestions: h.total_questions,
    isPublic: h.is_public,
    autoStartAt: h.auto_start_at,
  }
}

function mapPlayer(h: HamOyuncu): PlayerState {
  return {
    userId: h.user_id,
    displayName: h.display_name,
    avatarKey: h.avatar_key,
    photoUrl: h.photo_url,
    score: h.score,
    currentQ: h.current_q,
    correctCount: h.correct_count,
    wrongCount: h.wrong_count,
    finished: h.finished,
    totalTimeMs: h.total_time_ms,
    rankKey: h.rank_key,
    rankLabel: h.rank_label,
  }
}

function mapSnapshot(h: HamSnapshot): GameSnapshot {
  return { game: mapGameInfo(h.game), players: h.players.map(mapPlayer) }
}

function mapQuestion(h: HamSoru): Question {
  return { position: h.position, ders: h.ders, text: h.text, imageUrl: h.image_url, options: h.options }
}

function mapAnswerResult(h: HamCevap): AnswerResult {
  return {
    correct: h.correct,
    points: h.points,
    correctOption: h.correct_option,
    newScore: h.new_score,
    finished: h.finished,
    speedupTriggered: h.speedup_triggered,
  }
}

function mapRankedPlayer(h: HamSiraliOyuncu): RankedPlayer {
  return {
    ...mapPlayer(h),
    rank: h.rank,
    xpGained: h.xp_gained,
    xpBefore: h.xp_before,
    xpAfter: h.xp_after,
    rankLabelBefore: h.rank_label_before,
    rankLabelAfter: h.rank_label_after,
    rankedUp: h.ranked_up,
  }
}

function mapGameResult(h: HamSonuc): GameResult {
  return {
    winnerId: h.winner_id,
    ranking: h.ranking.map(mapRankedPlayer),
    breakdown: { ...h.breakdown },
    xpBreakdown: {
      participation: h.xp_breakdown.participation,
      points: h.xp_breakdown.points,
      placement: h.xp_breakdown.placement,
      firstFinisher: h.xp_breakdown.first_finisher,
      total: h.xp_breakdown.total,
    },
  }
}

function mapGlobalRow(h: HamGlobalSatir): GlobalRow {
  return {
    userId: h.user_id,
    displayName: h.display_name,
    avatarKey: h.avatar_key,
    photoUrl: h.photo_url,
    xp: h.xp,
    rankKey: h.rank_key,
    rankLabel: h.rank_label,
    wins: h.wins,
    gamesPlayed: h.games_played,
  }
}

function mapMyStats(h: HamIstatistik): MyStats {
  return {
    xp: h.xp,
    rankKey: h.rank_key,
    rankLabel: h.rank_label,
    nextRankLabel: h.next_rank_label,
    xpToNext: h.xp_to_next,
    progressPct: h.progress_pct,
    wins: h.wins,
    gamesPlayed: h.games_played,
  }
}

function mapReviewItem(h: HamIncelemeSatir): ReviewItem {
  return {
    position: h.position,
    ders: h.ders,
    text: h.text,
    imageUrl: h.image_url,
    options: h.options,
    selected: h.selected,
    correctOption: h.correct_option,
    outcome: h.outcome,
    points: h.points,
    timeMs: h.time_ms,
    explanation: h.explanation,
  }
}

// =====================================================================
// Yardımcılar
// =====================================================================
const PROFIL_SUTUNLARI = 'id, display_name, avatar_key, photo_url'
const FOTO_SINIRI_BAYT = 5 * 1024 * 1024
const AVATAR_UZANTISI = /^[a-z0-9]{2,5}$/

async function rpc<T>(client: Istemci, ad: string, args?: Record<string, unknown>): Promise<T> {
  const sonuc = await client.rpc(ad, args).then(
    (r) => r,
    (e: unknown) => {
      throw hataCevir(e)
    },
  )
  if (sonuc.error) throw hata(sonuc.error)
  return sonuc.data as T
}

async function mevcutKullaniciId(client: Istemci): Promise<string> {
  try {
    const { data, error } = await client.auth.getSession()
    if (error) throw hata(error)
    if (!data.session) throw new QuizoraHata('Oturum yok')
    return data.session.user.id
  } catch (e) {
    throw hataCevir(e)
  }
}

function dosyaUzantisi(dosya: File): string {
  const parca = dosya.name.split('.').pop()?.toLowerCase() ?? ''
  if (AVATAR_UZANTISI.test(parca)) return parca
  const tur = dosya.type.split('/')[1] ?? ''
  return AVATAR_UZANTISI.test(tur) ? tur : 'jpg'
}

// =====================================================================
// Realtime abonelik çekirdeği (subscribeGame ve subscribeGlobalLeaderboard ortak kullanır)
// =====================================================================
interface AbonelikAyari<T> {
  client: Istemci
  etiket: string
  dinle: Array<{ table: string; filter?: string }>
  cek: () => Promise<T>
  cb: (veri: T) => void
  debounceMs: number
  yenilemeMs: number
}

const YENIDEN_BAGLANMA_MS = 2000

function abonelikKur<T>(a: AbonelikAyari<T>): Unsubscribe {
  let durdu = false
  let kanal: RealtimeChannel | null = null
  let kanalNo = 0
  let istekNo = 0
  let teslimEdilen = 0
  let debounceZamani: ReturnType<typeof setTimeout> | undefined
  let yenidenZamani: ReturnType<typeof setTimeout> | undefined

  // Durumu çek ve ver. Eski bir isteğin yanıtı yenisinden sonra gelirse atılır.
  const yenile = async (): Promise<void> => {
    const benim = ++istekNo
    let veri: T
    try {
      veri = await a.cek()
    } catch (e) {
      // Geçici hata: sonraki olay veya periyodik yenileme yeniden dener
      console.warn(`[${a.etiket}] durum alınamadı:`, e instanceof Error ? e.message : e)
      return
    }
    if (durdu || benim < teslimEdilen) return
    teslimEdilen = benim
    a.cb(veri)
  }

  const planla = (): void => {
    if (durdu) return
    clearTimeout(debounceZamani)
    debounceZamani = setTimeout(() => void yenile(), a.debounceMs)
  }

  const baglan = (): void => {
    if (durdu) return
    const k = a.client.channel(`${a.etiket}:${++kanalNo}`)
    for (const d of a.dinle) {
      k.on('postgres_changes', { event: '*', schema: 'public', table: d.table, filter: d.filter }, planla)
    }
    kanal = k
    k.subscribe((durum) => {
      // Eski (kapatılmış) kanalın geç gelen olayları yok sayılır
      if (durdu || k !== kanal) return
      if (durum === 'SUBSCRIBED') {
        void yenile() // bağlanırken kaçan değişiklikler için
      } else if (durum === 'CHANNEL_ERROR' || durum === 'TIMED_OUT' || durum === 'CLOSED') {
        yenidenBaglan(k)
      }
    })
  }

  const yenidenBaglan = (eski: RealtimeChannel): void => {
    if (durdu || yenidenZamani !== undefined) return
    yenidenZamani = setTimeout(() => {
      yenidenZamani = undefined
      if (durdu) return
      kanal = null
      void a.client.removeChannel(eski)
      baglan()
      void yenile()
    }, YENIDEN_BAGLANMA_MS)
  }

  void yenile()
  baglan()
  const aralik = setInterval(() => void yenile(), a.yenilemeMs) // güvenlik ağı

  return () => {
    durdu = true
    clearTimeout(debounceZamani)
    clearTimeout(yenidenZamani)
    clearInterval(aralik)
    if (kanal) void a.client.removeChannel(kanal)
    kanal = null
  }
}

// =====================================================================
// Fabrika
// =====================================================================
export function createApi(client: Istemci): QuizoraApi {
  const getGameById = async (gameId: string): Promise<GameSnapshot> =>
    mapSnapshot(await rpc<HamSnapshot>(client, 'get_game_by_id', { p_game_id: gameId }))

  const getGlobalLeaderboard = async (): Promise<GlobalRow[]> =>
    (await rpc<HamGlobalSatir[]>(client, 'get_global_leaderboard')).map(mapGlobalRow)

  // Aynı anda gelen çağrılar tek anonim kullanıcı yaratsın
  let oturumSozu: Promise<string> | null = null

  const oturumAc = async (): Promise<string> => {
    try {
      const { data: mevcut, error: okumaHata } = await client.auth.getSession()
      if (okumaHata) throw hata(okumaHata)
      if (mevcut.session) return mevcut.session.user.id
      const { data, error } = await client.auth.signInAnonymously()
      if (error) throw hata(error)
      if (!data.user) throw new QuizoraHata('Oturum yok')
      return data.user.id
    } catch (e) {
      throw hataCevir(e)
    }
  }

  return {
    ensureSession(): Promise<string> {
      if (!oturumSozu) {
        oturumSozu = oturumAc().catch((e: unknown) => {
          oturumSozu = null // hata kalıcı olmasın, sonraki çağrı yeniden denesin
          throw e
        })
      }
      return oturumSozu
    },

    // Üç örnekten en kısa gidiş-dönüşlü olanın ofseti: sunucuMs − (t0 + t1) / 2
    async getServerOffsetMs(): Promise<number> {
      let enIyi: { rtt: number; ofset: number } | null = null
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now()
        const sunucuMs = Number(await rpc<number>(client, 'server_time'))
        const t1 = Date.now()
        const ornek = { rtt: t1 - t0, ofset: sunucuMs - (t0 + t1) / 2 }
        if (!enIyi || ornek.rtt < enIyi.rtt) enIyi = ornek
      }
      return Math.round(enIyi ? enIyi.ofset : 0)
    },

    async getProfile(): Promise<Profile | null> {
      const uid = await mevcutKullaniciId(client)
      try {
        const { data, error } = await client.from('profiles').select(PROFIL_SUTUNLARI).eq('id', uid).maybeSingle()
        if (error) throw hata(error)
        return data ? mapProfile(data as HamProfil) : null
      } catch (e) {
        throw hataCevir(e)
      }
    },

    async saveProfile(p: { displayName: string; avatarKey: string | null; photoFile?: File }): Promise<Profile> {
      const ad = p.displayName.trim()
      const uzunluk = Array.from(ad).length
      if (uzunluk < 2 || uzunluk > 20) throw new Error('İsim 2-20 karakter olmalı')
      if (p.photoFile && p.photoFile.size > FOTO_SINIRI_BAYT) throw new Error('Fotoğraf çok büyük')

      const uid = await mevcutKullaniciId(client)
      try {
        // Fotoğraf yoksa ve hazır avatar seçilmediyse mevcut fotoğraf korunur
        let photoUrl: string | null = null
        if (p.photoFile) {
          const yol = `${uid}/avatar-${Date.now()}.${dosyaUzantisi(p.photoFile)}`
          const { error: yukleHata } = await client.storage
            .from('avatars')
            .upload(yol, p.photoFile, { contentType: p.photoFile.type || undefined, upsert: false })
          if (yukleHata) throw hata(yukleHata)
          photoUrl = client.storage.from('avatars').getPublicUrl(yol).data.publicUrl
        } else if (p.avatarKey === null) {
          const { data: mevcut, error: okuHata } = await client
            .from('profiles')
            .select('photo_url')
            .eq('id', uid)
            .maybeSingle()
          if (okuHata) throw hata(okuHata)
          photoUrl = (mevcut as { photo_url: string | null } | null)?.photo_url ?? null
        }

        const { data, error } = await client
          .from('profiles')
          .upsert({ id: uid, display_name: ad, avatar_key: p.avatarKey, photo_url: photoUrl })
          .select(PROFIL_SUTUNLARI)
          .single()
        if (error) throw hata(error)
        return mapProfile(data as HamProfil)
      } catch (e) {
        throw hataCevir(e)
      }
    },

    async createGame(kategori: Kategori): Promise<{ gameId: string; code: string }> {
      const h = await rpc<{ game_id: string; code: string }>(client, 'create_game', { p_kategori: kategori })
      return { gameId: h.game_id, code: h.code }
    },

    async joinGame(code: string): Promise<{ gameId: string }> {
      const h = await rpc<{ game_id: string }>(client, 'join_game', { p_code: code })
      return { gameId: h.game_id }
    },

    async quickJoin(kategori: Kategori): Promise<{ gameId: string; code: string; created: boolean }> {
      const h = await rpc<{ game_id: string; code: string; created: boolean }>(client, 'quick_join', { p_kategori: kategori })
      return { gameId: h.game_id, code: h.code, created: h.created }
    },

    async leaveGame(gameId: string): Promise<void> {
      await rpc<null>(client, 'leave_game', { p_game_id: gameId })
    },

    async startIfReady(gameId: string): Promise<void> {
      await rpc<null>(client, 'start_if_ready', { p_game_id: gameId })
    },

    async getGameByCode(code: string): Promise<GameSnapshot> {
      return mapSnapshot(await rpc<HamSnapshot>(client, 'get_game', { p_code: code }))
    },

    async startGame(gameId: string): Promise<void> {
      await rpc<null>(client, 'start_game', { p_game_id: gameId })
    },

    async getQuestion(gameId: string, position: number): Promise<Question> {
      return mapQuestion(await rpc<HamSoru>(client, 'get_question', { p_game_id: gameId, p_position: position }))
    },

    async submitAnswer(gameId: string, position: number, secenek: Secenek | null): Promise<AnswerResult> {
      return mapAnswerResult(
        await rpc<HamCevap>(client, 'submit_answer', { p_game_id: gameId, p_position: position, p_secenek: secenek }),
      )
    },

    async finishGame(gameId: string): Promise<GameResult> {
      return mapGameResult(await rpc<HamSonuc>(client, 'finish_game', { p_game_id: gameId }))
    },

    getGlobalLeaderboard,

    async getMyStats(): Promise<MyStats> {
      return mapMyStats(await rpc<HamIstatistik>(client, 'get_my_stats'))
    },

    async getGameReview(gameId: string): Promise<GameReview> {
      const h = await rpc<{ items: HamIncelemeSatir[] }>(client, 'get_game_review', { p_game_id: gameId })
      return { items: (h.items ?? []).map(mapReviewItem) }
    },

    // Realtime olaylarında tam snapshot yeniden çekilir (50 ms debounce); 3 sn'de bir güvenlik ağı
    subscribeGame(gameId: string, cb: (s: GameSnapshot) => void): Unsubscribe {
      return abonelikKur<GameSnapshot>({
        client,
        etiket: 'subscribeGame',
        dinle: [
          { table: 'games', filter: `id=eq.${gameId}` },
          { table: 'game_players', filter: `game_id=eq.${gameId}` },
        ],
        cek: () => getGameById(gameId),
        cb,
        debounceMs: 50,
        yenilemeMs: 3000,
      })
    },

    subscribeGlobalLeaderboard(cb: (rows: GlobalRow[]) => void): Unsubscribe {
      return abonelikKur<GlobalRow[]>({
        client,
        etiket: 'subscribeGlobalLeaderboard',
        dinle: [{ table: 'player_stats' }],
        cek: getGlobalLeaderboard,
        cb,
        debounceMs: 100,
        yenilemeMs: 10_000,
      })
    },
  }
}

// =====================================================================
// Varsayılan istemci (tarayıcı)
// İlk kullanımda oluşturulur: böylece env olmayan ortamlarda (ör. Node script'leri
// createApi ile kendi istemcilerini kurarken) bu dosyayı import etmek hata vermez.
// =====================================================================
let varsayilanApi: QuizoraApi | undefined

function varsayilanOlustur(): QuizoraApi {
  if (!varsayilanApi) {
    const url: string | undefined = import.meta.env?.VITE_SUPABASE_URL
    const anahtar: string | undefined = import.meta.env?.VITE_SUPABASE_ANON_KEY
    if (!url || !anahtar) {
      throw new Error('Supabase ayarı eksik: .env.local içinde VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalı')
    }
    varsayilanApi = createApi(createClient(url, anahtar, { auth: { persistSession: true, autoRefreshToken: true } }))
  }
  return varsayilanApi
}

export const api: QuizoraApi = new Proxy({} as QuizoraApi, {
  get: (_hedef, ozellik) => Reflect.get(varsayilanOlustur(), ozellik),
})
