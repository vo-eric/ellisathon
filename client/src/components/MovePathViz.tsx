import { ChevronDown, Flag } from 'lucide-react';
import { Fragment } from 'react';
import { flattenMoveChain } from '../moveChainUtils';
import type { MoveListNodeSnapshot } from '../types';

type Props = {
  moveChain: MoveListNodeSnapshot | null;
};

/**
 * Visual path: stacked bubbles with arrows (uses lucide-react icons).
 */
export function MovePathViz({ moveChain }: Props) {
  const nodes = flattenMoveChain(moveChain);

  if (nodes.length === 0) {
    return (
      <div className='move-path-empty'>
        <p>No path yet — start or join a game.</p>
      </div>
    );
  }

  return (
    <div className='move-path-viz' role='list' aria-label='Article path'>
      {nodes.map((node, i) => (
        <Fragment key={`${node.step}-${node.article}`}>
          <div
            role='listitem'
            className={[
              'move-path-bubble',
              node.end ? 'move-path-bubble--goal' : '',
              i === 0 ? 'move-path-bubble--start' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={node.url}
          >
            <span className='move-path-bubble-step'>#{node.step}</span>
            <span className='move-path-bubble-title'>{node.article}</span>
            {node.end && (
              <Flag
                className='move-path-bubble-flag'
                size={14}
                aria-label='Target article'
              />
            )}
          </div>
          {i < nodes.length - 1 && (
            <div className='move-path-arrow' aria-hidden>
              <ChevronDown size={22} strokeWidth={2.25} />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
