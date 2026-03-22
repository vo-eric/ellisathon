import type { MoveListNodeSnapshot } from './types';

/** Deep clone + append a node at the tail (immutable result). */
export function appendMoveNode(
  head: MoveListNodeSnapshot | null,
  payload: {
    article: string;
    url: string;
    step: number;
    end: boolean;
    playerId: string;
  }
): MoveListNodeSnapshot | null {
  const newNode: MoveListNodeSnapshot = {
    article: payload.article,
    url: payload.url,
    step: payload.step,
    end: payload.end,
    playerId: payload.playerId,
    next: null,
  };
  if (!head) return newNode;
  const clone = JSON.parse(JSON.stringify(head)) as MoveListNodeSnapshot;
  let cur = clone;
  while (cur.next) cur = cur.next;
  cur.next = newNode;
  return clone;
}
