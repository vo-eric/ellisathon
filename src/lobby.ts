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

const MAX_PLAYERS = 1;

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

export class LobbyManager {
  private lobbies: Map<string, Lobby> = new Map();
  /** Move path per lobby (linked list); key = lobby id */
  private moveChains: Map<string, MoveChain> = new Map();

  createLobby(startArticle: string, targetArticle: string): Lobby {
    const lobby: Lobby = {
      id: uuidv4(),
      status: 'waiting',
      players: [],
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

    return player;
  }

  removePlayer(lobbyId: string, playerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.players = lobby.players.filter((p) => p.id !== playerId);

    this.broadcast(lobby, {
      type: 'player_left',
      payload: { playerId },
    });

    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      this.moveChains.delete(lobbyId);
    }
  }

  startGame(lobbyId: string): boolean {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return false;
    if (lobby.status !== 'waiting') return false;
    if (lobby.players.length < 1) return false;

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

  snapshot(lobby: Lobby): LobbySnapshot {
    const chain = this.getChain(lobby.id);
    const moveChain = chain?.head ? this.serializeChain(chain.head) : null;

    return {
      id: lobby.id,
      status: lobby.status,
      players: lobby.players.map((p) => ({ id: p.id, name: p.name })),
      moveChain,
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
