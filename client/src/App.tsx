import { useCallback, useEffect, useRef, useState } from 'react';
import { MovesDevSidebar } from './components/MovesDevSidebar';
import { WaitingRoom } from './components/WaitingRoom';
import { appendMoveNode } from './moveChain';
import type {
  LobbySnapshot,
  MoveListNodeSnapshot,
  ServerMessage,
} from './types';

type Screen = 'alias' | 'lobbies' | 'waiting' | 'game' | 'gameover';

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
  const [gameCurrent, setGameCurrent] = useState('');
  const [moveCount, setMoveCount] = useState(0);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  const [gameoverTitle, setGameoverTitle] = useState('');
  const [gameoverHtml, setGameoverHtml] = useState('');

  const [moveChain, setMoveChain] = useState<MoveListNodeSnapshot | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wikiRef = useRef<HTMLIFrameElement>(null);
  /** Last /wiki/... pathname seen in the iframe (avoids duplicate move sends). */
  const lastWikiPathnameRef = useRef('');
  const playerIdRef = useRef<string | null>(null);

  const refreshLobbies = useCallback(async () => {
    try {
      const res = await fetch('/api/lobbies/joinable');
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
        const start = lobby.startArticle;
        if (!start) break;
        setWaitingLobby(null);
        setCountdownSeconds(null);
        try {
          lastWikiPathnameRef.current = new URL(start.url).pathname;
        } catch {
          lastWikiPathnameRef.current = '';
        }
        setGameTarget(lobby.targetArticle.title);
        setGameCurrent(start.title);
        setMoveCount(0);
        setMoveChain(lobby.moveChain ?? null);
        try {
          setIframeSrc(new URL(start.url).pathname);
        } catch {
          setIframeSrc('/wiki/' + encodeURIComponent(start.title));
        }
        setScreen('game');
        break;
      }
      case 'move_made':
        setMoveChain((prev) =>
          appendMoveNode(prev, {
            article: msg.payload.article,
            url: msg.payload.url,
            step: msg.payload.step,
            end: msg.payload.end,
          })
        );
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
            lobby.targetArticle.title
          )}</strong> in <strong>${tc}</strong> moves.`
        );
        setMoveChain(lobby.moveChain ?? null);
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
      const prev = wsRef.current;
      if (prev) {
        prev.close();
        wsRef.current = null;
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const url = `${proto}//${host}/ws?lobbyId=${lobbyId}&playerName=${encodeURIComponent(
        playerName
      )}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setWaitingLobby(null);
        setCountdownSeconds(null);
        setWaitingInfo('Connected. Pick a seat when the lobby loads.');
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
      const res = await fetch('/api/lobbies', { method: 'POST' });
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
    const frame = wikiRef.current;
    if (!frame?.contentWindow) return;
    try {
      const pathname = frame.contentWindow.location.pathname;
      if (!pathname.startsWith('/wiki/')) return;

      const rawTitle = decodeURIComponent(pathname.replace('/wiki/', ''));
      const title = rawTitle.replace(/_/g, ' ');

      if (pathname === lastWikiPathnameRef.current) {
        return;
      }

      lastWikiPathnameRef.current = pathname;
      setGameCurrent(title);
      setMoveCount((c) => c + 1);

      const ws = wsRef.current;
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
      console.warn('Could not read iframe URL:', err);
    }
  };

  const onBackToLobbies = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setIframeSrc(null);
    setMoveChain(null);
    setWaitingLobby(null);
    setMyPlayerId(null);
    setCountdownSeconds(null);
    setScreen('lobbies');
    refreshLobbies();
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

  /* Vite dev: true. Production build on localhost:3000: false — still show sidebar locally. */
  const showMoveSidebar =
    import.meta.env.DEV ||
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  const layoutClass = [
    'app-layout',
    showMoveSidebar ? 'app-layout--with-sidebar' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={layoutClass}>
      <div className='app-main'>
        <div
          className={`screen screen-alias ${
            screen === 'alias' ? 'active' : ''
          }`}
        >
          <div className='card'>
            <h1>Wiki Speedrun</h1>
            <p className='subtitle'>
              Race through Wikipedia. First to the target article wins.
            </p>
            <form className='alias-form' onSubmit={onAliasSubmit}>
              <input
                type='text'
                placeholder='Enter your alias'
                maxLength={20}
                autoComplete='off'
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                required
              />
              <button type='submit'>Enter</button>
            </form>
          </div>
        </div>

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

        <div
          className={`screen screen-game ${screen === 'game' ? 'active' : ''}`}
        >
          <div className='game-bar'>
            <div className='game-bar-left'>
              <span className='game-label'>Current</span>
              <span className='game-article-name'>{gameCurrent || '—'}</span>
            </div>
            <div className='game-bar-center'>
              <span className='game-moves'>
                {moveCount} move{moveCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className='game-bar-right'>
              <span className='game-label'>Target</span>
              <span className='game-article-name target'>{gameTarget}</span>
            </div>
          </div>
          {iframeSrc !== null && (
            <iframe
              ref={wikiRef}
              className='wiki-frame'
              title='Wikipedia'
              src={iframeSrc}
              onLoad={onWikiFrameLoad}
            />
          )}
        </div>

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
            <button type='button' onClick={onBackToLobbies}>
              Back to Lobbies
            </button>
          </div>
        </div>
      </div>

      <MovesDevSidebar moveChain={moveChain} visible={showMoveSidebar} />
    </div>
  );
}
