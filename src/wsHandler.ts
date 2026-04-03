import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { LobbyManager } from './lobby';
import { ClientMessage, Player } from './types';

/**
 * Handles the WebSocket upgrade lifecycle.
 *
 * Connection URL format: ws://host/ws?lobbyId=<id>&playerName=<name>
 */
export function handleWsConnection(
  ws: WebSocket,
  req: IncomingMessage,
  manager: LobbyManager
) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const lobbyId = url.searchParams.get('lobbyId');
  const playerName = url.searchParams.get('playerName');
  const playerId = url.searchParams.get('playerId');

  if (!lobbyId || !playerName || !playerId) {
    ws.close(4000, 'Missing lobbyId, playerId, and/or playerName query params');
    return;
  }

  const lobby = manager.getLobby(lobbyId);
  if (!lobby) {
    ws.close(4001, 'Lobby not found');
    return;
  }

  const player = manager.addPlayer(lobbyId, playerName, playerId, ws);
  if (!player) {
    ws.close(4002, 'Could not join lobby (full or already started)');
    return;
  }

  manager.sendTo(player, {
    type: 'lobby_state',
    payload: {
      playerId: player.id,
      lobby: manager.snapshot(lobby),
    },
  });

  ws.on('message', (raw) => {
    handleMessage(raw, player, lobbyId, manager);
  });

  ws.on('close', () => {
    manager.removePlayer(lobbyId, player.id);
  });
}

function handleMessage(
  raw: WebSocket.RawData,
  player: Player,
  lobbyId: string,
  manager: LobbyManager
) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    manager.sendTo(player, {
      type: 'error',
      payload: { message: 'Invalid JSON' },
    });
    return;
  }

  switch (msg.type) {
    case 'set_ready': {
      const ready = msg.payload.ready;
      if (typeof ready !== 'boolean') {
        manager.sendTo(player, {
          type: 'error',
          payload: { message: 'set_ready requires boolean ready' },
        });
        return;
      }
      const ok = manager.setSeatReady(lobbyId, player.id, ready);
      if (!ok) {
        manager.sendTo(player, {
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
      if (typeof seatIndex !== 'number' || !Number.isInteger(seatIndex)) {
        manager.sendTo(player, {
          type: 'error',
          payload: { message: 'claim_seat requires integer seatIndex' },
        });
        return;
      }
      const ok = manager.claimSeat(lobbyId, player.id, seatIndex);
      if (!ok) {
        manager.sendTo(player, {
          type: 'error',
          payload: {
            message:
              'Cannot claim that seat (taken, invalid index, or game already started)',
          },
        });
      }
      break;
    }

    case 'move': {
      const article = msg.payload.article as string | undefined;
      if (!article) {
        manager.sendTo(player, {
          type: 'error',
          payload: { message: "Move requires an 'article' field" },
        });
        return;
      }
      const url = msg.payload.url as string | undefined;
      const move = manager.recordMove(lobbyId, player.id, article, url);
      if (!move) {
        manager.sendTo(player, {
          type: 'error',
          payload: {
            message: 'Cannot record move — game may not be in progress',
          },
        });
      }
      break;
    }

    default:
      manager.sendTo(player, {
        type: 'error',
        payload: { message: `Unknown message type: ${msg.type}` },
      });
  }
}
