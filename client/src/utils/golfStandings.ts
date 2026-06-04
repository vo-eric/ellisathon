import type { LobbySnapshot, MoveListNodeSnapshot } from '../types';
import type { PathMove } from '../hooks/useReplay';
import { SEAT_COLORS } from '../components/ResultsPage';

export type GolfPlayerStatus = 'finished' | 'racing' | 'forfeited';

export interface GolfStanding {
  id: string;
  name: string;
  color: string;
  /** Article navigations excluding the shared start node. */
  clicks: number;
  status: GolfPlayerStatus;
  finishedAt: number | null;
  seatIndex: number;
  /** 1-based place among finishers; null for racing/forfeited players. */
  place: number | null;
}

type RawStanding = Omit<GolfStanding, 'place'>;

function rankBucket(status: GolfPlayerStatus): number {
  if (status === 'finished') return 0;
  if (status === 'racing') return 1;
  return 2;
}

/**
 * Sort golf standings into live placement order:
 * finishers first (fewest clicks, earliest finish breaks ties), then players
 * still racing (fewest clicks first), then players who gave up. Finally assigns
 * a 1-based `place` to finishers.
 */
export function sortGolfStandings(list: RawStanding[]): GolfStanding[] {
  const sorted = [...list].sort((a, b) => {
    const ba = rankBucket(a.status);
    const bb = rankBucket(b.status);
    if (ba !== bb) return ba - bb;

    if (a.status === 'finished' && b.status === 'finished') {
      if (a.clicks !== b.clicks) return a.clicks - b.clicks;
      return (a.finishedAt ?? 0) - (b.finishedAt ?? 0);
    }
    if (a.status === 'racing' && b.status === 'racing') {
      if (a.clicks !== b.clicks) return a.clicks - b.clicks;
      return a.seatIndex - b.seatIndex;
    }
    // both forfeited
    return a.seatIndex - b.seatIndex;
  });

  let place = 0;
  return sorted.map((s) => ({
    ...s,
    place: s.status === 'finished' ? ++place : null,
  }));
}

/** Live standings derived from in-flight match state (client-tracked moves). */
export function buildLiveGolfStandings(
  seats: (string | null)[],
  players: { id: string; name: string }[],
  playerMoves: Map<string, PathMove[]>,
  forfeited: string[]
): GolfStanding[] {
  const raw: RawStanding[] = [];
  seats.forEach((playerId, seatIndex) => {
    if (!playerId) return;
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    const moves = playerMoves.get(playerId) ?? [];
    const finishedMove = moves.find((m) => m.end);
    const isForfeited = forfeited.includes(playerId);
    const status: GolfPlayerStatus = isForfeited
      ? 'forfeited'
      : finishedMove
      ? 'finished'
      : 'racing';

    raw.push({
      id: player.id,
      name: player.name,
      color: SEAT_COLORS[seatIndex] ?? '#ccc',
      clicks: Math.max(0, moves.length - 1),
      status,
      finishedAt: finishedMove?.timestamp ?? null,
      seatIndex,
    });
  });
  return sortGolfStandings(raw);
}

function clicksForPlayerInChain(
  chain: MoveListNodeSnapshot | null,
  playerId: string
): number {
  let n = 0;
  let cur = chain;
  while (cur) {
    if (cur.playerId === playerId) n++;
    cur = cur.next;
  }
  return n;
}

/** Final standings derived from the authoritative finished-lobby snapshot. */
export function buildFinalGolfStandings(lobby: LobbySnapshot): GolfStanding[] {
  const participants =
    lobby.participants && lobby.participants.length > 0
      ? lobby.participants
      : lobby.players;

  const seatIndexOf = (id: string) => {
    const idx = lobby.seats.indexOf(id);
    return idx >= 0 ? idx : participants.findIndex((p) => p.id === id);
  };

  const raw: RawStanding[] = participants.map((p) => {
    const progress = lobby.progress?.[p.id];
    const seatIndex = seatIndexOf(p.id);
    return {
      id: p.id,
      name: p.name,
      color: SEAT_COLORS[seatIndex] ?? '#ccc',
      clicks: progress?.clicks ?? clicksForPlayerInChain(lobby.moveChain, p.id),
      status: (progress?.status ?? 'racing') as GolfPlayerStatus,
      finishedAt: progress?.finishedAt ?? null,
      seatIndex,
    };
  });

  return sortGolfStandings(raw);
}
