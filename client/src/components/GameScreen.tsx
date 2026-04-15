import { useEffect, useRef, useState, Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PathMove } from '../hooks/useReplay';
import { wikiArticleHref } from '../utils/wikiUrl';

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

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
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
