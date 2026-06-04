export interface Player {
  id: string;
  name: string;
  ws: WebSocket;
  joinedAt: number;
}

/** Linked-list node for a lobby's move path */
export interface MoveListNode {
  article: string;
  url: string;
  step: number;
  next: MoveListNode | null;
  end: boolean;
  /** Who moved here; null on the shared start node. */
  playerId: string | null;
}

/** Serializable chain (nested JSON, no cycles in output) */
export interface MoveListNodeSnapshot {
  article: string;
  url: string;
  step: number;
  end: boolean;
  next: MoveListNodeSnapshot | null;
  /** Who moved here; null on the shared start node. Omitted in older persisted payloads. */
  playerId?: string | null;
}

export type LobbyStatus = 'waiting' | 'in_progress' | 'finished';

/**
 * Game modes:
 * - `race`: first player to reach the target wins, ending the game instantly.
 * - `golf`: lowest number of clicks wins. The game runs until every participant
 *   has reached the target or forfeited (or the match timer expires).
 */
export type GameMode = 'race' | 'golf';

export type PlayerMatchStatus = 'racing' | 'finished' | 'forfeited';

/** Per-participant progress, used to resolve the golf winner & render results. */
export interface PlayerProgress {
  status: PlayerMatchStatus;
  /** Article navigations made by this player (excludes the shared start node). */
  clicks: number;
  /** Timestamp the player reached the target, or null if not (yet) finished. */
  finishedAt: number | null;
}

export type Article = {
  url: string;
  title: string;
};

export interface Lobby {
  id: string;
  status: LobbyStatus;
  hostId: string;
  players: Player[];
  /**
   * Seat slots: length === maxPlayers.
   * Each entry is the playerId in that seat, or null if empty.
   */
  seats: (string | null)[];
  /** Ready flag per seat index (meaningful only when seats[i] is non-null). */
  seatReady: boolean[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  startArticle: Article;
  targetArticle: Article;
  winnerId: string | null;
  maxPlayers: number;
  /** Selected game mode (host-controlled while waiting). */
  mode: GameMode;
  /** Golf-mode match time limit in ms (host-configurable while waiting). */
  timeLimitMs: number;
  /** Seated players captured at game start; persists even if they disconnect. */
  participants: { id: string; name: string }[];
  /** Per-participant progress keyed by playerId (populated at game start). */
  progress: Record<string, PlayerProgress>;
}

// --- WebSocket message protocol ---

export type ClientMessageType =
  | 'move'
  | 'claim_seat'
  | 'set_ready'
  | 'start_game'
  | 'set_seats'
  | 'kick_seat'
  | 'return_to_lobby'
  | 'set_mode'
  | 'set_time_limit'
  | 'forfeit';

export type ServerMessageType =
  | 'lobby_state'
  | 'lobby_sync'
  | 'player_joined'
  | 'player_left'
  | 'countdown_tick'
  | 'game_start'
  | 'move_made'
  | 'player_forfeited'
  | 'game_over'
  | 'error';

export interface ClientMessage {
  type: ClientMessageType;
  payload: Record<string, unknown>;
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: unknown;
}

/** Serializable lobby snapshot sent to clients (no raw WS refs) */
export interface LobbySnapshot {
  id: string;
  status: LobbyStatus;
  hostId: string;
  players: { id: string; name: string }[];
  /** Seat index → playerId or null (same length as maxPlayers) */
  seats: (string | null)[];
  /** Ready per seat (same length as seats; only used when that seat is occupied). */
  seatReady: boolean[];
  /** Head of the move chain for this lobby (null before game starts) */
  moveChain: MoveListNodeSnapshot | null;
  /** Hidden (null) while status is `waiting`; revealed after countdown when game starts. */
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
