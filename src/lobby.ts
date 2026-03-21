import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
import {
  Lobby,
  LobbySnapshot,
  MoveListNode,
  MoveListNodeSnapshot,
  Player,
  ServerMessage,
} from './types';

const MAX_PLAYERS = 2;
const COUNTDOWN_SECONDS = 5;

function articlesMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Canonical English Wikipedia article URL for a page title */
export function wikipediaArticleUrl(title: string): string {
  const segment = title.trim().replace(/ /g, '_');
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(segment)}`;
}

type MoveChain = {
  head: MoveListNode | null;
  tail: MoveListNode | null;
};

type CountdownToken = { cancelled: boolean };

export class LobbyManager {
  private lobbies: Map<string, Lobby> = new Map();
  private moveChains: Map<string, MoveChain> = new Map();
  private countdownTokens: Map<string, CountdownToken> = new Map();

  createLobby(startArticle: string, targetArticle: string): Lobby {
    const lobby: Lobby = {
      id: uuidv4(),
      status: 'waiting',
      players: [],
      seats: Array.from({ length: MAX_PLAYERS }, () => null),
      seatReady: Array.from({ length: MAX_PLAYERS }, () => false),
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      startArticle,
      targetArticle,
      winnerId: null,
      maxPlayers: MAX_PLAYERS,
    };
    this.lobbies.set(lobby.id, lobby);
    this.moveChains.set(lobby.id, { head: null, tail: null });
    return lobby;
  }

  getLobby(lobbyId: string): Lobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  private getChain(lobbyId: string): MoveChain | undefined {
    return this.moveChains.get(lobbyId);
  }

  /** Snapshot for clients: hide start article until game is in progress (or finished). */
  snapshot(lobby: Lobby): LobbySnapshot {
    const chain = this.getChain(lobby.id);
    const moveChain = chain?.head ? this.serializeChain(chain.head) : null;
    const hideStart = lobby.status === 'waiting';

    return {
      id: lobby.id,
      status: lobby.status,
      players: lobby.players.map((p) => ({ id: p.id, name: p.name })),
      seats: [...lobby.seats],
      seatReady: [...lobby.seatReady],
      moveChain,
      startArticle: hideStart ? null : lobby.startArticle,
      targetArticle: lobby.targetArticle,
      winnerId: lobby.winnerId,
      maxPlayers: lobby.maxPlayers,
    };
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

    this.broadcast(lobby, {
      type: 'player_joined',
      payload: { playerId: player.id, name: player.name },
    });
    this.broadcastLobbySync(lobby);

    return player;
  }

  removePlayer(lobbyId: string, playerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    this.cancelCountdown(lobbyId);

    lobby.players = lobby.players.filter((p) => p.id !== playerId);

    for (let i = 0; i < lobby.seats.length; i++) {
      if (lobby.seats[i] === playerId) {
        lobby.seats[i] = null;
        lobby.seatReady[i] = false;
      }
    }

    this.broadcast(lobby, {
      type: 'player_left',
      payload: { playerId },
    });

    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      this.moveChains.delete(lobbyId);
    } else {
      this.broadcastLobbySync(lobby);
    }
  }

  claimSeat(lobbyId: string, playerId: string, seatIndex: number): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'waiting') return false;
    if (!lobby.players.some((p) => p.id === playerId)) return false;
    if (seatIndex < 0 || seatIndex >= lobby.seats.length) return false;
    if (lobby.seats[seatIndex] !== null) return false;

    this.cancelCountdown(lobbyId);

    for (let i = 0; i < lobby.seats.length; i++) {
      if (lobby.seats[i] === playerId) {
        lobby.seats[i] = null;
        lobby.seatReady[i] = false;
      }
    }
    lobby.seats[seatIndex] = playerId;
    lobby.seatReady[seatIndex] = false;

    this.broadcastLobbySync(lobby);
    this.tryBeginCountdown(lobbyId);
    return true;
  }

  setSeatReady(lobbyId: string, playerId: string, ready: boolean): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'waiting') return false;

    const seatIndex = lobby.seats.findIndex((id) => id === playerId);
    if (seatIndex < 0) return false;

    if (!ready) {
      this.cancelCountdown(lobbyId);
    }

    lobby.seatReady[seatIndex] = ready;

    this.broadcastLobbySync(lobby);
    if (ready) {
      this.tryBeginCountdown(lobbyId);
    }
    return true;
  }

  private allSeatedPlayersReady(lobby: Lobby): boolean {
    if (lobby.players.length !== lobby.maxPlayers) return false;
    if (!lobby.seats.every((s) => s !== null)) return false;
    for (let i = 0; i < lobby.seats.length; i++) {
      if (lobby.seats[i] === null) return false;
      if (!lobby.seatReady[i]) return false;
      const pid = lobby.seats[i];
      if (!lobby.players.some((p) => p.id === pid)) return false;
    }
    return true;
  }

  private tryBeginCountdown(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'waiting') return;
    if (!this.allSeatedPlayersReady(lobby)) return;
    if (this.countdownTokens.has(lobbyId)) return;

    const token: CountdownToken = { cancelled: false };
    this.countdownTokens.set(lobbyId, token);

    let s = COUNTDOWN_SECONDS;
    const step = () => {
      if (token.cancelled) {
        this.countdownTokens.delete(lobbyId);
        return;
      }
      if (s === 0) {
        this.countdownTokens.delete(lobbyId);
        this.actuallyStartGame(lobbyId);
        return;
      }
      this.broadcast(lobby, {
        type: 'countdown_tick',
        payload: { secondsLeft: s },
      });
      s--;
      setTimeout(step, 1000);
    };
    step();
  }

  private cancelCountdown(lobbyId: string): void {
    const token = this.countdownTokens.get(lobbyId);
    if (token) {
      token.cancelled = true;
      this.countdownTokens.delete(lobbyId);
    }
  }

  private actuallyStartGame(lobbyId: string): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return false;
    if (lobby.status !== 'waiting') return false;
    if (lobby.players.length < MAX_PLAYERS) return false;

    const chain = this.getChain(lobbyId);
    if (!chain) return false;

    lobby.status = 'in_progress';
    lobby.startedAt = Date.now();

    const url = wikipediaArticleUrl(lobby.startArticle);
    const end = articlesMatch(lobby.startArticle, lobby.targetArticle);
    const first: MoveListNode = {
      article: lobby.startArticle,
      url,
      step: 1,
      next: null,
      end,
    };
    chain.head = first;
    chain.tail = first;

    this.broadcast(lobby, {
      type: 'game_start',
      payload: this.snapshot(lobby),
    });

    if (end && lobby.players[0]) {
      this.finishGame(lobbyId, lobby.players[0].id);
    }

    return true;
  }

  recordMove(
    lobbyId: string,
    playerId: string,
    article: string,
    url?: string
  ): MoveListNode | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status !== 'in_progress') return null;

    const chain = this.getChain(lobbyId);
    if (!chain || !chain.tail) return null;

    const playerInLobby = lobby.players.some((p) => p.id === playerId);
    if (!playerInLobby) return null;

    const step = chain.tail.step + 1;
    const resolvedUrl = url?.trim() || wikipediaArticleUrl(article);
    const end = articlesMatch(article, lobby.targetArticle);

    const node: MoveListNode = {
      article,
      url: resolvedUrl,
      step,
      next: null,
      end,
    };

    chain.tail.next = node;
    chain.tail = node;

    this.broadcast(lobby, {
      type: 'move_made',
      payload: {
        playerId,
        article,
        url: resolvedUrl,
        step,
        end,
      },
    });

    if (end) {
      this.finishGame(lobbyId, playerId);
    }

    return node;
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

  private serializeChain(
    head: MoveListNode | null
  ): MoveListNodeSnapshot | null {
    if (!head) return null;
    return {
      article: head.article,
      url: head.url,
      step: head.step,
      end: head.end,
      next: this.serializeChain(head.next),
    };
  }

  broadcastLobbySync(lobby: Lobby): void {
    this.broadcast(lobby, {
      type: 'lobby_sync',
      payload: this.snapshot(lobby),
    });
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
