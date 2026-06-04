import { useEffect, useRef, useState, Fragment } from 'react';
import { ChevronDown, Flag } from 'lucide-react';
import type { PathMove } from '../hooks/useReplay';
import type { GameMode } from '../types';
import { wikiArticleHref } from '../utils/wikiUrl';

interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  moves: PathMove[];
  finished: boolean;
  forfeited: boolean;
}

interface Props {
  myPlayerId: string | null;
  players: PlayerInfo[];
  startArticle: string;
  targetArticle: string;
  iframeSrc: string | null;
  onWikiFrameLoad: () => void;
  wikiRef: React.RefObject<HTMLIFrameElement | null>;
  /** When false, timer pauses (e.g., during pre-game countdown). */
  timerRunning?: boolean;
  mode?: GameMode;
  /** Absolute epoch-ms deadline for golf matches; null otherwise. */
  deadline?: number | null;
  /** Whether the local player may forfeit (golf, still racing). */
  canForfeit?: boolean;
  onForfeit?: () => void;
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function useGameTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    const id = setInterval(() => {
      setSeconds(
        Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000)
      );
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return formatClock(seconds);
}

/** Counts down to an absolute deadline (golf mode); null = inactive. */
function useDeadlineTimer(deadline: number | null | undefined, running: boolean) {
  const [remaining, setRemaining] = useState(() =>
    deadline ? Math.ceil((deadline - Date.now()) / 1000) : 0
  );

  useEffect(() => {
    if (!deadline || !running) return;
    const update = () =>
      setRemaining(Math.ceil((deadline - Date.now()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadline, running]);

  return remaining;
}

export function GameScreen({
  myPlayerId,
  players,
  startArticle,
  targetArticle,
  iframeSrc,
  onWikiFrameLoad,
  wikiRef,
  timerRunning = true,
  mode = 'race',
  deadline = null,
  canForfeit = false,
  onForfeit,
}: Props) {
  const elapsed = useGameTimer(timerRunning);
  const isGolf = mode === 'golf';
  const remainingSeconds = useDeadlineTimer(
    isGolf ? deadline : null,
    timerRunning
  );
  const timer = isGolf && deadline ? formatClock(remainingSeconds) : elapsed;
  const lowTime = isGolf && deadline != null && remainingSeconds <= 30;
  const myColor = players.find((p) => p.id === myPlayerId)?.color ?? '#111';

  const handleForfeit = () => {
    if (!onForfeit) return;
    const ok = window.confirm(
      'Give up? You will forfeit this round and can no longer win.'
    );
    if (ok) onForfeit();
  };

  useEffect(() => {
    const frame = wikiRef.current;
    if (!frame) return;

    const handleNativeLoad = () => {
      onWikiFrameLoad();
    };
    frame.addEventListener('load', handleNativeLoad);

    return () => {
      frame.removeEventListener('load', handleNativeLoad);
    };
  }, [iframeSrc, onWikiFrameLoad, wikiRef]);

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const myMoves = myPlayer?.moves ?? [];

  return (
    <div className='game-screen'>
      {/* ── Top bar ── */}
      <div className='game-topbar'>
        <div
          className={[
            'game-timer',
            isGolf && deadline ? 'game-timer--countdown' : '',
            lowTime ? 'game-timer--low' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {timer}
        </div>
        {isGolf && (
          <span className='game-mode-badge'>Golf · fewest clicks</span>
        )}
        <div className='game-player-capsules'>
          {players.map((p) => (
            <div
              key={p.id}
              className={[
                'game-player-capsule',
                p.forfeited ? 'game-player-capsule--forfeited' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ background: p.color }}
            >
              <span className='game-player-capsule-name'>{p.name}</span>
              <span className='game-player-capsule-count'>
                {p.forfeited
                  ? '✕'
                  : p.finished
                  ? '✓'
                  : Math.max(0, p.moves.length - 1)}
              </span>
            </div>
          ))}
        </div>
        {canForfeit && (
          <button
            type='button'
            className='game-giveup-btn'
            onClick={handleForfeit}
          >
            <Flag size={14} />
            Give up
          </button>
        )}
      </div>

      {/* ── Main area: iframe + right panel ── */}
      <div className='game-body'>
        {iframeSrc !== null && (
          <iframe
            ref={wikiRef}
            className='wiki-frame'
            title='Wikipedia'
            src={iframeSrc}
            onLoad={onWikiFrameLoad}
            onError={() => {
              console.warn('Wiki iframe failed to load:', iframeSrc);
            }}
          />
        )}

        {/* ── Right path panel ── */}
        <div className='game-path-panel'>
          <p className='game-path-label'>path</p>
          <p className='game-path-hint'>
            articles visited in order
            <br />
            the current one is
            <br />
            highlighted in your color
          </p>

          <div className='game-path-list'>
            {/* Start bubble — always black */}
            <a
              className='game-path-bubble game-path-bubble--endpoint'
              href={wikiArticleHref(null, startArticle)}
              target='_blank'
              rel='noopener noreferrer'
            >
              {startArticle}
            </a>

            {/* Visited articles (step 2 onward, excluding the start which is step 1) */}
            {myMoves.slice(1).map((move, i) => {
              const isLast = i === myMoves.length - 2;
              const isCurrent = isLast && !myPlayer?.finished;
              return (
                <Fragment key={move.step}>
                  <div className='game-path-arrow' aria-hidden>
                    <ChevronDown size={18} strokeWidth={2} />
                  </div>
                  <a
                    href={wikiArticleHref(move.url, move.article)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className={[
                      'game-path-bubble',
                      isCurrent ? 'game-path-bubble--current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={isCurrent ? { borderColor: myColor } : {}}
                  >
                    {move.article}
                  </a>
                </Fragment>
              );
            })}

            {/* Arrow + end bubble — always black */}
            <div className='game-path-arrow' aria-hidden>
              <ChevronDown size={18} strokeWidth={2} />
            </div>
            <a
              className='game-path-bubble game-path-bubble--endpoint'
              href={wikiArticleHref(null, targetArticle)}
              target='_blank'
              rel='noopener noreferrer'
            >
              {targetArticle}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
