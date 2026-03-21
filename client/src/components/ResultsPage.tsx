import { useMemo } from 'react';
import { useReplay } from '../hooks/useReplay';
import type { PlayerPath, ReplayNode } from '../hooks/useReplay';
import { ReplayTimeline } from './ReplayTimeline';
import { ReplayGraph } from './ReplayGraph';

// ─── Seat colours (p1 → p4) ──────────────────────────────────────────────────
export const SEAT_COLORS = ['#FBD860', '#FDA9BC', '#C7F7C9', '#F0C8FF'];

// ─── Embedded sample data (used when no live data is passed) ─────────────────
// These mirror client/public/p1-path.json and p2-path.json exactly.

const SAMPLE_P1: PlayerPath = {
  playerId: 'p1',
  playerName: 'eric',
  color: '#FDA9BC',
  moves: [
    { article: 'Pet',          url: 'https://en.wikipedia.org/wiki/Pet',           step: 1, end: false, timestamp: 1742558400000 },
    { article: 'Dog',          url: 'https://en.wikipedia.org/wiki/Dog',           step: 2, end: false, timestamp: 1742558408000 },
    { article: 'Mammal',       url: 'https://en.wikipedia.org/wiki/Mammal',        step: 3, end: false, timestamp: 1742558418000 },
    { article: 'Cell biology', url: 'https://en.wikipedia.org/wiki/Cell_biology',  step: 4, end: false, timestamp: 1742558430000 },
    { article: 'Biochemistry', url: 'https://en.wikipedia.org/wiki/Biochemistry',  step: 5, end: true,  timestamp: 1742558441000 },
  ],
};

function emptyPlayerPath(playerId: string, playerName: string, color: string): PlayerPath {
  return { playerId, playerName, color, moves: [] };
}

const SAMPLE_P2: PlayerPath = {
  playerId: 'p2',
  playerName: 'peter',
  color: '#FBD860',
  moves: [
    { article: 'Pet',          url: 'https://en.wikipedia.org/wiki/Pet',           step: 1, end: false, timestamp: 1742558400000 },
    { article: 'Animal',       url: 'https://en.wikipedia.org/wiki/Animal',        step: 2, end: false, timestamp: 1742558411000 },
    { article: 'Mammal',       url: 'https://en.wikipedia.org/wiki/Mammal',        step: 3, end: false, timestamp: 1742558422000 },
    { article: 'Metabolism',   url: 'https://en.wikipedia.org/wiki/Metabolism',    step: 4, end: false, timestamp: 1742558435000 },
    { article: 'Enzyme',       url: 'https://en.wikipedia.org/wiki/Enzyme',        step: 5, end: false, timestamp: 1742558447000 },
    { article: 'Biochemistry', url: 'https://en.wikipedia.org/wiki/Biochemistry',  step: 6, end: true,  timestamp: 1742558461000 },
  ],
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  /** Live per-player paths from a real game. Falls back to sample data if omitted. */
  paths?: PlayerPath[];
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ResultsPage({ paths }: Props) {
  const useLive = paths !== undefined;
  const p1 = !useLive
    ? SAMPLE_P1
    : (paths[0] ?? emptyPlayerPath('p1', 'Player 1', SEAT_COLORS[0] ?? '#FBD860'));
  const p2 = !useLive
    ? SAMPLE_P2
    : (paths[1] ?? emptyPlayerPath('p2', 'Player 2', SEAT_COLORS[1] ?? '#FDA9BC'));

  const pathsForUi = useMemo(() => {
    if (!useLive) return [p1, p2];
    return [p1, p2].filter((path) => path.moves.length > 0);
  }, [useLive, p1, p2]);

  // ── Merge all nodes for the timeline clock ──
  const allNodes: ReplayNode[] = useMemo(
    () =>
      pathsForUi
        .flatMap((path) =>
          path.moves.map((m) => ({
            ...m,
            playerId: path.playerId,
            playerName: path.playerName,
            color: path.color,
          }))
        )
        .sort((a, b) => a.timestamp - b.timestamp),
    [pathsForUi]
  );

  const replay = useReplay(allNodes);
  const { currentTimeMs } = replay;
  const t0 = allNodes[0]?.timestamp ?? 0;

  // ── Per-player nodes for the graph ──
  const p1Nodes: ReplayNode[] = p1.moves.map((m) => ({
    ...m,
    playerId: p1.playerId,
    playerName: p1.playerName,
    color: p1.color,
  }));
  const p2Nodes: ReplayNode[] = p2.moves.map((m) => ({
    ...m,
    playerId: p2.playerId,
    playerName: p2.playerName,
    color: p2.color,
  }));

  if (useLive && allNodes.length === 0) {
    return (
      <div className='results-page'>
        <p className='results-empty'>No moves to replay yet. Finish a run and open results again.</p>
      </div>
    );
  }

  return (
    <div className='results-page'>

      {/* ── SECTION 1: Scorecards — name pill + big move count ── */}
      <div className='results-scorecards'>
        {pathsForUi.map((path) => {
          const nodes = path.moves.map((m) => ({
            ...m,
            playerId: path.playerId,
            playerName: path.playerName,
            color: path.color,
          }));
          const count = nodes.filter((n) => n.timestamp - t0 <= currentTimeMs).length;
          return { path, count };
        }).map(({ path, count }) => (
          <div key={path.playerId} className='results-card'>
            {/* Colored pill name badge */}
            <div
              className='results-card-name'
              style={{ background: path.color }}
            >
              {path.playerName}
            </div>
            {/* Big move number */}
            <div className='results-card-moves'>{Math.max(0, count - 1)}</div>
          </div>
        ))}
      </div>

      {/* ── SECTION 2: Replay timeline (inline label + play btn) ── */}
      <ReplayTimeline
        nodes={allNodes}
        replay={replay}
        players={pathsForUi.map((path) => ({
          id: path.playerId,
          name: path.playerName,
          color: path.color,
        }))}
      />

      {/* ── SECTION 3: Path diagram ── */}
      <div className='results-graph-wrap'>
        <ReplayGraph
          p1Nodes={p1Nodes}
          p2Nodes={p2Nodes}
          currentTimeMs={currentTimeMs}
          t0={t0}
        />
      </div>
    </div>
  );
}
