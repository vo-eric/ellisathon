import { LobbyManager } from './lobby';
import { getRandomArticles } from './wikipedia';
import { ClientMessage, Player } from './types';

interface PlayerMeta {
  lobbyId: string;
  playerId: string;
  playerName: string;
}

export class LobbyManagerDO implements DurableObject {
  private manager = new LobbyManager();

  constructor(
    private ctx: DurableObjectState,
    private env: unknown
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(url);
    }

    return this.handleApi(request, url);
  }

  // ── WebSocket Hibernation handlers ──────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const meta = ws.deserializeAttachment() as PlayerMeta | null;
    if (!meta) return;

    const lobby = this.manager.getLobby(meta.lobbyId);
    if (!lobby) return;

    const player = lobby.players.find((p) => p.id === meta.playerId);
    if (!player) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      this.manager.sendTo(player, {
        type: 'error',
        payload: { message: 'Invalid JSON' },
      });
      return;
    }

    switch (msg.type) {
      case 'set_ready': {
        const ready = msg.payload.ready;
        if (typeof ready !== 'boolean') {
          this.manager.sendTo(player, {
            type: 'error',
            payload: { message: 'set_ready requires boolean ready' },
          });
          return;
        }
        const ok = this.manager.setSeatReady(meta.lobbyId, player.id, ready);
        if (!ok) {
          this.manager.sendTo(player, {
            type: 'error',
            payload: { message: 'Cannot set ready (you must be seated, or game already started)' },
          });
        }
        break;
      }

      case 'claim_seat': {
        const seatIndex = msg.payload.seatIndex;
        if (typeof seatIndex !== 'number' || !Number.isInteger(seatIndex)) {
          this.manager.sendTo(player, {
            type: 'error',
            payload: { message: 'claim_seat requires integer seatIndex' },
          });
          return;
        }
        const ok = this.manager.claimSeat(meta.lobbyId, player.id, seatIndex);
        if (!ok) {
          this.manager.sendTo(player, {
            type: 'error',
            payload: { message: 'Cannot claim that seat (taken, invalid index, or game already started)' },
          });
        }
        break;
      }

      case 'move': {
        const article = msg.payload.article as string | undefined;
        if (!article) {
          this.manager.sendTo(player, {
            type: 'error',
            payload: { message: "Move requires an 'article' field" },
          });
          return;
        }
        const moveUrl = msg.payload.url as string | undefined;
        const move = this.manager.recordMove(meta.lobbyId, player.id, article, moveUrl);
        if (!move) {
          this.manager.sendTo(player, {
            type: 'error',
            payload: { message: 'Cannot record move — game may not be in progress' },
          });
        }
        break;
      }

      default:
        this.manager.sendTo(player, {
          type: 'error',
          payload: { message: `Unknown message type: ${msg.type}` },
        });
    }
  }

  async webSocketClose(ws: WebSocket) {
    const meta = ws.deserializeAttachment() as PlayerMeta | null;
    if (!meta) return;
    this.manager.removePlayer(meta.lobbyId, meta.playerId);
  }

  async webSocketError(ws: WebSocket) {
    const meta = ws.deserializeAttachment() as PlayerMeta | null;
    if (!meta) return;
    this.manager.removePlayer(meta.lobbyId, meta.playerId);
  }

  // ── WebSocket upgrade ───────────────────────────────────────────────

  private handleWebSocketUpgrade(url: URL): Response {
    const lobbyId = url.searchParams.get('lobbyId');
    const playerName = url.searchParams.get('playerName');
    const playerId = url.searchParams.get('playerId');

    if (!lobbyId || !playerName || !playerId) {
      return new Response('Missing lobbyId, playerId, and/or playerName query params', { status: 400 });
    }

    const lobby = this.manager.getLobby(lobbyId);
    if (!lobby) {
      return new Response('Lobby not found', { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ lobbyId, playerId, playerName } satisfies PlayerMeta);

    const player = this.manager.addPlayer(lobbyId, playerName, playerId, server);
    if (!player) {
      server.close(4002, 'Could not join lobby (full or already started)');
      return new Response(null, { status: 101, webSocket: client });
    }

    this.manager.sendTo(player, {
      type: 'lobby_state',
      payload: {
        playerId: player.id,
        lobby: this.manager.snapshot(lobby),
      },
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── REST API ────────────────────────────────────────────────────────

  private async handleApi(request: Request, url: URL): Promise<Response> {
    const { pathname } = url;
    const method = request.method;

    if (pathname === '/api/lobbies' && method === 'POST') {
      try {
        const { start, target } = await getRandomArticles();
        const lobby = this.manager.createLobby(start, target);
        return Response.json(this.manager.snapshot(lobby), { status: 201 });
      } catch (err) {
        console.error('Wikipedia fetch error:', err);
        return Response.json({ error: 'Failed to fetch Wikipedia articles' }, { status: 502 });
      }
    }

    if (pathname === '/api/lobbies' && method === 'GET') {
      return Response.json(this.manager.listLobbies());
    }

    if (pathname === '/api/lobbies/joinable' && method === 'GET') {
      return Response.json(this.manager.listJoinableLobbies());
    }

    const lobbyMatch = pathname.match(/^\/api\/lobbies\/([^/]+)$/);
    if (lobbyMatch && method === 'GET') {
      const lobby = this.manager.getLobby(lobbyMatch[1]);
      if (!lobby) {
        return Response.json({ error: 'Lobby not found' }, { status: 404 });
      }
      return Response.json(this.manager.snapshot(lobby));
    }

    if (pathname === '/api/wikipedia/random' && method === 'GET') {
      try {
        const articles = await getRandomArticles();
        return Response.json(articles);
      } catch {
        return Response.json({ error: 'Failed to fetch Wikipedia articles' }, { status: 502 });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}
