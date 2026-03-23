import { useState } from 'react';
import { MovePathViz } from './MovePathViz';
import type { MoveListNodeSnapshot } from '../types';

type Props = {
  moveChain: MoveListNodeSnapshot | null;
  /** When false, sidebar is hidden (not on the game screen). */
  visible: boolean;
};

/**
 * Local tooling: visual path + optional raw JSON.
 */
export function MovesDevSidebar({ moveChain, visible }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  if (!visible) return null;

  const json = moveChain === null ? 'null' : JSON.stringify(moveChain, null, 2);

  return (
    <aside className='moves-sidebar' aria-label='Move path'>
      <div className='moves-sidebar-header'>
        <h3>Path</h3>
        <span className='moves-sidebar-badge'>dev</span>
      </div>
      <p className='moves-sidebar-hint'>
        Articles visited in order. Green bubble = current target hit.
      </p>
      <div className='moves-sidebar-path'>
        <MovePathViz moveChain={moveChain} />
      </div>
      <div className='moves-sidebar-footer'>
        <button
          type='button'
          className='moves-sidebar-toggle'
          onClick={() => setShowRaw((v) => !v)}
        >
          {showRaw ? 'Hide' : 'Show'} raw JSON
        </button>
        {showRaw && <pre className='moves-sidebar-json'>{json}</pre>}
      </div>
    </aside>
  );
}
