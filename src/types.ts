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
  isBot?: boolean; // demo botu (adı '(bot)' ile biter); isteğe bağlı, arayüz 'BOT' rozeti gösterebilir
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
  position: number; ders: string; topic: string | null; text: string; imageUrl: string | null;
  options: Partial<Record<Secenek, string>>;
  selected: Secenek | null; correctOption: Secenek; outcome: ReviewOutcome;
  points: number; timeMs: number | null; explanation: string | null;
}
export interface GameReview { items: ReviewItem[]; addedToNotebook: number } // addedToNotebook: bu yarıştan Yanlışlarım defterine giren soru sayısı
export interface MistakeSummary { total: number; resolvedTotal: number; bySubject: { exam: Sinav; subject: string; count: number }[] }
export interface MistakeItem {
  questionId: string; exam: Sinav; subject: string; topic: string | null; text: string; imageUrl: string | null;
  options: Partial<Record<Secenek, string>>; // LGS'de yalnızca A-D
  lastAnswer: Secenek | null; // null = boş bırakılmıştı
  wrongCount: number; lastWrongAt: string; // doğru şık ve açıklama BURADA yok
}
export interface PracticeResult { isCorrect: boolean; correctOption: Secenek; explanation: string | null; resolved: boolean }
// Akıllı analiz / Performansım (yalnızca bitmiş oyunlar, çağıranın kendi verisi).
// answered = correct + wrong (boş bırakılanlar hariç); accuracy = 100 * correct / answered (0-100, 1 ondalık; answered 0 ise 0);
// avgTimeMs: cevaplanan sorularda ortalama süre (veri yoksa 0). topic boş olan sorular 'Diğer' sayılır.
// Günlük görevler: ilerleme o günün (Europe/Istanbul) bitmiş yarışlarından anlık hesaplanır; yalnızca ödül alımı saklanır.
// Görev id'leri: math10, win1, correct5, friends2, notebook3, acc70, quick1, games3. Günün 3 görevi tarihe göre deterministik (herkes aynı).
export interface DailyTask { id: string; title: string; target: number; progress: number; xp: number; completed: boolean; claimed: boolean } // progress target ile sınırlı
export interface DailyTasks {
  date: string; // 'YYYY-MM-DD' (Europe/Istanbul)
  resetsAt: string; // bir sonraki İstanbul gece yarısı (ISO)
  tasks: DailyTask[]; // 3 görev
  bonus: { xp: number; completed: boolean; claimed: boolean }; // completed = 3 görevin ödülü de alındı
}
export interface ClaimResult { xpGained: number; newXp: number; tierBefore: string; tierAfter: string } // tier = rütbe etiketi ('Bronz I')
export interface PerformanceStats {
  totals: { games: number; answered: number; correct: number; wrong: number; blank: number; avgTimeMs: number; accuracy: number };
  bySubject: { exam: Sinav; subject: string; answered: number; correct: number; accuracy: number; avgTimeMs: number }[]; // answered > 0 olanlar, en çok çözülen önce
  byTopic: { exam: Sinav; subject: string; topic: string; answered: number; correct: number; accuracy: number; lowSample: boolean }[]; // lowSample: answered < 3; önce yeterli örnekliler (doğruluk artan), sonra lowSample
  daily: { date: string; answered: number; correct: number }[]; // son 7 gün (Europe/Istanbul, bugün dahil, eskiden yeniye), boş gün 0; 'YYYY-MM-DD'
  streakDays: number; // üst üste yarışılan gün (bugün ya da dünden geriye)
}
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
  getMistakeSummary(): Promise<MistakeSummary>;
  getMistakes(opts?: { exam?: Sinav; subject?: string; limit?: number }): Promise<MistakeItem[]>;
  practiceAnswer(questionId: string, selected: Secenek): Promise<PracticeResult>;
  removeMistake(questionId: string): Promise<void>;
  getPerformance(opts?: { exam?: Sinav; days?: number }): Promise<PerformanceStats>; // days: 1-365, varsayılan 30
  getDailyTasks(): Promise<DailyTasks>;
  claimDailyTask(taskId: string): Promise<ClaimResult>; // taskId: günün görevi ya da 'bonus'
  subscribeGame(gameId: string, cb: (s: GameSnapshot) => void): Unsubscribe;
  subscribeGlobalLeaderboard(cb: (rows: GlobalRow[]) => void): Unsubscribe;
}
