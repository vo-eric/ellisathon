import type { ReplayNode, UseReplayResult } from '../hooks/useReplay';

type Props = {
  nodes: ReplayNode[];
  replay: UseReplayResult;
  players: { id: string; name: string; color: string }[];
};

export function ReplayTimeline({ nodes, replay }: Props) {
  const { currentTimeMs, playing, speed, durationMs, play, pause, seek, setSpeed } = replay;

  const pct = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;
  const t0ts = nodes[0]?.timestamp ?? 0;

  return (
    <div className='rtl-wrap'>
      {/* ── "replay ▶" label + play button + speed buttons ── */}
      <div className='rtl-label-group'>
        <span className='rtl-label'>replay</span>
        <button
          className='rtl-play-btn'
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={playing ? pause : play}
        >
          {playing ? '⏸' : '▶'}
        </button>
        {([1, 2, 5] as const).map((s) => (
          <button
            key={s}
            className={`rtl-speed-btn ${speed === s ? 'rtl-speed-btn--active' : ''}`}
            onClick={() => setSpeed(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* ── Track ── */}
      <div className='rtl-track-wrap'>
        {/* Rail */}
        <div className='rtl-rail' />

        {/* Step markers — one per move event */}
        {nodes.map((n, i) => {
          const markerPct = durationMs > 0 ? ((n.timestamp - t0ts) / durationMs) * 100 : 0;
          const reached = n.timestamp - t0ts <= currentTimeMs;
          const isEnd = n.end;

          return (
            <button
              key={`${n.playerId}-${i}`}
              className={`rtl-marker ${reached ? 'rtl-marker--reached' : ''}`}
              style={{
                left: `${markerPct}%`,
                background: reached ? n.color : '#fff',
                borderColor: n.color,
              }}
              title={`${n.playerName}: ${n.article}`}
              onClick={() => seek(n.timestamp - t0ts)}
            >
              {isEnd ? <span className='rtl-flag'>🏴</span> : <span>{n.step}</span>}
            </button>
          );
        })}

        {/* Playhead — hollow white circle */}
        <div className='rtl-playhead' style={{ left: `${pct}%` }} />

        {/* Invisible native range for scrubbing */}
        <input
          type='range'
          className='rtl-scrub'
          min={0}
          max={durationMs}
          step={50}
          value={currentTimeMs}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label='Seek'
        />
      </div>
    </div>
  );
}

