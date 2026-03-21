import type { MoveListNodeSnapshot } from './types';

/** Flatten linked list head → tail for rendering. */
export function flattenMoveChain(
  head: MoveListNodeSnapshot | null
): MoveListNodeSnapshot[] {
  const out: MoveListNodeSnapshot[] = [];
  let cur = head;
  while (cur) {
    out.push(cur);
    cur = cur.next;
  }
  return out;
}
