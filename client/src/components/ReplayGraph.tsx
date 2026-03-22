import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
} from 'react';
import type { ReplayNode } from '../hooks/useReplay';

// ─── Design tokens ────────────────────────────────────────────────────────────
const P1_COLOR = '#FDA9BC';
const P2_COLOR = '#FBD860';
const ANCHOR_FILL = '#111111';
const NODE_FILL = '#FEFAE8';
const NODE_STROKE = '#111111';

// Canvas
const SVG_W = 1000;
const SVG_H = 360;

// Three horizontal lanes
const ROW_P1 = 80;
const ROW_MID = 180;
const ROW_P2 = 280;

// Node pill
const NODE_W = 160;
const NODE_H = 40;
const RX = 20;
const STROKE_W = 2;

// Left/right padding
const X_PAD = 100;

/** Minimum center-to-center spacing so pills (NODE_W) do not overlap */
const NODE_GAP = 32;
const MIN_CENTER_GAP = NODE_W + NODE_GAP;

/** Padding when auto-scrolling to keep the newest visible node in view */
const SCROLL_TAIL_MARGIN = 48;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(Math.max(n, lo), hi);
}

// Edge animation: total dash cycle length
const DASH_LEN = 12;
const GAP_LEN = 6;
const CYCLE = DASH_LEN + GAP_LEN;

// ─── Tooltip ─────────────────────────────────────────────────────────────────

type TooltipState = {
  article: string;
  url: string;
  svgX: number; // node centre x in SVG coords
  svgY: number; // node centre y in SVG coords
};

