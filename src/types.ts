import WebSocket from 'ws';

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
}

/** Serializable chain (nested JSON, no cycles in output) */
export interface MoveListNodeSnapshot {
  article: string;
  url: string;
  step: number;
  end: boolean;
  next: MoveListNodeSnapshot | null;
}

export type LobbyStatus = 'waiting' | 'in_progress' | 'finished';

export interface Lobby {
  id: string;
  status: LobbyStatus;
  players: Player[];
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
  /** Head of the move chain for this lobby (null before game starts) */
  moveChain: MoveListNodeSnapshot | null;
  startArticle: string;
  targetArticle: string;
  winnerId: string | null;
  maxPlayers: number;
}
