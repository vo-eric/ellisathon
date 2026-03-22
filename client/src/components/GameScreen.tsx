import { useEffect, useRef, useState, Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PathMove } from '../hooks/useReplay';

interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  moves: PathMove[];
  finished: boolean;
}

interface Props {
  myPlayerId: string | null;
  players: PlayerInfo[];
  startArticle: string;
  targetArticle: string;
  iframeSrc: string | null;
  onWikiFrameLoad: () => void;
  wikiRef: React.RefObject<HTMLIFrameElement | null>;
}

function useGameTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    const tick = () => {
      setElapsed(Date.now() - (startRef.current ?? Date.now()));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function GameScreen({
  myPlayerId,
  players,
  startArticle,
  targetArticle,
  iframeSrc,
  onWikiFrameLoad,
  wikiRef,
}: Props) {
  const timer = useGameTimer(true);
  const myColor = players.find((p) => p.id === myPlayerId)?.color ?? '#111';

  // My path to show in the right panel
  const myPlayer = players.find((p) => p.id === myPlayerId);
  const myMoves = myPlayer?.moves ?? [];

  return (
    <div className='game-screen'>
      {/* ── Top bar ── */}
      <div className='game-topbar'>
        <div className='game-timer'>{timer}</div>
        <div className='game-player-capsules'>
          {players.map((p) => (
            <div
              key={p.id}
              className='game-player-capsule'
              style={{ background: p.color }}
            >
              <span className='game-player-capsule-name'>{p.name}</span>
              <span className='game-player-capsule-count'>
                {p.finished ? '✓' : Math.max(0, p.moves.length - 1)}
              </span>
            </div>
          ))}
        </div>
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
          />
        )}

        {/* ── Right path panel ── */}
        <div className='game-path-panel'>
          <p className='game-path-label'>path</p>
          <p className='game-path-hint'>
            articles visited in order<br />
            the current one is<br />
            highlighted in your color
          </p>

          <div className='game-path-list'>
            {/* Start bubble — always black */}
            <div className='game-path-bubble game-path-bubble--endpoint'>
              {startArticle}
            </div>

            {/* Visited articles (step 2 onward, excluding the start which is step 1) */}
            {myMoves.slice(1).map((move, i) => {
              const isLast = i === myMoves.length - 2;
              const isCurrent = isLast && !myPlayer?.finished;
              return (
                <Fragment key={move.step}>
                  <div className='game-path-arrow' aria-hidden>
                    <ChevronDown size={18} strokeWidth={2} />
                  </div>
                  <div
                    className={[
                      'game-path-bubble',
                      isCurrent ? 'game-path-bubble--current' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={isCurrent ? { borderColor: myColor } : {}}
                  >
                    {move.article}
                  </div>
                </Fragment>
              );
            })}

            {/* Arrow + end bubble — always black */}
            <div className='game-path-arrow' aria-hidden>
              <ChevronDown size={18} strokeWidth={2} />
            </div>
            <div className='game-path-bubble game-path-bubble--endpoint'>
              {targetArticle}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
