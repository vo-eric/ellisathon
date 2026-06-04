import type {
  Article,
  GameMode,
  LobbySnapshot,
  PlayerProgress,
} from '../types';

const DEFAULT_TIME_LIMIT_MS = 10 * 60 * 1000;

function normalizeProgress(raw: unknown): Record<string, PlayerProgress> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PlayerProgress> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = (value ?? {}) as Record<string, unknown>;
    const status =
      v.status === 'finished' || v.status === 'forfeited'
        ? v.status
        : 'racing';
    out[id] = {
      status,
      clicks: typeof v.clicks === 'number' ? v.clicks : 0,
      finishedAt: typeof v.finishedAt === 'number' ? v.finishedAt : null,
    };
  }
  return out;
}

/**
 * API / WS payloads sometimes send `targetArticle` (or `startArticle`) as a plain
 * string instead of `{ title, url }`. Coerce so UI and `.replace()` never see undefined.
 */
export function coerceArticle(input: unknown): Article {
  if (typeof input === 'string') {
    const title = input.trim() || 'Unknown';
    const segment = title.replace(/ /g, '_');
    return {
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(segment)}`,
    };
  }
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const title = o.title != null ? String(o.title).trim() : '';
    if (title) {
      const urlCandidate =
        typeof o.url === 'string' && o.url.trim() ? o.url.trim() : undefined;
      const segment = title.replace(/ /g, '_');
      return {
        title,
        url:
          urlCandidate ??
          `https://en.wikipedia.org/wiki/${encodeURIComponent(segment)}`,
      };
    }
  }
  return {
    title: 'Unknown',
    url: 'https://en.wikipedia.org/wiki/Main_Page',
  };
}

export function normalizeLobbySnapshot(raw: unknown): LobbySnapshot {
  const l = raw as Record<string, unknown>;
  const players = (
    Array.isArray(l.players) ? l.players : []
  ) as LobbySnapshot['players'];
  const seats = (Array.isArray(l.seats) ? l.seats : []) as (string | null)[];
  const seatReady = (
    Array.isArray(l.seatReady) ? l.seatReady : []
  ) as boolean[];

  return {
    id: String(l.id ?? ''),
    status: (l.status as LobbySnapshot['status']) ?? 'waiting',
    hostId: String(l.hostId ?? ''),
    players,
    seats,
    seatReady,
    moveChain: (l.moveChain ?? null) as LobbySnapshot['moveChain'],
    startArticle: l.startArticle == null ? null : coerceArticle(l.startArticle),
    targetArticle: coerceArticle(l.targetArticle),
    winnerId: (l.winnerId as string | null) ?? null,
    maxPlayers:
      typeof l.maxPlayers === 'number'
        ? l.maxPlayers
        : Math.max(1, seats.length || 1),
    mode: (l.mode === 'golf' ? 'golf' : 'race') as GameMode,
    timeLimitMs:
      typeof l.timeLimitMs === 'number' && l.timeLimitMs > 0
        ? l.timeLimitMs
        : DEFAULT_TIME_LIMIT_MS,
    deadline: typeof l.deadline === 'number' ? l.deadline : null,
    participants: (Array.isArray(l.participants)
      ? l.participants
      : []) as LobbySnapshot['participants'],
    progress: normalizeProgress(l.progress),
  };
}

export function normalizeLobbyList(raw: unknown): LobbySnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeLobbySnapshot(item));
}
