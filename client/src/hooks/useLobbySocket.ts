import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LobbySnapshot,
  MoveListNodeSnapshot,
  ServerMessage,
} from '../types';
import type { PathMove } from './useReplay';
import { apiUrl, lobbyWebSocketUrl } from '../apiBase';
import {
  normalizeLobbySnapshot,
  normalizeLobbyList,
  coerceArticle,
} from '../utils/lobbyWire';

export type Screen =
  | 'alias'
  | 'lobbies'
  | 'waiting'
  | 'game'
  | 'gameover'
  | 'results';

export interface WaitingState {
  lobby: LobbySnapshot | null;
  info: string;
  countdownSeconds: number | null;
}

export type Match =
  | { status: 'idle' }
  | {
      status: 'countdown';
      startTitle: string;
      targetTitle: string;
      iframeSrc: string;
      secondsLeft: number;
    }
  | {
      status: 'playing';
      startTitle: string;
      targetTitle: string;
      iframeSrc: string;
      seats: (string | null)[];
      players: { id: string; name: string }[];
      playerMoves: Map<string, PathMove[]>;
      moveChain: MoveListNodeSnapshot | null;
      startedAtMs: number;
    }
  | {
      status: 'finished';
      lobby: LobbySnapshot;
      moveChain: MoveListNodeSnapshot | null;
      startedAtMs: number;
    };

interface UseLobbySocketOptions {
  playerName: string;
  myPlayerId: string;
  /** Called when refs managed outside this hook need resetting (game start / back to lobbies). */
  onResetNavigation: () => void;
  /** Server confirms our player id after WS connect (keeps client in sync with query param). */
  onPlayerIdFromServer?: (playerId: string) => void;
}

