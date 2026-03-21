import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayerPath = {
  playerId: string;
  playerName: string;
  color: string;
  moves: PathMove[];
};

export type PathMove = {
  article: string;
  url: string;
  step: number;
  end: boolean;
  timestamp: number; // epoch ms
};

/** Flat merged event used by the timeline + graph */
export type ReplayNode = {
  article: string;
  url: string;
  step: number;
  end: boolean;
  timestamp: number;
  playerId: string;
  playerName: string;
  color: string;
};

export type UseReplayResult = {
  currentTimeMs: number; // 0 → durationMs, relative to t0
  playing: boolean;
  speed: 1 | 2 | 5;
  durationMs: number;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  setSpeed: (s: 1 | 2 | 5) => void;
  restart: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * rAF-based replay clock.
 * `nodes` must be sorted ascending by timestamp.
 */
export function useReplay(nodes: ReplayNode[]): UseReplayResult {
  const t0 = nodes[0]?.timestamp ?? 0;
  const tEnd = nodes[nodes.length - 1]?.timestamp ?? 0;
  const durationMs = Math.max(tEnd - t0, 1);

  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<1 | 2 | 5>(1);

  const playingRef = useRef(false);
  const speedRef = useRef<1 | 2 | 5>(1);
  const wallStartRef = useRef(0);
  const replayStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const durationRef = useRef(durationMs);

  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);

  const tick = useCallback(() => {
    if (!playingRef.current) return;
    const elapsed = (performance.now() - wallStartRef.current) * speedRef.current;
    const next = Math.min(replayStartRef.current + elapsed, durationRef.current);
    setCurrentTimeMs(next);
    if (next >= durationRef.current) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;
    setPlaying(true);
    wallStartRef.current = performance.now();
    // read latest value from a ref so we don't close over stale state
    replayStartRef.current = currentTimeMsRef.current;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // keep a ref to currentTimeMs for use inside play() without stale closure
  const currentTimeMsRef = useRef(0);
  useEffect(() => {
    currentTimeMsRef.current = currentTimeMs;
  }, [currentTimeMs]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, durationMs));
      setCurrentTimeMs(clamped);
      currentTimeMsRef.current = clamped;
      if (playingRef.current) {
        wallStartRef.current = performance.now();
        replayStartRef.current = clamped;
      }
    },
    [durationMs]
  );

  const setSpeed = useCallback((s: 1 | 2 | 5) => {
    speedRef.current = s;
    setSpeedState(s);
    if (playingRef.current) {
      // reset wall clock so speed change is seamless
      wallStartRef.current = performance.now();
      replayStartRef.current = currentTimeMsRef.current;
    }
  }, []);

  const restart = useCallback(() => {
    pause();
    seek(0);
  }, [pause, seek]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { currentTimeMs, playing, speed, durationMs, play, pause, seek, setSpeed, restart };
}
