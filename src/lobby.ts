import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import { Lobby, LobbySnapshot, Move, Player, ServerMessage } from './types';

const MAX_PLAYERS = 1;

export class LobbyManager {
  private lobbies: Map<string, Lobby> = new Map();

  createLobby(startArticle: string, targetArticle: string): Lobby {
    const lobby: Lobby = {
      id: uuidv4(),
      status: 'waiting',
      players: [],
      moves: new Map(),
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      startArticle,
      targetArticle,
      winnerId: null,
      maxPlayers: MAX_PLAYERS,
    };
    this.lobbies.set(lobby.id, lobby);
    return lobby;
  }

  getLobby(lobbyId: string): Lobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  listLobbies(): LobbySnapshot[] {
    return Array.from(this.lobbies.values()).map((l) => this.snapshot(l));
  }

  listJoinableLobbies(): LobbySnapshot[] {
    return Array.from(this.lobbies.values())
      .filter((l) => l.status === 'waiting' && l.players.length < l.maxPlayers)
      .map((l) => this.snapshot(l));
  }

  addPlayer(lobbyId: string, playerName: string, ws: WebSocket): Player | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    if (lobby.status !== 'waiting') return null;
    if (lobby.players.length >= lobby.maxPlayers) return null;

    const player: Player = {
      id: uuidv4(),
      name: playerName,
      ws,
      joinedAt: Date.now(),
    };

    lobby.players.push(player);
    lobby.moves.set(player.id, []);

    this.broadcast(lobby, {
      type: 'player_joined',
      payload: { playerId: player.id, name: player.name },
    });

    return player;
  }

  removePlayer(lobbyId: string, playerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.players = lobby.players.filter((p) => p.id !== playerId);
    lobby.moves.delete(playerId);

    this.broadcast(lobby, {
      type: 'player_left',
      payload: { playerId },
    });

    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
    }
  }

  startGame(lobbyId: string): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return false;
    if (lobby.status !== 'waiting') return false;
    if (lobby.players.length < 1) return false;

    lobby.status = 'in_progress';
    lobby.startedAt = Date.now();

    for (const player of lobby.players) {
      lobby.moves.set(player.id, [
        {
          playerId: player.id,
          article: lobby.startArticle,
          timestamp: Date.now(),
          moveNumber: 1,
        },
      ]);
    }

    this.broadcast(lobby, {
      type: 'game_start',
      payload: this.snapshot(lobby),
    });

    return true;
  }

  recordMove(lobbyId: string, playerId: string, article: string): Move | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'in_progress') return null;

    const playerMoves = lobby.moves.get(playerId);
    if (!playerMoves) return null;

    const move: Move = {
      playerId,
      article,
      timestamp: Date.now(),
      moveNumber: playerMoves.length + 1,
    };
    playerMoves.push(move);

    this.broadcast(lobby, {
      type: 'move_made',
      payload: { playerId, article, moveNumber: move.moveNumber },
    });

    if (article.toLowerCase() === lobby.targetArticle.toLowerCase()) {
      this.finishGame(lobbyId, playerId);
    }

    return move;
  }

  private finishGame(lobbyId: string, winnerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.status = 'finished';
    lobby.finishedAt = Date.now();
    lobby.winnerId = winnerId;

    this.broadcast(lobby, {
      type: 'game_over',
      payload: {
        winnerId,
        lobby: this.snapshot(lobby),
      },
    });
  }

  snapshot(lobby: Lobby): LobbySnapshot {
    const movesObj: Record<string, Move[]> = {};
    lobby.moves.forEach((moves, pid) => {
      movesObj[pid] = moves;
    });

    return {
      id: lobby.id,
      status: lobby.status,
      players: lobby.players.map((p) => ({ id: p.id, name: p.name })),
      moves: movesObj,
      startArticle: lobby.startArticle,
      targetArticle: lobby.targetArticle,
      winnerId: lobby.winnerId,
      maxPlayers: lobby.maxPlayers,
    };
  }

  broadcast(lobby: Lobby, message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const player of lobby.players) {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    }
  }

  sendTo(player: Player, message: ServerMessage): void {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  }
}
