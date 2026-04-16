import { LobbyManager } from './lobby';
import { getRandomArticles } from './wikipedia';
import { ClientMessage } from './types';

export class LobbyManagerDO implements DurableObject {
  private manager = new LobbyManager();

  constructor(private ctx: DurableObjectState, private env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(url);
    }

    return this.handleApi(request, url);
  }

  // ── WebSocket upgrade ───────────────────────────────────────────────

  private handleWebSocketUpgrade(url: URL): Response {
    const lobbyId = url.searchParams.get('lobbyId');
    const playerName = url.searchParams.get('playerName');
    const playerId = url.searchParams.get('playerId');

    if (!lobbyId || !playerName || !playerId) {
      return new Response(
        'Missing lobbyId, playerId, and/or playerName query params',
        { status: 400 }
      );
    }

    const lobby = this.manager.getLobby(lobbyId);
    if (!lobby) {
      return new Response('Lobby not found', { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    const player = this.manager.addPlayer(
      lobbyId,
      playerName,
      playerId,
      server
    );
    if (!player) {
      server.close(4002, 'Could not join lobby (game already started)');
      return new Response(null, { status: 101, webSocket: client });
    }

    server.addEventListener('message', (event) => {
      const currentLobby = this.manager.getLobby(lobbyId);
      if (!currentLobby) return;

      const currentPlayer = currentLobby.players.find(
        (p) => p.id === playerId
      );
      if (!currentPlayer) return;

      let msg: ClientMessage;
      try {
        msg = JSON.parse(
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer)
        );
      } catch {
        this.manager.sendTo(currentPlayer, {
          type: 'error',
          payload: { message: 'Invalid JSON' },
        });
        return;
      }

      switch (msg.type) {
        case 'set_ready': {
          const ready = msg.payload.ready;
          if (typeof ready !== 'boolean') {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: 'set_ready requires boolean ready' },
            });
            return;
          }
          const ok = this.manager.setSeatReady(
            lobbyId,
            currentPlayer.id,
            ready
          );
          if (!ok) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: {
                message:
                  'Cannot set ready (you must be seated, or game already started)',
              },
            });
          }
          break;
        }

        case 'claim_seat': {
          const seatIndex = msg.payload.seatIndex;
          if (
            typeof seatIndex !== 'number' ||
            !Number.isInteger(seatIndex)
          ) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: 'claim_seat requires integer seatIndex' },
            });
            return;
          }
          const ok = this.manager.claimSeat(
            lobbyId,
            currentPlayer.id,
            seatIndex
          );
          if (!ok) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: {
                message:
                  'Cannot claim that seat (taken, invalid index, or game already started)',
              },
            });
          }
          break;
        }

        case 'start_game': {
          const err = this.manager.startGame(lobbyId, currentPlayer.id);
          if (err) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: err },
            });
          }
          break;
        }

        case 'set_seats': {
          const count = msg.payload.count;
          if (typeof count !== 'number' || !Number.isInteger(count)) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: 'set_seats requires integer count' },
            });
            return;
          }
          const err = this.manager.setSeats(
            lobbyId,
            currentPlayer.id,
            count
          );
          if (err) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: err },
            });
          }
          break;
        }

        case 'kick_seat': {
          const seatIndex = msg.payload.seatIndex;
          if (
            typeof seatIndex !== 'number' ||
            !Number.isInteger(seatIndex)
          ) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: 'kick_seat requires integer seatIndex' },
            });
            return;
          }
          const err = this.manager.kickSeat(
            lobbyId,
            currentPlayer.id,
            seatIndex
          );
          if (err) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: err },
            });
          }
          break;
        }

        case 'move': {
          const article = msg.payload.article as string | undefined;
          if (!article) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: { message: "Move requires an 'article' field" },
            });
            return;
          }
          const moveUrl = msg.payload.url as string | undefined;
          const move = this.manager.recordMove(
            lobbyId,
            currentPlayer.id,
            article,
            moveUrl
          );
          if (!move) {
            this.manager.sendTo(currentPlayer, {
              type: 'error',
              payload: {
                message:
                  'Cannot record move — game may not be in progress',
              },
            });
          }
          break;
        }

        default:
          this.manager.sendTo(currentPlayer, {
            type: 'error',
            payload: { message: `Unknown message type: ${msg.type}` },
          });
      }
    });

    server.addEventListener('close', () => {
      this.manager.removePlayer(lobbyId, playerId);
    });

    server.addEventListener('error', () => {
      this.manager.removePlayer(lobbyId, playerId);
    });

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
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const hostId = typeof body.hostId === 'string' ? body.hostId : '';
        const { start, target } = await getRandomArticles();
        const lobby = this.manager.createLobby(start, target, hostId);
        return Response.json(this.manager.snapshot(lobby), { status: 201 });
      } catch (err) {
        console.error('Wikipedia fetch error:', err);
        return Response.json(
          { error: 'Failed to fetch Wikipedia articles' },
          { status: 502 }
        );
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
        return Response.json(
          { error: 'Failed to fetch Wikipedia articles' },
          { status: 502 }
        );
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
}