export function useLobbySocket({
  playerName,
  myPlayerId,
  onResetNavigation,
  onPlayerIdFromServer,
}: UseLobbySocketOptions) {
  const [screen, setScreen] = useState<Screen>('alias');
  const [lobbies, setLobbies] = useState<LobbySnapshot[]>([]);
  const [creatingLobby, setCreatingLobby] = useState(false);
  const [waiting, setWaiting] = useState<WaitingState | null>(null);
  const [match, setMatch] = useState<Match>({ status: 'idle' });
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const waitingLobbyRef = useRef<LobbySnapshot | null>(null);

  const refreshLobbies = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/lobbies/joinable'));
      const data = await res.json();
      setLobbies(normalizeLobbyList(data));
    } catch (e) {
      console.error('Failed to fetch lobbies', e);
    }
  }, []);

  useEffect(() => {
    if (screen !== 'lobbies') return;
    refreshLobbies();
    const id = window.setInterval(refreshLobbies, 3000);
    return () => clearInterval(id);
  }, [screen, refreshLobbies]);

  const handleServerMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'lobby_state': {
        const pid = msg.payload.playerId;
        if (pid) {
          onPlayerIdFromServer?.(pid);
        }
        const lobby = normalizeLobbySnapshot(msg.payload.lobby);
        waitingLobbyRef.current = lobby;
        setWaiting((prev) =>
          prev
            ? { ...prev, lobby }
            : { lobby, info: '', countdownSeconds: null }
        );
        break;
      }
      case 'lobby_sync': {
        const lobby = normalizeLobbySnapshot(msg.payload);
        waitingLobbyRef.current = lobby;
        setWaiting((prev) =>
          prev
            ? { ...prev, lobby, countdownSeconds: null }
            : { lobby, info: '', countdownSeconds: null }
        );
        break;
      }
      case 'countdown_tick': {
        const secondsLeft = msg.payload.secondsLeft;
        const startArt = coerceArticle(msg.payload.startArticle);
        setWaiting((prev) =>
          prev ? { ...prev, countdownSeconds: secondsLeft } : prev
        );
        const targetTitle = coerceArticle(
          waitingLobbyRef.current?.targetArticle
        ).title;
        setMatch((prev) => {
          if (prev.status === 'playing' || prev.status === 'finished') {
            return prev;
          }
          return {
            status: 'countdown',
            startTitle: startArt.title,
            targetTitle:
              prev.status === 'countdown' ? prev.targetTitle : targetTitle,
            iframeSrc: apiUrl('/wiki/' + encodeURIComponent(startArt.title)),
            secondsLeft,
          };
        });
        setScreen((prev) => (prev === 'waiting' ? 'game' : prev));
        break;
      }
      case 'game_start': {
        const lobby = normalizeLobbySnapshot(msg.payload);
        const startArt = coerceArticle(lobby.startArticle);
        const targetArt = coerceArticle(lobby.targetArticle);
        const startTitle = startArt.title;
        setWaiting(null);
        onResetNavigation();
        const seed = new Map<string, PathMove[]>();
        for (const p of lobby.players) {
          seed.set(p.id, [
            {
              article: startTitle,
              url: `/wiki/${encodeURIComponent(startTitle.replace(/ /g, '_'))}`,
              step: 1,
              end: false,
              timestamp: Date.now(),
            },
          ]);
        }
        setMatch({
          status: 'playing',
          startTitle,
          targetTitle: targetArt.title,
          iframeSrc: apiUrl('/wiki/' + encodeURIComponent(startTitle)),
          seats: [...lobby.seats],
          players: [...lobby.players],
          playerMoves: seed,
          moveChain: lobby.moveChain ?? null,
          startedAtMs: Date.now(),
        });
        setScreen('game');
        break;
      }
      case 'move_made':
        setMatch((prev) => {
          if (prev.status !== 'playing') return prev;
          const pid = msg.payload.playerId;
          if (!pid) return prev;
          const previousMoves = prev.playerMoves.get(pid) ?? [];
          const lastMove = previousMoves[previousMoves.length - 1];
          if (lastMove && lastMove.url === msg.payload.url) return prev;

          const newMove = {
            article: msg.payload.article,
            url: msg.payload.url,
            step: msg.payload.step,
            end: msg.payload.end,
            timestamp: Date.now(),
          };
          const next = new Map(prev.playerMoves);
          next.set(pid, [...previousMoves, newMove]);
          return { ...prev, playerMoves: next };
        });
        break;
      case 'game_over': {
        const lobby = normalizeLobbySnapshot(msg.payload.lobby);
        setMatch((prev) => ({
          status: 'finished' as const,
          lobby,
          moveChain: lobby.moveChain ?? null,
          startedAtMs:
            prev.status === 'playing' ? prev.startedAtMs : Date.now(),
        }));
        setScreen('gameover');
        break;
      }
      case 'error':
        console.error('Server error:', msg.payload.message);
        setLobbyError(msg.payload.message);
        break;
    }
  };

  const joinLobby = (lobbyId: string) => {
    const prev = wsRef.current;
    if (prev) {
      prev.close();
      wsRef.current = null;
    }
    const url = lobbyWebSocketUrl(lobbyId, playerName, myPlayerId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      setWaiting({
        lobby: null,
        info: 'Connected. Pick a seat when the lobby loads.',
        countdownSeconds: null,
      });
      setScreen('waiting');
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      handleServerMessage(msg);
    });

    ws.addEventListener('close', (event) => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (event.code >= 4000) {
        window.alert(event.reason || 'Could not join lobby.');
        setScreen('lobbies');
        refreshLobbies();
      }
    });
  };

  const createLobby = async () => {
    setCreatingLobby(true);
    try {
      const res = await fetch(apiUrl('/api/lobbies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: myPlayerId }),
      });
      if (!res.ok) throw new Error('Failed');
      const lobby = (await res.json()) as LobbySnapshot;
      joinLobby(lobby.id);
    } catch {
      window.alert('Could not create lobby. Try again.');
    } finally {
      setCreatingLobby(false);
    }
  };

  const backToLobbies = () => {
    wsRef.current?.close();
    wsRef.current = null;
    waitingLobbyRef.current = null;
    setMatch({ status: 'idle' });
    setWaiting(null);
    onResetNavigation();
    setScreen('lobbies');
    refreshLobbies();
  };

  const claimSeat = useCallback((seatIndex: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'claim_seat', payload: { seatIndex } }));
  }, []);

  const setReady = useCallback((ready: boolean) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'set_ready', payload: { ready } }));
  }, []);

  const startGame = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'start_game', payload: {} }));
  }, []);

  const setSeats = useCallback((count: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'set_seats', payload: { count } }));
  }, []);

  const kickSeat = useCallback((seatIndex: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'kick_seat', payload: { seatIndex } }));
  }, []);

  const dismissLobbyError = useCallback(() => {
    setLobbyError(null);
  }, []);

  const sendMove = useCallback((article: string, url: string) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'move', payload: { article, url } }));
  }, []);

  const setIframeSrc = useCallback((href: string) => {
    setMatch((prev) =>
      prev.status === 'playing' ? { ...prev, iframeSrc: href } : prev
    );
  }, []);

  return {
    screen,
    setScreen,
    lobbies,
    creatingLobby,
    waiting,
    match,
    lobbyError,
    joinLobby,
    createLobby,
    backToLobbies,
    claimSeat,
    setReady,
    startGame,
    setSeats,
    kickSeat,
    dismissLobbyError,
    sendMove,
    setIframeSrc,
  };
}
