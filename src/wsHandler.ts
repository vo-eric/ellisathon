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

  if (!lobbyId || !playerName) {
    ws.close(4000, 'Missing lobbyId or playerName query params');
    return;
  }

  const lobby = manager.getLobby(lobbyId);
  if (!lobby) {
    ws.close(4001, 'Lobby not found');
    return;
  }

  const player = manager.addPlayer(lobbyId, playerName, ws);
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

  if (lobby.players.length === lobby.maxPlayers) {
    manager.startGame(lobbyId);
  }

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