function WikiTooltip({
  tooltip,
  svgRef,
}: {
  tooltip: TooltipState;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const [extract, setExtract] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setExtract(null);
    const title = encodeURIComponent(tooltip.article.replace(/ /g, '_'));
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
    let cancelled = false;
    fetch(apiUrl)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          // Plain-text extract, first sentence only, capped at 120 chars
          const full: string = d?.extract ?? '';
          const firstSentence = full.split(/(?<=\.)\s/)[0] ?? full;
          const short = firstSentence.length > 120
            ? firstSentence.slice(0, 117) + '…'
            : firstSentence;
          setExtract(short || 'No preview available.');
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExtract('No preview available.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [tooltip.article]);

  // Convert SVG coords → screen coords
  const svg = svgRef.current;
  if (!svg) return null;
  const pt = svg.createSVGPoint();
  pt.x = tooltip.svgX;
  pt.y = tooltip.svgY - NODE_H / 2 - 12; // above the node
  const screen = pt.matrixTransform(svg.getScreenCTM() ?? undefined);

  return (
    <div
      className='rg-tooltip'
      style={{ left: screen.x, top: screen.y }}
    >
      <a
        className='rg-tooltip-title'
        href={tooltip.url}
        target='_blank'
        rel='noopener noreferrer'
      >
        {tooltip.article} ↗
      </a>
      {loading ? (
        <p className='rg-tooltip-extract rg-tooltip-loading'>Loading…</p>
      ) : (
        <p className='rg-tooltip-extract'>{extract}</p>
      )}
    </div>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Lane = 'p1' | 'mid' | 'p2';

type LayoutNode = {
  key: string;
  article: string;
  url: string;
  x: number;
  y: number;
  lane: Lane;
  isAnchor: boolean;
  /** Both players visited this article; show split fill (non-anchor only). */
  isSharedPath: boolean;
  gradientId: string;
  visible: boolean;
};

type LayoutEdge = {
  key: string;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
  visible: boolean;
  /** unique id used for animateMotion marker */
  id: string;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  p1Nodes: ReplayNode[];
  p2Nodes: ReplayNode[];
  currentTimeMs: number;
  t0: number;
  /** When true and time moves forward, scroll the strip to keep up with the replay. */
  replayPlaying?: boolean;
};

export function ReplayGraph({
  p1Nodes,
  p2Nodes,
  currentTimeMs,
  t0,
  replayPlaying = false,
}: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevTimeMsRef = useRef(currentTimeMs);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  const layout = useMemo(() => {
    if (p1Nodes.length === 0 && p2Nodes.length === 0) {
      return { nodes: [], edges: [], svgW: SVG_W };
    }

    const p1Set = new Set(p1Nodes.map((n) => norm(n.article)));
    const p2Set = new Set(p2Nodes.map((n) => norm(n.article)));

    const startKey = norm(p1Nodes[0]?.article ?? p2Nodes[0]?.article ?? '');
    const endKey = norm(
      p1Nodes.find((n) => n.end)?.article ??
        p2Nodes.find((n) => n.end)?.article ??
        ''
    );

    const laneOf = (key: string): Lane => {
      if (key === startKey || key === endKey) return 'mid';
      if (p1Set.has(key) && p2Set.has(key)) return 'mid';
      if (p1Set.has(key)) return 'p1';
      return 'p2';
    };

    const p1Reach = new Map<string, number>();
    const p2Reach = new Map<string, number>();
    // store URL per article for tooltips
    const urlMap = new Map<string, string>();
    for (const n of p1Nodes) { p1Reach.set(norm(n.article), n.timestamp); urlMap.set(norm(n.article), n.url); }
    for (const n of p2Nodes) { p2Reach.set(norm(n.article), n.timestamp); urlMap.set(norm(n.article), n.url); }

    const vis = (ts: number | undefined) =>
      ts !== undefined && ts - t0 <= currentTimeMs;

    const seen = new Map<string, string>();
    for (const n of [...p1Nodes, ...p2Nodes].sort((a, b) => a.timestamp - b.timestamp)) {
      if (!seen.has(norm(n.article))) seen.set(norm(n.article), n.article);
    }
    const ordered = Array.from(seen.entries());

    const span =
      ordered.length > 1 ? (ordered.length - 1) * MIN_CENTER_GAP : 0;
    const contentW = X_PAD * 2 + span;
    const svgW = Math.max(SVG_W, contentW);
    const xOf = new Map<string, number>();
    ordered.forEach(([key], i) =>
      xOf.set(key, X_PAD + i * MIN_CENTER_GAP)
    );

    const nodeMap = new Map<string, LayoutNode>();
    for (const [key, display] of ordered) {
      const lane = laneOf(key);
      const y = lane === 'p1' ? ROW_P1 : lane === 'mid' ? ROW_MID : ROW_P2;
      const isAnchor = key === startKey || key === endKey;
      const bothVisit = p1Set.has(key) && p2Set.has(key);
      const isSharedPath = bothVisit && !isAnchor;
      const gradientId = `rg-split-${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const p1t = p1Reach.get(key);
      const p2t = p2Reach.get(key);

      const reached = vis(p1t) || vis(p2t);
      // Start always shown; finish (and intermediates) only after replay reaches that move
      const visible =
        key === startKey || (key !== startKey && reached);

      nodeMap.set(key, {
        key,
        article: display,
        url: urlMap.get(key) ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(display)}`,
        x: xOf.get(key) ?? 0,
        y,
        lane,
        isAnchor,
        isSharedPath,
        gradientId,
        visible,
      });
    }

    const edges: LayoutEdge[] = [];
    const addEdges = (nodes: ReplayNode[], color: string, reach: Map<string, number>) => {
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodeMap.get(norm(nodes[i].article));
        const b = nodeMap.get(norm(nodes[i + 1].article));
        if (!a || !b) continue;
        const id = `edge-${color.replace('#', '')}-${i}`;
        edges.push({
          key: id,
          id,
          x1: a.x, y1: a.y,
          x2: b.x, y2: b.y,
          color,
          visible: vis(reach.get(norm(nodes[i + 1].article))),
        });
      }
    };

    addEdges(p1Nodes, P1_COLOR, p1Reach);
    addEdges(p2Nodes, P2_COLOR, p2Reach);

    const nodes = Array.from(nodeMap.values());

    return { nodes, edges, svgW };
  }, [p1Nodes, p2Nodes, currentTimeMs, t0]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (currentTimeMs <= 0.001) {
      el.scrollLeft = 0;
      prevTimeMsRef.current = currentTimeMs;
      return;
    }

    const forward = currentTimeMs >= prevTimeMsRef.current - 0.001;
    prevTimeMsRef.current = currentTimeMs;

    const shown = layout.nodes.filter((n) => n.visible);
    if (shown.length === 0) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;

    if (replayPlaying && forward) {
      const rightEdge =
        Math.max(...shown.map((n) => n.x + NODE_W / 2)) + SCROLL_TAIL_MARGIN;
      el.scrollLeft = clamp(rightEdge - el.clientWidth, 0, maxScroll);
    }
  }, [layout, currentTimeMs, replayPlaying]);

  return (
    <>
      <div ref={scrollRef} className='rg-scroll-wrap'>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${layout.svgW} ${SVG_H}`}
          width={layout.svgW}
          height={SVG_H}
          className='rg-svg'
          aria-label='Path diagram'
        >
        <defs>
          {layout.nodes
            .filter((n) => n.isSharedPath)
            .map((n) => (
              <linearGradient
                key={n.gradientId}
                id={n.gradientId}
                x1='0'
                y1='0'
                x2='1'
                y2='0'
                gradientUnits='objectBoundingBox'
              >
                <stop offset='0%' stopColor={P1_COLOR} />
                <stop offset='100%' stopColor={P2_COLOR} />
              </linearGradient>
            ))}
          {/* Animated dash patterns — one marker per edge color */}
          {[P1_COLOR, P2_COLOR].map((color) => (
            <marker
              key={color}
              id={`arrow-${color.replace('#', '')}`}
              viewBox='0 0 10 10'
              refX='9'
              refY='5'
              markerWidth='6'
              markerHeight='6'
              orient='auto-start-reverse'
            >
              <path d='M 0 0 L 10 5 L 0 10 z' fill={color} />
            </marker>
          ))}
        </defs>

        {/* ── Edges — solid colored lines with flowing dash animation ── */}
        {layout.edges.map((e) => {
          if (!e.visible) return null;
          const mx = (e.x1 + e.x2) / 2;
          const d = `M ${e.x1} ${e.y1} C ${mx} ${e.y1}, ${mx} ${e.y2}, ${e.x2} ${e.y2}`;
          const markerId = `arrow-${e.color.replace('#', '')}`;
          return (
            <path
              key={e.key}
              d={d}
              fill='none'
              stroke={e.color}
              strokeWidth={3}
              strokeDasharray={`${DASH_LEN} ${GAP_LEN}`}
              strokeLinecap='round'
              markerEnd={`url(#${markerId})`}
              className='rg-edge'
            >
              <animate
                attributeName='stroke-dashoffset'
                from={CYCLE}
                to='0'
                dur='0.6s'
                repeatCount='indefinite'
              />
            </path>
          );
        })}

        {/* ── Nodes ── */}
        {layout.nodes.map((n) => {
          if (!n.visible) return null;
          const label = n.article.length > 18 ? n.article.slice(0, 17) + '…' : n.article;
          const textColor = n.isAnchor ? '#fff' : '#111';
          const fill = n.isAnchor
            ? ANCHOR_FILL
            : n.isSharedPath
              ? `url(#${n.gradientId})`
              : NODE_FILL;
          const stroke = n.isAnchor ? ANCHOR_FILL : NODE_STROKE;

          return (
            <g
              key={n.key}
              transform={`translate(${n.x - NODE_W / 2}, ${n.y - NODE_H / 2})`}
              className='rg-node'
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => {
                setTooltip({ article: n.article, url: n.url, svgX: n.x, svgY: n.y });
              }}
              onMouseLeave={hideTooltip}
              onClick={() => window.open(n.url, '_blank', 'noopener,noreferrer')}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={RX}
                fill={fill}
                stroke={stroke}
                strokeWidth={n.isAnchor ? 0 : STROKE_W}
              />
              <text
                x={NODE_W / 2}
                y={NODE_H / 2}
                textAnchor='middle'
                dominantBaseline='central'
                fill={textColor}
                fontSize={13}
                fontFamily='"Space Mono", monospace'
                fontWeight={n.isAnchor ? 700 : 400}
                letterSpacing='0.01em'
              >
                {label}
              </text>
            </g>
          );
        })}
        </svg>
      </div>

      {/* ── Tooltip (rendered outside SVG so it can overflow) ── */}
      {tooltip && (
        <WikiTooltip tooltip={tooltip} svgRef={svgRef} />
      )}
    </>
  );
}

