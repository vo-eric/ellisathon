import WebSocket from 'ws';

export interface Player {
  id: string;
  name: string;
  ws: WebSocket;
  joinedAt: number;
}

export interface Move {
  playerId: string;
  /** The Wikipedia article title the player navigated to */
  article: string;
  timestamp: number;
  /** Sequential move number (1-indexed) */
  moveNumber: number;
}

export type LobbyStatus = 'waiting' | 'in_progress' | 'finished';

export interface Lobby {
  id: string;
  status: LobbyStatus;
  players: Player[];
  /** Full move history per player, keyed by player ID */
  moves: Map<string, Move[]>;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** The starting Wikipedia article for this game */
  startArticle: string;
  /** The target Wikipedia article players race to reach */
  targetArticle: string;
  winnerId: string | null;
  maxPlayers: number;
}

// --- WebSocket message protocol ---

export type ClientMessageType = 'move' | 'ready';

export type ServerMessageType =
  | 'lobby_state'
  | 'player_joined'
  | 'player_left'
  | 'game_start'
  | 'move_made'
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
  players: { id: string; name: string }[];
  moves: Record<string, Move[]>;
  startArticle: string;
  targetArticle: string;
  winnerId: string | null;
  maxPlayers: number;
}
