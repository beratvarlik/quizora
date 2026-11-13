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
  position: number; ders: string; text: string; imageUrl: string | null;
  options: Partial<Record<Secenek, string>>;
  selected: Secenek | null; correctOption: Secenek; outcome: ReviewOutcome;
  points: number; timeMs: number | null; explanation: string | null;
}
export interface GameReview { items: ReviewItem[] }
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
  subscribeGame(gameId: string, cb: (s: GameSnapshot) => void): Unsubscribe;
  subscribeGlobalLeaderboard(cb: (rows: GlobalRow[]) => void): Unsubscribe;
}
