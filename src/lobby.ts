import {
  Article,
  GameMode,
  Lobby,
  LobbySnapshot,
  MoveListNode,
  MoveListNodeSnapshot,
  Player,
  ServerMessage,
} from './types';

const DEFAULT_SEATS = 2;
const MIN_SEATS = 1;
const MAX_SEATS = 8;
const COUNTDOWN_SECONDS = 5;

const DEFAULT_TIME_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
const MIN_TIME_LIMIT_MS = 30 * 1000; // 30 seconds
const MAX_TIME_LIMIT_MS = 60 * 60 * 1000; // 60 minutes

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
  private matchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  createLobby(
    startArticle: Article,
    targetArticle: Article,
    hostId: string
  ): Lobby {
    const lobby: Lobby = {
      id: crypto.randomUUID(),
      status: 'waiting',
      hostId,
      players: [],
      seats: Array.from({ length: DEFAULT_SEATS }, () => null),
      seatReady: Array.from({ length: DEFAULT_SEATS }, () => false),
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      startArticle,
      targetArticle,
      winnerId: null,
      maxPlayers: DEFAULT_SEATS,
      mode: 'race',
      timeLimitMs: DEFAULT_TIME_LIMIT_MS,
      participants: [],
      progress: {},
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

    const deadline =
      lobby.mode === 'golf' &&
      lobby.status === 'in_progress' &&
      lobby.startedAt !== null
        ? lobby.startedAt + lobby.timeLimitMs
        : null;

    return {
      id: lobby.id,
      status: lobby.status,
      hostId: lobby.hostId,
      players: lobby.players.map((p) => ({ id: p.id, name: p.name })),
      seats: [...lobby.seats],
      seatReady: [...lobby.seatReady],
      moveChain,
      startArticle: hideStart ? null : lobby.startArticle,
      targetArticle: lobby.targetArticle,
      winnerId: lobby.winnerId,
      maxPlayers: lobby.maxPlayers,
      mode: lobby.mode,
      timeLimitMs: lobby.timeLimitMs,
      deadline,
      participants: lobby.participants.map((p) => ({ ...p })),
      progress: Object.fromEntries(
        Object.entries(lobby.progress).map(([id, p]) => [id, { ...p }])
      ),
    };
  }

  listLobbies(): LobbySnapshot[] {
    return Array.from(this.lobbies.values()).map((l) => this.snapshot(l));
  }

  listJoinableLobbies(): LobbySnapshot[] {
    return Array.from(this.lobbies.values())
      .filter((l) => l.status === 'waiting')
      .map((l) => this.snapshot(l));
  }

  addPlayer(
    lobbyId: string,
    playerName: string,
    playerId: string,
    ws: WebSocket
  ): Player | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;
    if (lobby.status !== 'waiting') return null;

    const player: Player = {
      id: playerId,
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

    // In an active golf match, a leaving participant is treated as a forfeit so
    // the game can still end for everyone else.
    let golfForfeited = false;
    if (lobby.mode === 'golf' && lobby.status === 'in_progress') {
      const progress = lobby.progress[playerId];
      if (progress && progress.status === 'racing') {
        progress.status = 'forfeited';
        golfForfeited = true;
      }
    }

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

    if (golfForfeited) {
      this.broadcast(lobby, {
        type: 'player_forfeited',
        payload: { playerId },
      });
    }

    if (lobby.players.length === 0) {
      this.cancelMatchTimer(lobbyId);
      this.lobbies.delete(lobbyId);
      this.moveChains.delete(lobbyId);
      return;
    }

    if (lobby.hostId === playerId) {
      const idx = Math.floor(Math.random() * lobby.players.length);
      lobby.hostId = lobby.players[idx].id;
    }
    this.broadcastLobbySync(lobby);

    if (golfForfeited) {
      this.maybeEndGolfGame(lobbyId);
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
    return true;
  }

  allSeatedPlayersReady(lobby: Lobby): boolean {
    let seatedCount = 0;
    for (let i = 0; i < lobby.seats.length; i++) {
      if (lobby.seats[i] !== null) {
        seatedCount++;
        if (!lobby.seatReady[i]) return false;
        if (!lobby.players.some((p) => p.id === lobby.seats[i])) return false;
      }
    }
    return seatedCount > 0;
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
        payload: {
          secondsLeft: s,
          startArticle: lobby.startArticle,
        },
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
    if (!this.allSeatedPlayersReady(lobby)) return false;

    const chain = this.getChain(lobbyId);
    if (!chain) return false;

    lobby.status = 'in_progress';
    lobby.startedAt = Date.now();

    // Capture the seated players as participants and seed their progress.
    lobby.participants = lobby.seats
      .filter((id): id is string => id !== null)
      .map((id) => {
        const player = lobby.players.find((p) => p.id === id);
        return { id, name: player?.name ?? 'Unknown' };
      });
    lobby.progress = {};
    for (const participant of lobby.participants) {
      lobby.progress[participant.id] = {
        status: 'racing',
        clicks: 0,
        finishedAt: null,
      };
    }

    const url = wikipediaArticleUrl(lobby.startArticle.url);
    const end = articlesMatch(
      lobby.startArticle.title,
      lobby.targetArticle.title
    );
    const first: MoveListNode = {
      article: lobby.startArticle.title,
      url,
      step: 1,
      next: null,
      end,
      playerId: null,
    };
    chain.head = first;
    chain.tail = first;

    this.broadcast(lobby, {
      type: 'game_start',
      payload: this.snapshot(lobby),
    });

    if (end) {
      // Degenerate case: start article already is the target.
      if (lobby.mode === 'golf') {
        const now = Date.now();
        let i = 0;
        for (const participant of lobby.participants) {
          const p = lobby.progress[participant.id];
          // +i keeps finishedAt strictly ordered so tie-breaking is deterministic.
          p.status = 'finished';
          p.finishedAt = now + i++;
        }
        this.endGolfGame(lobbyId);
      } else if (lobby.players[0]) {
        this.finishGame(lobbyId, lobby.players[0].id);
      }
      return true;
    }

    if (lobby.mode === 'golf') {
      this.scheduleMatchTimer(lobbyId, lobby.timeLimitMs);
    }

    return true;
  }

  /** Host-only: begin the countdown → game start. Returns error string on failure. */
  startGame(lobbyId: string, playerId: string): string | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return 'Lobby not found';
    if (lobby.hostId !== playerId) return 'Only the host can start the game';
    if (lobby.status !== 'waiting') return 'Game already started';
    if (!this.allSeatedPlayersReady(lobby))
      return 'Not all seated players are ready';
    if (this.countdownTokens.has(lobbyId))
      return 'Countdown already in progress';

    this.tryBeginCountdown(lobbyId);
    return null;
  }

  /** Host-only: kick a player out of their seat (they remain in the lobby). */
  kickSeat(lobbyId: string, hostId: string, seatIndex: number): string | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return 'Lobby not found';
    if (lobby.hostId !== hostId) return 'Only the host can kick players';
    if (lobby.status !== 'waiting') return 'Cannot kick after game started';
    if (seatIndex < 0 || seatIndex >= lobby.seats.length)
      return 'Invalid seat index';
    if (lobby.seats[seatIndex] === null) return 'Seat is already empty';

    this.cancelCountdown(lobbyId);

    lobby.seats[seatIndex] = null;
    lobby.seatReady[seatIndex] = false;

    this.broadcastLobbySync(lobby);
    return null;
  }

  /** Host-only: change the number of seats. Returns error string on failure. */
  setSeats(lobbyId: string, playerId: string, count: number): string | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return 'Lobby not found';
    if (lobby.hostId !== playerId) return 'Only the host can change seat count';
    if (lobby.status !== 'waiting')
      return 'Cannot change seats after game started';
    if (count < MIN_SEATS || count > MAX_SEATS)
      return `Seat count must be between ${MIN_SEATS} and ${MAX_SEATS}`;

    const occupiedCount = lobby.seats.filter((s) => s !== null).length;
    if (count < occupiedCount) {
      return `Cannot reduce seats below the number of occupied seats (${occupiedCount})`;
    }

    this.cancelCountdown(lobbyId);

    if (count > lobby.seats.length) {
      while (lobby.seats.length < count) {
        lobby.seats.push(null);
        lobby.seatReady.push(false);
      }
    } else if (count < lobby.seats.length) {
      lobby.seats.length = count;
      lobby.seatReady.length = count;
    }
    lobby.maxPlayers = count;

    this.broadcastLobbySync(lobby);
    return null;
  }

  /** Host-only: switch the game mode while waiting. Returns error string on failure. */
  setMode(lobbyId: string, playerId: string, mode: GameMode): string | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return 'Lobby not found';
    if (lobby.hostId !== playerId) return 'Only the host can change the mode';
    if (lobby.status !== 'waiting')
      return 'Cannot change mode after game started';
    if (mode !== 'race' && mode !== 'golf') return 'Invalid game mode';

    this.cancelCountdown(lobbyId);
    lobby.mode = mode;

    this.broadcastLobbySync(lobby);
    return null;
  }

  /** Host-only: set the golf-mode time limit (in seconds). Returns error string on failure. */
  setTimeLimit(
    lobbyId: string,
    playerId: string,
    seconds: number
  ): string | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return 'Lobby not found';
    if (lobby.hostId !== playerId)
      return 'Only the host can change the time limit';
    if (lobby.status !== 'waiting')
      return 'Cannot change the time limit after game started';
    if (!Number.isFinite(seconds)) return 'Invalid time limit';

    const ms = Math.round(seconds * 1000);
    if (ms < MIN_TIME_LIMIT_MS || ms > MAX_TIME_LIMIT_MS) {
      return `Time limit must be between ${MIN_TIME_LIMIT_MS / 1000} and ${
        MAX_TIME_LIMIT_MS / 1000
      } seconds`;
    }

    this.cancelCountdown(lobbyId);
    lobby.timeLimitMs = ms;

    this.broadcastLobbySync(lobby);
    return null;
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

    // In golf, once a player has finished or forfeited their moves no longer count.
    if (lobby.mode === 'golf') {
      const progress = lobby.progress[playerId];
      if (!progress || progress.status !== 'racing') return null;
    }

    const step = chain.tail.step + 1;
    const resolvedUrl = url?.trim() || wikipediaArticleUrl(article);
    const end = articlesMatch(article, lobby.targetArticle.title);

    const node: MoveListNode = {
      article,
      url: resolvedUrl,
      step,
      next: null,
      end,
      playerId,
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

    if (lobby.mode === 'golf') {
      const progress = lobby.progress[playerId];
      if (progress) {
        progress.clicks++;
        if (end && progress.status === 'racing') {
          progress.status = 'finished';
          progress.finishedAt = Date.now();
          this.maybeEndGolfGame(lobbyId);
        }
      }
    } else if (end) {
      this.finishGame(lobbyId, playerId);
    }

    return node;
  }

  /** Golf: a player abandons the match. They can no longer win or move. */
  forfeit(lobbyId: string, playerId: string): string | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return 'Lobby not found';
    if (lobby.mode !== 'golf') return 'Forfeit is only available in golf mode';
    if (lobby.status !== 'in_progress') return 'Game is not in progress';

    const progress = lobby.progress[playerId];
    if (!progress) return 'You are not a participant in this match';
    if (progress.status !== 'racing') return 'You have already finished';

    progress.status = 'forfeited';

    this.broadcast(lobby, {
      type: 'player_forfeited',
      payload: { playerId },
    });

    this.maybeEndGolfGame(lobbyId);
    return null;
  }

  /** Golf: end the game once every participant has finished or forfeited. */
  private maybeEndGolfGame(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.mode !== 'golf' || lobby.status !== 'in_progress')
      return;

    const allDone = lobby.participants.every(
      (p) => lobby.progress[p.id]?.status !== 'racing'
    );
    if (allDone) {
      this.endGolfGame(lobbyId);
    }
  }

  /** Golf: resolve the winner (fewest clicks; earliest finish breaks ties) and finish. */
  private endGolfGame(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.status === 'finished') return;

    this.cancelMatchTimer(lobbyId);

    // Any racing participant left when the timer expires is treated as forfeited.
    for (const participant of lobby.participants) {
      const p = lobby.progress[participant.id];
      if (p && p.status === 'racing') {
        p.status = 'forfeited';
      }
    }

    let winnerId: string | null = null;
    let bestClicks = Infinity;
    let bestFinishedAt = Infinity;
    for (const participant of lobby.participants) {
      const p = lobby.progress[participant.id];
      if (!p || p.status !== 'finished' || p.finishedAt === null) continue;
      if (
        p.clicks < bestClicks ||
        (p.clicks === bestClicks && p.finishedAt < bestFinishedAt)
      ) {
        winnerId = participant.id;
        bestClicks = p.clicks;
        bestFinishedAt = p.finishedAt;
      }
    }

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

  private scheduleMatchTimer(lobbyId: string, durationMs: number): void {
    this.cancelMatchTimer(lobbyId);
    const handle = setTimeout(() => {
      this.matchTimers.delete(lobbyId);
      this.endGolfGame(lobbyId);
    }, durationMs);
    this.matchTimers.set(lobbyId, handle);
  }

  private cancelMatchTimer(lobbyId: string): void {
    const handle = this.matchTimers.get(lobbyId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.matchTimers.delete(lobbyId);
    }
  }

  private finishGame(lobbyId: string, winnerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    this.cancelMatchTimer(lobbyId);

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
      playerId: head.playerId,
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
      if (player.ws.readyState === 1) {
        player.ws.send(data);
      }
    }
  }

  sendTo(player: Player, message: ServerMessage): void {
    if (player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(message));
    }
  }
}
