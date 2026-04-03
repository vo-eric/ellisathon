import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WaitingRoom } from './components/WaitingRoom';
import ResultsPage, { SEAT_COLORS } from './components/ResultsPage';
import { GameScreen } from './components/GameScreen';
import EndScreen from './components/EndScreen';
import { moveChainToResultsPaths } from './utils/resultsPaths';
import type { PathMove } from './hooks/useReplay';
import type {
  LobbySnapshot,
  MoveListNodeSnapshot,
  ServerMessage,
} from './types';
import { apiUrl, lobbyWebSocketUrl } from './apiBase';

type Screen = 'alias' | 'lobbies' | 'waiting' | 'game' | 'gameover' | 'results';

interface WaitingState {
  lobby: LobbySnapshot | null;
  info: string;
  countdownSeconds: number | null;
}

type Match =
  | { status: 'idle' }
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

export default function App() {
  const [screen, setScreen] = useState<Screen>('alias');
  const [aliasInput, setAliasInput] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [lobbies, setLobbies] = useState<LobbySnapshot[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [creatingLobby, setCreatingLobby] = useState(false);

  const [waiting, setWaiting] = useState<WaitingState | null>(null);
  const [match, setMatch] = useState<Match>({ status: 'idle' });

  const wsRef = useRef<WebSocket | null>(null);
  const wikiRef = useRef<HTMLIFrameElement>(null);
  const lastProcessedPageUrlRef = useRef('');
  /** Allows A→B→A to count the start article again after leaving it once. */
  const hasLeftStartArticleRef = useRef(false);

  const refreshLobbies = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/lobbies/joinable'));
      const data = (await res.json()) as LobbySnapshot[];
      setLobbies(data);
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
      case 'lobby_state':
        setWaiting((prev) =>
          prev
            ? { ...prev, lobby: msg.payload.lobby }
            : { lobby: msg.payload.lobby, info: '', countdownSeconds: null }
        );
        break;
      case 'lobby_sync':
        setWaiting((prev) =>
          prev
            ? { ...prev, lobby: msg.payload, countdownSeconds: null }
            : { lobby: msg.payload, info: '', countdownSeconds: null }
        );
        break;
      case 'countdown_tick':
        setWaiting((prev) =>
          prev ? { ...prev, countdownSeconds: msg.payload.secondsLeft } : prev
        );
        break;
      case 'player_joined':
        setWaiting((prev) =>
          prev
            ? { ...prev, info: `${msg.payload.name} joined the lobby.` }
            : prev
        );
        break;
      case 'player_left':
        setWaiting((prev) =>
          prev ? { ...prev, info: 'Opponent disconnected.' } : prev
        );
        break;
      case 'game_start': {
        const lobby = msg.payload;
        const { title: startTitle } = lobby.startArticle;
        setWaiting(null);
        lastProcessedPageUrlRef.current = '';
        hasLeftStartArticleRef.current = false;
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
          targetTitle: lobby.targetArticle.title,
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
          console.log('next', next);
          return { ...prev, playerMoves: next };
        });
        break;
      case 'game_over': {
        const { lobby } = msg.payload;
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

  const onAliasSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = aliasInput.trim();
    if (!name) return;
    setPlayerName(name);
    setScreen('lobbies');
    setMyPlayerId(crypto.randomUUID());
  };

  const onCreateLobby = async () => {
    setCreatingLobby(true);
    try {
      const res = await fetch(apiUrl('/api/lobbies'), { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const lobby = (await res.json()) as LobbySnapshot;
      joinLobby(lobby.id);
    } catch {
      window.alert('Could not create lobby. Try again.');
    } finally {
      setCreatingLobby(false);
    }
  };

  const onWikiFrameLoad = () => {
    if (match.status !== 'playing') return;

    const frame = wikiRef.current;
    if (!frame) return;

    try {
      let href = frame.src;
      try {
        if (frame.contentWindow?.location?.href) {
          href = frame.contentWindow.location.href;
        }
      } catch {
        console.log('cross-origin iframe; falling back to frame.src');
      }
      if (!href) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;

      let rawTitle: string | null = null;
      if (url.pathname.startsWith('/wiki/')) {
        rawTitle = decodeURIComponent(url.pathname.replace('/wiki/', ''));
      } else if (url.pathname.startsWith('/api/rest_v1/page/summary/')) {
        rawTitle = decodeURIComponent(
          url.pathname.replace('/api/rest_v1/page/summary/', '')
        );
      } else {
        return;
      }

      if (!rawTitle) return;

      const title = rawTitle.replace(/_/g, ' ');
      const pageUrl = `${url.origin}${url.pathname}${url.search}${url.hash}`;
      if (pageUrl === lastProcessedPageUrlRef.current) return;

      const isStartArticle =
        title.toLowerCase() === match.startTitle.toLowerCase();
      if (isStartArticle && !hasLeftStartArticleRef.current) {
        lastProcessedPageUrlRef.current = pageUrl;
        return;
      }

      lastProcessedPageUrlRef.current = pageUrl;

      const isTargetUrl =
        title.toLowerCase() === match.targetTitle.toLowerCase();

      const ws = wsRef.current;
      if (ws?.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: 'move',
          payload: { article: title, url: pageUrl },
        })
      );

      if (!isStartArticle) {
        hasLeftStartArticleRef.current = true;
      }

      if (isTargetUrl) return;
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; href?: string } | null;
      if (!data || data.type !== 'wiki:navigated' || !data.href) return;

      try {
        const url = new URL(data.href);
        if (url.pathname.startsWith('/wiki/')) {
          const href = `${url.origin}${url.pathname}${url.search}${url.hash}`;
          setMatch((prev) =>
            prev.status === 'playing' ? { ...prev, iframeSrc: href } : prev
          );
        }
      } catch {
        // Ignore malformed message payloads.
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const onBackToLobbies = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setMatch({ status: 'idle' });
    setWaiting(null);
    hasLeftStartArticleRef.current = false;
    lastProcessedPageUrlRef.current = '';
    setScreen('lobbies');
    refreshLobbies();
  };

  const onViewResults = () => {
    setScreen('results');
  };

  const claimSeat = useCallback((seatIndex: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'claim_seat',
        payload: { seatIndex },
      })
    );
  }, []);

  const setReady = useCallback((ready: boolean) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'set_ready',
        payload: { ready },
      })
    );
  }, []);

  const showMoveSidebar = screen === 'game';

  const layoutClass = [
    'app-layout',
    showMoveSidebar ? 'app-layout--with-sidebar' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const finishedMatch = match.status === 'finished' ? match : null;
  const resultsPaths = useMemo(
    () =>
      finishedMatch
        ? moveChainToResultsPaths(
            finishedMatch.moveChain,
            finishedMatch.lobby,
            finishedMatch.startedAtMs
          )
        : moveChainToResultsPaths(null, null, null),
    [finishedMatch]
  );

  return (
    <div className={layoutClass}>
      <div className='app-main'>
        {/* ── Cover / alias screen ── */}
        <div
          className={`screen screen-alias ${
            screen === 'alias' ? 'active' : ''
          }`}
        >
          <div className='card'>
            <h1>wikirace</h1>
            <p className='subtitle'>
              7,141,000+ articles
              <br />
              infinite ways to connect them
            </p>
            <form className='alias-form' onSubmit={onAliasSubmit}>
              <input
                type='text'
                placeholder='enter your name'
                maxLength={20}
                autoComplete='off'
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                required
              />
              <button type='submit'>start</button>
            </form>
            <div className='cover-footer'>
              <img src='/peas.png' alt='peas' className='cover-footer-img' />
              <p>by team pea</p>
            </div>
          </div>
        </div>

        {/* ── Lobbies screen ── */}
        <div className={`screen ${screen === 'lobbies' ? 'active' : ''}`}>
          <div className='topbar'>
            <span className='player-name-display'>{playerName}</span>
            <button
              type='button'
              className='btn-primary'
              onClick={onCreateLobby}
              disabled={creatingLobby}
            >
              {creatingLobby ? 'Creating…' : 'Create Lobby'}
            </button>
          </div>
          <div className='lobby-container'>
            <h2>Open Lobbies</h2>
            <div className='lobby-list'>
              {lobbies.length === 0 ? (
                <p className='empty-state'>No lobbies available. Create one!</p>
              ) : (
                lobbies.map((lobby) => (
                  <div key={lobby.id} className='lobby-card'>
                    <div className='lobby-meta'>
                      <div className='lobby-articles'>
                        <span className='lobby-start-hidden'>Start hidden</span>{' '}
                        &rarr; <strong>{lobby.targetArticle.title}</strong>
                      </div>
                      <div className='lobby-players'>
                        {lobby.players.length}/{lobby.maxPlayers} players
                      </div>
                    </div>
                    <button
                      type='button'
                      className='btn-join'
                      onClick={() => joinLobby(lobby.id)}
                    >
                      Join
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Waiting room screen ── */}
        <div
          className={`screen screen-waiting ${
            screen === 'waiting' ? 'active' : ''
          }`}
        >
          {waiting?.countdownSeconds != null && (
            <div className='countdown-overlay' role='status' aria-live='polite'>
              <div className='countdown-overlay-inner'>
                <p className='countdown-overlay-label'>Starting in</p>
                <div className='countdown-overlay-number'>
                  {waiting.countdownSeconds}
                </div>
                <p className='countdown-overlay-sub'>
                  The start article will be revealed next
                </p>
              </div>
            </div>
          )}
          <div className='card waiting-room-card'>
            {waiting?.lobby ? (
              <WaitingRoom
                lobby={waiting.lobby}
                myPlayerId={myPlayerId}
                statusLine={waiting.info}
                onClaimSeat={claimSeat}
                onSetReady={setReady}
              />
            ) : (
              <>
                <h2>Connecting…</h2>
                <p className='waiting-info'>{waiting?.info}</p>
                <div className='loader' />
              </>
            )}
          </div>
        </div>

        {/* ── Game screen ── */}
        {screen === 'game' && match.status === 'playing' && (
          <div className='screen active screen-game'>
            <GameScreen
              myPlayerId={myPlayerId}
              players={match.seats
                .map((playerId, seatIndex) => {
                  if (!playerId) return null;
                  const player = match.players.find((p) => p.id === playerId);
                  if (!player) return null;
                  const moves = match.playerMoves.get(playerId) ?? [];
                  const finished = moves.some((m) => m.end);
                  return {
                    id: player.id,
                    name: player.name,
                    color: SEAT_COLORS[seatIndex] ?? '#ccc',
                    moves,
                    finished,
                  };
                })
                .filter((p): p is NonNullable<typeof p> => p !== null)}
              startArticle={match.startTitle}
              targetArticle={match.targetTitle}
              iframeSrc={match.iframeSrc}
              onWikiFrameLoad={onWikiFrameLoad}
              wikiRef={wikiRef}
            />
          </div>
        )}

        {/* ── Game over screen ── */}
        <div
          className={`screen screen-gameover ${
            screen === 'gameover' ? 'active' : ''
          }`}
        >
          <div className='card'>
            {match.status === 'finished' && (
              <EndScreen
                lobby={match.lobby}
                currentPlayerId={myPlayerId}
                onBackToLobbies={onBackToLobbies}
                onViewResults={onViewResults}
              />
            )}
          </div>
        </div>

        {/* ── Results / replay screen ── */}
        {screen === 'results' && (
          <div className='screen active screen-results'>
            <ResultsPage paths={[resultsPaths.p1, resultsPaths.p2]} />
          </div>
        )}
      </div>
    </div>
  );
}
