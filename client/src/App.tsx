import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WaitingRoom } from './components/WaitingRoom';
import ResultsPage, { SEAT_COLORS } from './components/ResultsPage';
import { GameScreen } from './components/GameScreen';
import { moveChainToResultsPaths } from './utils/resultsPaths';
import { appendMoveNode } from './moveChain';
import type { PathMove } from './hooks/useReplay';
import type {
  LobbySnapshot,
  MoveListNodeSnapshot,
  ServerMessage,
} from './types';
import { apiUrl, lobbyWebSocketUrl } from './apiBase';

type Screen = 'alias' | 'lobbies' | 'waiting' | 'game' | 'gameover' | 'results';

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function transitionCountFromChain(chain: MoveListNodeSnapshot | null): number {
  let n = 0;
  let cur = chain;
  while (cur?.next) {
    n++;
    cur = cur.next;
  }
  return n;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('alias');
  const [aliasInput, setAliasInput] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [lobbies, setLobbies] = useState<LobbySnapshot[]>([]);
  const [waitingInfo, setWaitingInfo] = useState('');
  /** Full lobby while on waiting screen (players, seats, route). */
  const [waitingLobby, setWaitingLobby] = useState<LobbySnapshot | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  /** Server-driven pre-game countdown (5 → 1), then game_start. */
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [creatingLobby, setCreatingLobby] = useState(false);

  const [gameTarget, setGameTarget] = useState('');
  const [gameStartArticle, setGameStartArticle] = useState('');
  const [, setGameCurrent] = useState('');
  const [, setMoveCount] = useState(0);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [gameSeatOrder, setGameSeatOrder] = useState<(string | null)[]>([]);
  const [gamePlayers, setGamePlayers] = useState<
    { id: string; name: string }[]
  >([]);
  const [playerMoves, setPlayerMoves] = useState<Map<string, PathMove[]>>(
    () => new Map()
  );

  const [gameoverTitle, setGameoverTitle] = useState('');
  const [gameoverHtml, setGameoverHtml] = useState('');

  const [moveChain, setMoveChain] = useState<MoveListNodeSnapshot | null>(null);
  /** Client time when `game_start` arrived — used to space synthetic replay timestamps */
  const [gameStartedAtMs, setGameStartedAtMs] = useState<number | null>(null);
  /** Last finished game lobby (for player names / seats on results) */
  const [finishedLobby, setFinishedLobby] = useState<LobbySnapshot | null>(
    null
  );

  const wsRef = useRef<WebSocket | null>(null);
  const wikiRef = useRef<HTMLIFrameElement>(null);
  const currentArticleRef = useRef('');
  const playerIdRef = useRef<string | null>(null);

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

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    console.log('=========');
    console.log('inside handleServerMessage');
    console.log('=========');
    switch (msg.type) {
      case 'lobby_state':
        playerIdRef.current = msg.payload.playerId;
        setMyPlayerId(msg.payload.playerId);
        setWaitingLobby(msg.payload.lobby);
        setMoveChain(msg.payload.lobby.moveChain ?? null);
        break;
      case 'lobby_sync':
        setWaitingLobby(msg.payload);
        setCountdownSeconds(null);
        break;
      case 'countdown_tick':
        setCountdownSeconds(msg.payload.secondsLeft);
        break;
      case 'player_joined':
        setWaitingInfo(`${msg.payload.name} joined the lobby.`);
        break;
      case 'player_left':
        setWaitingInfo('Opponent disconnected.');
        break;
      case 'game_start': {
        const lobby = msg.payload;
        const start = lobby.startArticle ?? '';
        setWaitingLobby(null);
        setCountdownSeconds(null);
        setFinishedLobby(null);
        setGameStartedAtMs(Date.now());
        currentArticleRef.current = start;
        setGameTarget(lobby.targetArticle);
        setGameStartArticle(start);
        setGameCurrent(start);
        setMoveCount(0);
        setMoveChain(lobby.moveChain ?? null);
        setIframeSrc(apiUrl('/wiki/' + encodeURIComponent(start)));
        setGameSeatOrder(lobby.seats);
        setGamePlayers(lobby.players);
        // Seed every player's path with the start article as step 1
        const seed = new Map<string, PathMove[]>();
        for (const p of lobby.players) {
          seed.set(p.id, [
            {
              article: start,
              url: `/wiki/${encodeURIComponent(start.replace(/ /g, '_'))}`,
              step: 1,
              end: false,
              timestamp: Date.now(),
            },
          ]);
        }
        setPlayerMoves(seed);
        setScreen('game');
        break;
      }
      case 'move_made':
        console.log('WE DID A THING');
        setMoveChain((prev) =>
          appendMoveNode(prev, {
            article: msg.payload.article,
            url: msg.payload.url,
            step: msg.payload.step,
            end: msg.payload.end,
            playerId: msg.payload.playerId,
          })
        );
        setPlayerMoves((prev) => {
          console.log('=========');
          console.log('inside setPlayerMoves updater');
          console.log('=========');
          const next = new Map(prev);
          const pid = msg.payload.playerId;
          const existing = next.get(pid) ?? [];
          next.set(pid, [
            ...existing,
            {
              article: msg.payload.article,
              url: msg.payload.url,
              step: msg.payload.step,
              end: msg.payload.end,
              timestamp: Date.now(),
            },
          ]);
          console.log('next', next);
          return next;
        });
        break;
      case 'game_over': {
        const { winnerId, lobby } = msg.payload;
        const winner = lobby.players.find((p) => p.id === winnerId);
        const isMe = winnerId === playerIdRef.current;
        setGameoverTitle(isMe ? 'You Win!' : 'Game Over');
        const tc = transitionCountFromChain(lobby.moveChain);
        setGameoverHtml(
          `<strong>${escapeHtml(
            winner?.name ?? 'Unknown'
          )}</strong> reached <strong>${escapeHtml(
            lobby.targetArticle
          )}</strong> in <strong>${tc}</strong> moves.`
        );
        setMoveChain(lobby.moveChain ?? null);
        setFinishedLobby(lobby);
        setScreen('gameover');
        break;
      }
      case 'error':
        console.error('Server error:', msg.payload.message);
        break;
    }
  }, []);

  const joinLobby = useCallback(
    (lobbyId: string) => {
      console.log('=========');
      console.log('inside joinLobby');
      console.log('=========');
      const prev = wsRef.current;
      if (prev) {
        prev.close();
        wsRef.current = null;
      }

      const url = lobbyWebSocketUrl(lobbyId, playerName);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        console.log('=========');
        console.log('inside ws open listener');
        console.log('=========');
        setWaitingLobby(null);
        setCountdownSeconds(null);
        setWaitingInfo('Connected. Pick a seat when the lobby loads.');
        setScreen('waiting');
      });

      ws.addEventListener('message', (event) => {
        console.log('=========');
        console.log('inside ws message listener');
        console.log('=========');
        const msg = JSON.parse(event.data) as ServerMessage;
        handleServerMessage(msg);
      });

      ws.addEventListener('close', (event) => {
        console.log('=========');
        console.log('inside ws close listener');
        console.log('=========');
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (event.code >= 4000) {
          window.alert(event.reason || 'Could not join lobby.');
          setScreen('lobbies');
          refreshLobbies();
        }
      });
    },
    [playerName, handleServerMessage, refreshLobbies]
  );

  const onAliasSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = aliasInput.trim();
    if (!name) return;
    setPlayerName(name);
    setScreen('lobbies');
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
    console.log('=========');
    console.log('inside onWikiFrameLoad');
    console.log('=========');
    const frame = wikiRef.current;
    console.log('frame', frame);
    if (!frame?.contentWindow) return;
    try {
      const pathname = frame.contentWindow.location.pathname;
      let rawTitle: string | null = null;
      console.log('path name', pathname);
      if (pathname.startsWith('/wiki/')) {
        rawTitle = decodeURIComponent(pathname.replace('/wiki/', ''));
        console.log('in if');
      } else if (pathname.startsWith('/api/rest_v1/page/summary/')) {
        console.log('in else if');
        // Some Wikipedia skins emit summary endpoint links; treat them as article clicks.
        rawTitle = decodeURIComponent(
          pathname.replace('/api/rest_v1/page/summary/', '')
        );
      } else {
        console.log('in else');
        return;
      }
      console.log('raw title', rawTitle);
      if (!rawTitle) return;
      const title = rawTitle.replace(/_/g, ' ');

      if (title.toLowerCase() === currentArticleRef.current.toLowerCase()) {
        return;
      }

      currentArticleRef.current = title;
      setGameCurrent(title);
      setMoveCount((c) => c + 1);

      const ws = wsRef.current;
      console.log('**************');
      console.log('websocket status', ws?.readyState);
      console.log('**************');
      if (ws?.readyState === WebSocket.OPEN) {
        const loc = frame.contentWindow.location;
        const pageUrl = `${loc.origin}${loc.pathname}${loc.search}${loc.hash}`;
        ws.send(
          JSON.stringify({
            type: 'move',
            payload: { article: title, url: pageUrl },
          })
        );
      }
    } catch (err) {
      // Cross-origin iframe navigations are expected and cannot be introspected.
      if (
        err instanceof DOMException &&
        (err.name === 'SecurityError' || err.name === 'PermissionDeniedError')
      ) {
        return;
      }
      console.warn('Could not read iframe URL:', err);
    }
  };

  const onBackToLobbies = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setIframeSrc(null);
    setGameSeatOrder([]);
    setGamePlayers([]);
    setPlayerMoves(new Map());
    setMoveChain(null);
    setGameStartedAtMs(null);
    setFinishedLobby(null);
    setWaitingLobby(null);
    setMyPlayerId(null);
    setCountdownSeconds(null);
    setScreen('lobbies');
    refreshLobbies();
  };

  const onViewResults = () => {
    setScreen('results');
  };

  const claimSeat = useCallback((seatIndex: number) => {
    console.log('=========');
    console.log('inside claimSeat');
    console.log('=========');
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
    console.log('=========');
    console.log('inside setReady');
    console.log('=========');
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'set_ready',
        payload: { ready },
      })
    );
  }, []);

  /* Path sidebar only while the race is active. */
  const showMoveSidebar = screen === 'game';

  const layoutClass = [
    'app-layout',
    showMoveSidebar ? 'app-layout--with-sidebar' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const resultsPaths = useMemo(
    () => moveChainToResultsPaths(moveChain, finishedLobby, gameStartedAtMs),
    [moveChain, finishedLobby, gameStartedAtMs]
  );

  console.log('results path', resultsPaths);

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
                        &rarr; <strong>{lobby.targetArticle}</strong>
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
          {countdownSeconds !== null && (
            <div className='countdown-overlay' role='status' aria-live='polite'>
              <div className='countdown-overlay-inner'>
                <p className='countdown-overlay-label'>Starting in</p>
                <div className='countdown-overlay-number'>
                  {countdownSeconds}
                </div>
                <p className='countdown-overlay-sub'>
                  The start article will be revealed next
                </p>
              </div>
            </div>
          )}
          <div className='card waiting-room-card'>
            {waitingLobby ? (
              <WaitingRoom
                lobby={waitingLobby}
                myPlayerId={myPlayerId}
                statusLine={waitingInfo}
                onClaimSeat={claimSeat}
                onSetReady={setReady}
              />
            ) : (
              <>
                <h2>Connecting…</h2>
                <p className='waiting-info'>{waitingInfo}</p>
                <div className='loader' />
              </>
            )}
          </div>
        </div>

        {/* ── Game screen ── */}
        {screen === 'game' && (
          <div className='screen active screen-game'>
            <GameScreen
              myPlayerId={myPlayerId}
              players={gameSeatOrder
                .map((playerId, seatIndex) => {
                  if (!playerId) return null;
                  const player = gamePlayers.find((p) => p.id === playerId);
                  if (!player) return null;
                  const moves = playerMoves.get(playerId) ?? [];
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
              startArticle={gameStartArticle}
              targetArticle={gameTarget}
              iframeSrc={iframeSrc}
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
            <h2>{gameoverTitle}</h2>
            <div
              className='gameover-info'
              dangerouslySetInnerHTML={{ __html: gameoverHtml }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type='button' onClick={onBackToLobbies}>
                Back to Lobbies
              </button>
              <button
                type='button'
                className='btn-primary'
                onClick={onViewResults}
              >
                View Results
              </button>
            </div>
          </div>
        </div>

        {/* ── Results / replay screen ── */}
        {screen === 'results' && (
          <div className='screen active screen-results'>
            <ResultsPage paths={[resultsPaths.p1, resultsPaths.p2]} />
          </div>
        )}
      </div>

      {/* <MovesDevSidebar moveChain={moveChain} visible={showMoveSidebar} /> */}
    </div>
  );
}
