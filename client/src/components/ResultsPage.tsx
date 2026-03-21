import { useMemo } from 'react';
import { useReplay } from '../hooks/useReplay';
import type { PlayerPath, ReplayNode } from '../hooks/useReplay';
import { ReplayTimeline } from './ReplayTimeline';
import { ReplayGraph } from './ReplayGraph';

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
  p1?: PlayerPath;
  p2?: PlayerPath;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ResultsPage({ p1: p1Prop, p2: p2Prop }: Props) {
  const p1 = p1Prop ?? SAMPLE_P1;
  const p2 = p2Prop ?? SAMPLE_P2;

  // ── Merge all nodes for the timeline clock ──
  const allNodes: ReplayNode[] = useMemo(
    () =>
      [
        ...p1.moves.map((m) => ({ ...m, playerId: p1.playerId, playerName: p1.playerName, color: p1.color })),
        ...p2.moves.map((m) => ({ ...m, playerId: p2.playerId, playerName: p2.playerName, color: p2.color })),
      ].sort((a, b) => a.timestamp - b.timestamp),
    [p1, p2]
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

  // ── Move counts at current replay time ──
  const p1Count = p1Nodes.filter((n) => n.timestamp - t0 <= currentTimeMs).length;
  const p2Count = p2Nodes.filter((n) => n.timestamp - t0 <= currentTimeMs).length;

  // ── Winner ──
  const p1Done = p1Nodes.some((n) => n.end && n.timestamp - t0 <= currentTimeMs);
  const p2Done = p2Nodes.some((n) => n.end && n.timestamp - t0 <= currentTimeMs);
  void p1Done; void p2Done;

  return (
    <div className='results-page'>

      {/* ── SECTION 1: Scorecards — name pill + big move count ── */}
      <div className='results-scorecards'>
        {[
          { path: p1, count: p1Count, done: p1Done },
          { path: p2, count: p2Count, done: p2Done },
        ].map(({ path, count }) => (
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
        players={[
          { id: p1.playerId, name: p1.playerName, color: p1.color },
          { id: p2.playerId, name: p2.playerName, color: p2.color },
        ]}
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
