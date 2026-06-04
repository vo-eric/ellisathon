import { useEffect, useRef, useState } from 'react';
import { Check, Crown, Flag, Trophy, X } from 'lucide-react';
import type { GolfStanding } from '../utils/golfStandings';
import { useFlipList } from '../hooks/useFlipList';

interface Props {
  standings: GolfStanding[];
  currentPlayerId: string;
  targetTitle: string;
  /** True while the match is still in progress (live leaderboard). */
  live: boolean;
  /** Authoritative winner id (final screen only). */
  winnerId?: string | null;
  /** Absolute epoch-ms deadline for the live countdown; null/undefined hides it. */
  deadline?: number | null;
  onBackToLobbies?: () => void;
  onViewResults?: () => void;
  /** Host-only: return everyone to the waiting room for a new round. */
  onReturnToLobby?: () => void;
  isHost?: boolean;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function clicksLabel(clicks: number): string {
  return `${clicks} click${clicks === 1 ? '' : 's'}`;
}

/** Stable key so FLIP runs when order, clicks, or status change. */
function standingsSignature(standings: GolfStanding[]): string {
  return standings
    .map(
      (s) =>
        `${s.id}:${s.clicks}:${s.status}:${s.place ?? '—'}`
    )
    .join('|');
}

function useCountdown(deadline: number | null | undefined, live: boolean) {
  const [remaining, setRemaining] = useState(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!deadline || !live) return;
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadline, live]);
  if (!deadline) return null;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Brief pulse when click count or placement label changes. */
function useRankAndClickPulse(standings: GolfStanding[]) {
  const prevRef = useRef<Map<string, { clicks: number; place: number | null }>>(
    new Map()
  );
  const [pulseRank, setPulseRank] = useState<Set<string>>(() => new Set());
  const [pulseClicks, setPulseClicks] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const rankPulse = new Set<string>();
    const clickPulse = new Set<string>();

    for (const s of standings) {
      const prev = prevRef.current.get(s.id);
      if (prev) {
        if (prev.place !== s.place) rankPulse.add(s.id);
        if (prev.clicks !== s.clicks) clickPulse.add(s.id);
      }
      prevRef.current.set(s.id, { clicks: s.clicks, place: s.place });
    }

    if (rankPulse.size === 0 && clickPulse.size === 0) return;

    setPulseRank(rankPulse);
    setPulseClicks(clickPulse);
    const t = window.setTimeout(() => {
      setPulseRank(new Set());
      setPulseClicks(new Set());
    }, 520);
    return () => clearTimeout(t);
  }, [standings]);

  return { pulseRank, pulseClicks };
}

export default function GolfResultsBoard({
  standings,
  currentPlayerId,
  targetTitle,
  live,
  winnerId,
  deadline,
  onBackToLobbies,
  onViewResults,
  onReturnToLobby,
  isHost = false,
}: Props) {
  const countdown = useCountdown(deadline, live);
  const listRef = useFlipList(standingsSignature(standings));
  const { pulseRank, pulseClicks } = useRankAndClickPulse(standings);

  const local = standings.find((s) => s.id === currentPlayerId);
  const winner = standings.find((s) => s.id === winnerId);

  let title: string;
  let subtitle: string;

  if (live) {
    if (local?.status === 'finished') {
      title = 'You reached the target!';
      subtitle = local.place
        ? `Currently ${ordinal(local.place)} — waiting for the other players to finish.`
        : 'Waiting for the other players to finish.';
    } else if (local?.status === 'forfeited') {
      title = 'You gave up.';
      subtitle = 'Waiting for the match to end.';
    } else {
      title = 'Live standings';
      subtitle = `Race to ${targetTitle} in the fewest clicks.`;
    }
  } else if (winnerId && winner) {
    title = winnerId === currentPlayerId ? 'You win!' : `${winner.name} wins!`;
    subtitle = `${
      winnerId === currentPlayerId ? 'You' : winner.name
    } reached ${targetTitle} in ${clicksLabel(winner.clicks)} — fewest of anyone.`;
  } else {
    title = 'Game over.';
    subtitle = `Nobody reached ${targetTitle}.`;
  }

  return (
    <div className='golf-board'>
      <div className='golf-board-header'>
        {!live && winnerId && <Trophy size={26} className='golf-board-trophy' />}
        <h2 className='golf-board-title'>{title}</h2>
        <p className='golf-board-subtitle'>{subtitle}</p>
        {live && countdown && (
          <p className='golf-board-countdown'>
            Time left <strong>{countdown}</strong>
          </p>
        )}
      </div>

      <div className='golf-board-list-wrap'>
        <ul ref={listRef} className='golf-board-list'>
          {standings.map((s) => {
            const isWinner = !live && winnerId === s.id;
            const isLeading = live && s.place === 1;
            const isYou = s.id === currentPlayerId;

            const rankLabel = s.place
              ? ordinal(s.place)
              : s.status === 'forfeited'
              ? null
              : '—';

            return (
              <li
                key={s.id}
                data-flip-id={s.id}
                className={[
                  'golf-board-row',
                  isWinner ? 'golf-board-row--winner' : '',
                  isLeading ? 'golf-board-row--leading' : '',
                  isYou ? 'golf-board-row--you' : '',
                  s.status === 'forfeited' ? 'golf-board-row--forfeited' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span
                  className={[
                    'golf-board-rank',
                    pulseRank.has(s.id) ? 'golf-board-rank--pulse' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {(isWinner || isLeading) && (
                    <Crown size={16} className='golf-board-crown' />
                  )}
                  {rankLabel ?? <Flag size={14} />}
                </span>
                <span
                  className={[
                    'golf-board-dot',
                    s.status === 'finished' ? 'golf-board-dot--finished' : '',
                    s.status === 'forfeited' ? 'golf-board-dot--forfeited' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ background: s.color }}
                  aria-label={
                    s.status === 'finished'
                      ? 'Reached target'
                      : s.status === 'forfeited'
                      ? 'Gave up'
                      : 'In progress'
                  }
                >
                  {s.status === 'finished' && (
                    <Check
                      size={13}
                      strokeWidth={3}
                      className='golf-board-dot-icon'
                      aria-hidden
                    />
                  )}
                  {s.status === 'forfeited' && (
                    <X
                      size={13}
                      strokeWidth={3}
                      className='golf-board-dot-icon'
                      aria-hidden
                    />
                  )}
                </span>
                <span className='golf-board-name'>
                  {s.name}
                  {isYou && <span className='golf-board-you'>you</span>}
                </span>
                <span
                  className={[
                    'golf-board-result',
                    pulseClicks.has(s.id) ? 'golf-board-result--pulse' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {clicksLabel(s.clicks)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {!live &&
        (onBackToLobbies || onViewResults || (isHost && onReturnToLobby)) && (
        <div className='golf-board-actions'>
          {onBackToLobbies && (
            <button type='button' onClick={onBackToLobbies}>
              Back to Lobbies
            </button>
          )}
          {onViewResults && (
            <button type='button' onClick={onViewResults}>
              View Results
            </button>
          )}
          {isHost && onReturnToLobby && (
            <button
              type='button'
              className='btn-primary'
              onClick={onReturnToLobby}
            >
              Play Again
            </button>
          )}
        </div>
      )}
      {!live && !isHost && (
        <p className='gameover-info'>
          Waiting for the host to start a new round…
        </p>
      )}
    </div>
  );
}
