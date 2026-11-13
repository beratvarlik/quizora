export type Kategori = 'sayisal' | 'esit_agirlik' | 'sozel' | 'tyt';
export type Secenek = 'A' | 'B' | 'C' | 'D' | 'E';
export type GameStatus = 'lobby' | 'playing' | 'finished';
export type Unsubscribe = () => void;
export interface Profile { id: string; displayName: string; avatarKey: string | null; photoUrl: string | null }
export interface GameInfo {
  id: string; code: string; kategori: Kategori; status: GameStatus; hostId: string; speedupBy: string | null;
  startedAt: string | null; speedupAt: string | null; speedupRemainingMs: number | null;
  durationMs: number; totalQuestions: number;
}
export interface PlayerState {
  userId: string; displayName: string; avatarKey: string | null; photoUrl: string | null;
  score: number; currentQ: number; correctCount: number; wrongCount: number; finished: boolean; totalTimeMs: number;
}
export interface Question { position: number; ders: string; text: string; imageUrl: string | null; options: Record<Secenek, string> }
export interface AnswerResult { correct: boolean; points: number; correctOption: Secenek; newScore: number; finished: boolean; speedupTriggered: boolean }
export interface GameResult {
  winnerId: string;
  ranking: Array<PlayerState & { rank: number }>;
  breakdown: { base: number; bonus: number; penalty: number; correct: number; wrong: number; blank: number };
}
export interface GlobalRow { userId: string; displayName: string; avatarKey: string | null; photoUrl: string | null; totalPoints: number; wins: number }
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
  getQuestion(gameId: string, position: number): Promise<Question>;
  submitAnswer(gameId: string, position: number, secenek: Secenek | null): Promise<AnswerResult>;
  finishGame(gameId: string): Promise<GameResult>;
  getGlobalLeaderboard(): Promise<GlobalRow[]>;
  subscribeGame(gameId: string, cb: (s: GameSnapshot) => void): Unsubscribe;
  subscribeGlobalLeaderboard(cb: (rows: GlobalRow[]) => void): Unsubscribe;
}
