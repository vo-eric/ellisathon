import type { LobbySnapshot, MoveListNodeSnapshot } from '../types';
import type { PlayerPath } from '../hooks/useReplay';

const P1_COLOR = '#FDA9BC';
const P2_COLOR = '#FBD860';
/** Spacing for replay scrubber when server does not send per-move timestamps */
const SYNTHETIC_STEP_MS = 800;

function flattenChain(head: MoveListNodeSnapshot | null) {
  const out: {
    article: string;
    url: string;
    step: number;
    end: boolean;
  }[] = [];
  let cur: MoveListNodeSnapshot | null = head;
  while (cur) {
    out.push({
      article: cur.article,
      url: cur.url,
      step: cur.step,
      end: cur.end,
    });
    cur = cur.next;
  }
  return out;
}

/**
 * Build replay paths for the results UI from the lobby move chain.
 * The server currently stores one linked list (solo = one player path).
 * When there are two seated players, nodes are still attributed to seat order
 * once the chain carries `playerId` per node; until then, all nodes go to seat 0.
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

  const p1: PlayerPath = {
    playerId: seat0?.id ?? 'p1',
    playerName: seat0?.name ?? 'Player 1',
    color: P1_COLOR,
    moves: flat.map((m) => ({
      ...m,
      timestamp: t0 + (m.step - 1) * SYNTHETIC_STEP_MS,
    })),
  };

  const p2: PlayerPath = {
    playerId: seat1?.id ?? 'p2',
    playerName: seat1?.name ?? 'Player 2',
    color: P2_COLOR,
    moves: [],
  };

  return { p1, p2 };
}
