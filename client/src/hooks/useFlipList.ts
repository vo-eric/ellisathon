import { useLayoutEffect, useRef } from 'react';

const FLIP_DURATION_MS = 480;
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * FLIP animation for list reordering: rows slide to their new positions when
 * `deps` changes and the DOM updates.
 */
export function useFlipList<T>(deps: T) {
  const listRef = useRef<HTMLUListElement>(null);
  const positionsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const rows = list.querySelectorAll<HTMLElement>('[data-flip-id]');
    const nextPositions = new Map<string, DOMRect>();

    rows.forEach((row) => {
      const id = row.dataset.flipId;
      if (!id) return;
      nextPositions.set(id, row.getBoundingClientRect());
    });

    if (!prefersReduced) {
      rows.forEach((row) => {
        const id = row.dataset.flipId;
        if (!id) return;

        const prev = positionsRef.current.get(id);
        const next = nextPositions.get(id);
        if (!prev || !next) return;

        const deltaY = prev.top - next.top;
        if (Math.abs(deltaY) < 2) return;

        row.style.transition = 'none';
        row.style.transform = `translateY(${deltaY}px)`;
        row.classList.add('golf-board-row--flipping');
        row.classList.remove(
          'golf-board-row--shift-up',
          'golf-board-row--shift-down'
        );
        row.classList.add(
          deltaY > 0 ? 'golf-board-row--shift-up' : 'golf-board-row--shift-down'
        );

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            row.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
            row.style.transform = '';
          });
        });

        const onEnd = (e: TransitionEvent) => {
          if (e.propertyName !== 'transform') return;
          row.removeEventListener('transitionend', onEnd);
          row.style.transition = '';
          row.style.transform = '';
          row.classList.remove(
            'golf-board-row--flipping',
            'golf-board-row--shift-up',
            'golf-board-row--shift-down'
          );
        };
        row.addEventListener('transitionend', onEnd);
      });
    }

    positionsRef.current = nextPositions;
  }, [deps]);

  return listRef;
}
