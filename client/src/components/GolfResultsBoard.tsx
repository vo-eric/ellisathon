import { useEffect, useState } from 'react';
import { Crown, Flag, Trophy } from 'lucide-react';
import type { GolfStanding } from '../utils/golfStandings';

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
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function clicksLabel(clicks: number): string {
  return `${clicks} click${clicks === 1 ? '' : 's'}`;
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

export default function GolfResultsBoard({
  standings,
  currentPlayerId,
  targetTitle,
  live,
  winnerId,
  deadline,
  onBackToLobbies,
  onViewResults,
}: Props) {
  const countdown = useCountdown(deadline, live);

  const local = standings.find((s) => s.id === currentPlayerId);
  const winner = standings.find((s) => s.id === winnerId);
  const leader = standings.find((s) => s.place === 1);

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

      <ul className='golf-board-list'>
        {standings.map((s) => {
          const isWinner = !live && winnerId === s.id;
          const isLeading = live && s.place === 1;
          const isYou = s.id === currentPlayerId;

          const resultText =
            s.status === 'finished'
              ? clicksLabel(s.clicks)
              : s.status === 'forfeited'
              ? 'gave up'
              : `${clicksLabel(s.clicks)} · in progress`;

          return (
            <li
              key={s.id}
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
              <span className='golf-board-rank'>
                {(isWinner || isLeading) && (
                  <Crown size={16} className='golf-board-crown' />
                )}
                {s.place ? ordinal(s.place) : s.status === 'forfeited' ? (
                  <Flag size={14} />
                ) : (
                  '—'
                )}
              </span>
              <span
                className='golf-board-dot'
                style={{ background: s.color }}
                aria-hidden
              />
              <span className='golf-board-name'>
                {s.name}
                {isYou && <span className='golf-board-you'>you</span>}
              </span>
              <span className='golf-board-result'>{resultText}</span>
            </li>
          );
        })}
      </ul>

      {!live && (onBackToLobbies || onViewResults) && (
        <div className='golf-board-actions'>
          {onBackToLobbies && (
            <button type='button' onClick={onBackToLobbies}>
              Back to Lobbies
            </button>
          )}
          {onViewResults && (
            <button type='button' className='btn-primary' onClick={onViewResults}>
              View Results
            </button>
          )}
        </div>
      )}
    </div>
  );
}
