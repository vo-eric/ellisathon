export type LobbyStatus = 'waiting' | 'in_progress' | 'finished';

export interface MoveListNodeSnapshot {
  article: string;
  url: string;
  step: number;
  end: boolean;
  next: MoveListNodeSnapshot | null;
}

export interface LobbySnapshot {
  id: string;
  status: LobbyStatus;
  players: { id: string; name: string }[];
  moveChain: MoveListNodeSnapshot | null;
  startArticle: string;
  targetArticle: string;
  winnerId: string | null;
  maxPlayers: number;
}

export type ServerMessage =
  | { type: 'lobby_state'; payload: { playerId: string; lobby: LobbySnapshot } }
  | { type: 'player_joined'; payload: { playerId: string; name: string } }
  | { type: 'player_left'; payload: { playerId: string } }
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
  | {
      type: 'game_over';
      payload: { winnerId: string; lobby: LobbySnapshot };
    }
  | { type: 'error'; payload: { message: string } };
