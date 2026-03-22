import type { LobbySnapshot, MoveListNodeSnapshot } from '../types';
import type { PlayerPath } from '../hooks/useReplay';

const P1_COLOR = '#FDA9BC';
const P2_COLOR = '#FBD860';
/** Spacing for replay scrubber when server does not send per-move timestamps */
const SYNTHETIC_STEP_MS = 800;

type FlatNode = {
  article: string;
  url: string;
  step: number;
  end: boolean;
  playerId?: string | null;
};

function flattenChain(head: MoveListNodeSnapshot | null): FlatNode[] {
  const out: FlatNode[] = [];
  let cur: MoveListNodeSnapshot | null = head;
  while (cur) {
    out.push({
      article: cur.article,
      url: cur.url,
      step: cur.step,
      end: cur.end,
      playerId: cur.playerId,
    });
    cur = cur.next;
  }
  return out;
}

function buildLegacyPaths(
  flat: FlatNode[],
  seat0: { id: string; name: string } | undefined,
  seat1: { id: string; name: string } | undefined,
  t0: number
): { p1: PlayerPath; p2: PlayerPath } {
  return {
    p1: {
      playerId: seat0?.id ?? 'p1',
      playerName: seat0?.name ?? 'Player 1',
      color: P1_COLOR,
      moves: flat.map((m, i) => ({
        article: m.article,
        url: m.url,
        step: m.step,
        end: m.end,
        timestamp: t0 + i * SYNTHETIC_STEP_MS,
      })),
    },
    p2: {
      playerId: seat1?.id ?? 'p2',
      playerName: seat1?.name ?? 'Player 2',
      color: P2_COLOR,
      moves: [],
    },
  };
}

/**
 * Build replay paths for the results UI from the lobby move chain.
 * New chains carry `playerId` per node (null on the shared start); we split into two paths.
 * Older payloads without `playerId` keep the legacy behavior (all moves on seat 0).
 */
export function moveChainToResultsPaths(
  chain: MoveListNodeSnapshot | null,
  lobby: LobbySnapshot | null,
  gameStartedAtMs: number | null
): { p1: PlayerPath; p2: PlayerPath } {
  const flat = flattenChain(chain);
  const t0 =
    gameStartedAtMs ??
    (flat.length ? Date.now() - flat.length * SYNTHETIC_STEP_MS : Date.now());

  const seat0 =
    lobby?.seats?.[0] != null
      ? lobby.players.find((p) => p.id === lobby.seats[0])
      : lobby?.players[0];
  const seat1 =
    lobby?.seats?.[1] != null
      ? lobby.players.find((p) => p.id === lobby.seats[1])
      : lobby?.players[1];

  const id0 = seat0?.id ?? 'p1';
  const id1 = seat1?.id ?? 'p2';

  const useSplit = flat.some((n) => n.playerId !== undefined);

  if (!useSplit) {
    return buildLegacyPaths(flat, seat0, seat1, t0);
  }

  type AccMove = {
    article: string;
    url: string;
    end: boolean;
    timestamp: number;
  };

  const p1Acc: AccMove[] = [];
  const p2Acc: AccMove[] = [];

  for (let i = 0; i < flat.length; i++) {
    const n = flat[i];
    const ts = t0 + i * SYNTHETIC_STEP_MS;
    const pid = n.playerId;
    const slice = {
      article: n.article,
      url: n.url,
      end: n.end,
      timestamp: ts,
    };

    if (pid === null || pid === undefined) {
      p1Acc.push(slice);
      p2Acc.push(slice);
    } else if (pid === id0) {
      p1Acc.push(slice);
    } else if (pid === id1) {
      p2Acc.push(slice);
    }
  }

  const toPathMoves = (acc: AccMove[]) =>
    acc.map((m, idx) => ({
      article: m.article,
      url: m.url,
      step: idx + 1,
      end: m.end,
      timestamp: m.timestamp,
    }));

  return {
    p1: {
      playerId: id0,
      playerName: seat0?.name ?? 'Player 1',
      color: P1_COLOR,
      moves: toPathMoves(p1Acc),
    },
    p2: {
      playerId: id1,
      playerName: seat1?.name ?? 'Player 2',
      color: P2_COLOR,
      moves: toPathMoves(p2Acc),
    },
  };
}
