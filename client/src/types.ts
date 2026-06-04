import { UUID } from 'crypto';
import { PathMove } from './hooks/useReplay';

export type LobbyStatus = 'waiting' | 'in_progress' | 'finished';

export type GameMode = 'race' | 'golf';

export type PlayerMatchStatus = 'racing' | 'finished' | 'forfeited';

export interface PlayerProgress {
  status: PlayerMatchStatus;
  clicks: number;
  finishedAt: number | null;
}

export interface MoveListNodeSnapshot {
  article: string;
  url: string;
  step: number;
  end: boolean;
  next: MoveListNodeSnapshot | null;
  /** Who moved here; null on the shared start node. Omitted on older server payloads. */
  playerId?: string | null;
}

export interface Player {
  id: UUID;
  name: string;
  winner: boolean;
  moves: PathMove[];
}

export interface Article {
  url: string | null;
  title: string;
}

export interface LobbySnapshot {
  id: string;
  status: LobbyStatus;
  hostId: string;
  players: Player[];
  seats: (string | null)[];
  seatReady: boolean[];
  moveChain: MoveListNodeSnapshot | null;
  /** null while waiting (start page hidden until countdown ends). */
  startArticle: Article | null;
  targetArticle: Article;
  winnerId: string | null;
  maxPlayers: number;
  mode: GameMode;
  /** Golf-mode match time limit in ms. */
  timeLimitMs: number;
  /** Absolute epoch-ms deadline for golf matches in progress; null otherwise. */
  deadline: number | null;
  /** Seated players captured at game start (persists across disconnects). */
  participants: { id: string; name: string }[];
  /** Per-participant progress keyed by playerId. */
  progress: Record<string, PlayerProgress>;
}

export type ServerMessage =
  | { type: 'lobby_state'; payload: { playerId: string; lobby: LobbySnapshot } }
  | { type: 'lobby_sync'; payload: LobbySnapshot }
  | { type: 'player_joined'; payload: { playerId: string; name: string } }
  | { type: 'player_left'; payload: { playerId: string } }
  | {
      type: 'countdown_tick';
      payload: { secondsLeft: number; startArticle: Article };
    }
  | { type: 'game_start'; payload: LobbySnapshot }
  | {
      type: 'move_made';
      payload: {
        playerId: string;
        article: string;
        url: string;
        step: number;
        end: boolean;
      };
    }
  | { type: 'player_forfeited'; payload: { playerId: string } }
  | {
      type: 'game_over';
      payload: { winnerId: string | null; lobby: LobbySnapshot };
    }
  | { type: 'error'; payload: { message: string } };
