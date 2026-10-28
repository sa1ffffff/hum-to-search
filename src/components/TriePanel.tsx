import { useEffect, useMemo, useRef } from 'react';
import { VisitState } from '../engine/types';
import { easeOut, fitCanvas, readTokens } from '../lib/canvas';
import { useAnimationFrame, useElementSize, useReducedMotion, useSnapshot } from '../lib/hooks';
import { layoutTrace, type TrieLayout } from './trieLayout';

const TOKENS = ['paper-hi', 'paper-lo', 'paper-edge', 'rule', 'ink', 'ink-2', 'ink-3', 'hole', 'leader', 'vermilion'] as const;
const TWEEN_MS = 420;
const PAD = { top: 26, right: 18, bottom: 14, left: 30 };

interface Drawn {
  x: number;
  y: number;
  alpha: number;
}

interface Frame {
  from: Map<number, Drawn>;
  to: TrieLayout | null;
  /** Nodes that were visible before and are gone now: drawn tearing away. */
  leaving: { x: number; y: number }[];
  start: number;
}

export function TriePanel() {
  const snap = useSnapshot();
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boxRef, size] = useElementSize<HTMLDivElement>();
  const colors = useMemo(() => readTokens(TOKENS), []);
  const monoFont = useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--font-mono'), []);
  const outcome = snap.outcome;
  const layout = useMemo(() => (outcome ? layoutTrace(outcome.trace) : null), [outcome]);

  const current = useRef(new Map<number, Drawn>());
  const frame = useRef<Frame>({ from: new Map(), to: null, leaving: [], start: 0 });
  const dirty = useRef(true);

  // Geometry for a layout at the current canvas size.
  const place = useMemo(() => {
    return (l: TrieLayout) => {
      const w = Math.max(1, size.width - PAD.left - PAD.right);
      const h = Math.max(1, size.height - PAD.top - PAD.bottom);
      const columns = Math.max(l.maxDepth, 6);
      return {
        x: (depth: number) => PAD.left + (depth / columns) * w,
        y: (units: number) => PAD.top + (units / l.totalWeight) * h,
      };
    };
  }, [size.width, size.height]);

  // A new search: tween every node from where it was drawn to its new place.
  useEffect(() => {
    const previous = current.current;
    const leaving: Frame['leaving'] = [];
    if (layout) {
      for (const [id, drawn] of previous) {
        if (drawn.alpha > 0.05 && !layout.byId.has(id)) leaving.push({ x: drawn.x, y: drawn.y });
      }
    }
    frame.current = { from: new Map(previous), to: layout, leaving: leaving.slice(0, 1500), start: performance.now() };
    dirty.current = true;
  }, [layout]);

  useEffect(() => {
    dirty.current = true;
  }, [size.width, size.height]);

  useAnimationFrame((now) => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const { from, to, leaving, start } = frame.current;
    const t = reduced ? 1 : Math.min(1, (now - start) / TWEEN_MS);
    if (!dirty.current && t >= 1) return;
    dirty.current = t < 1;

    const ctx = fitCanvas(canvas, size.width, size.height);
    if (!ctx) return;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = colors['paper-hi'];
    ctx.fillRect(0, 0, size.width, size.height);

    const next = new Map<number, Drawn>();
    if (!to || to.nodes.length === 0) {
      current.current = next;
      return;
    }

    const geo = place(to);
    const k = easeOut(t);
    const rootX = PAD.left;
    const rootY = geo.y(to.rootY);

    // Depth ruler along the top.
    ctx.font = `500 10px ${monoFont}`;
    ctx.fillStyle = colors['ink-3'];
    ctx.textAlign = 'center';
    const columns = Math.max(to.maxDepth, 6);
    for (let d = 1; d <= columns; d++) {
      const x = geo.x(d);
      ctx.fillStyle = colors['paper-lo'];
      ctx.fillRect(Math.round(x), PAD.top - 6, 1, size.height - PAD.top - PAD.bottom + 6);
      if (d % 2 === 0 || columns <= 12) {
        ctx.fillStyle = colors['ink-3'];
        ctx.fillText(String(d), x, 12);
      }
    }
    ctx.textAlign = 'start';

    const dense = to.totalWeight > 220;
    const lineWidth = dense ? 0.8 : 1.4;

    // Resolve every node's drawn position for this frame.
    for (const node of to.nodes) {
      const targetX = geo.x(node.depth);
      const targetY = geo.y(node.y);
      const prev = from.get(node.id);
      let x = targetX;
      let y = targetY;
      let alpha = 1;
      if (prev) {
        x = prev.x + (targetX - prev.x) * k;
        y = prev.y + (targetY - prev.y) * k;
        alpha = prev.alpha + (1 - prev.alpha) * k;
      } else {
        // New branches grow out of their parent.
        const parent = from.get(node.parentId) ?? next.get(node.parentId);
        const ox = parent?.x ?? rootX;
        const oy = parent?.y ?? rootY;
        x = ox + (targetX - ox) * k;
        y = oy + (targetY - oy) * k;
        alpha = k;
      }
      next.set(node.id, { x, y, alpha });
    }

    // Branches tearing away from the previous search fade out in vermilion.
    if (k < 1 && leaving.length) {
      ctx.strokeStyle = colors.vermilion;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (const gone of leaving) {
        ctx.moveTo(gone.x - 6, gone.y);
        ctx.lineTo(gone.x, gone.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Edges, drawn as roll strips: across, then down, then across.
    const layoutNodes = to.nodes;
    const strokeEdges = (
      filter: (n: (typeof layoutNodes)[number]) => boolean,
      color: string,
      dash: number[] = [],
      weight = 1,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (const node of layoutNodes) {
        if (!filter(node)) continue;
        const me = next.get(node.id)!;
        const parent = next.get(node.parentId);
        const px = parent?.x ?? rootX;
        const py = parent?.y ?? rootY;
        const bend = px + (me.x - px) * 0.35;
        ctx.globalAlpha = me.alpha * weight;
        ctx.moveTo(px, py);
        ctx.lineTo(bend, py);
        ctx.lineTo(bend, me.y);
        ctx.lineTo(me.x, me.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    // Dead ends recede; the paths that still lead to a song carry the ink.
    strokeEdges((n) => n.state === VisitState.Pruned, colors.vermilion, [2, 3], dense ? 0.45 : 0.8);
    strokeEdges((n) => n.state !== VisitState.Pruned && !n.live, colors['ink-3'], [], dense ? 0.35 : 0.6);
    strokeEdges((n) => n.live, colors.leader, [], 1);

    // Matches are punched slots; torn ends get a small cross-cut; a stub whose
    // dead-end subtree was folded trails a short bar sized by what it hides.
    for (const node of to.nodes) {
      const me = next.get(node.id)!;
      if (node.folded > 0 && !node.live) {
        ctx.globalAlpha = me.alpha * 0.5;
        ctx.fillStyle = colors['ink-3'];
        ctx.fillRect(me.x, me.y - 0.75, Math.min(28, 4 + 4 * Math.log2(node.folded + 1)), 1.5);
      }
      ctx.globalAlpha = me.alpha;
      if (node.state === VisitState.Matched) {
        ctx.fillStyle = colors.leader;
        ctx.beginPath();
        ctx.roundRect(me.x - 4, me.y - (dense ? 1.5 : 2.5), 8, dense ? 3 : 5, 1.5);
        ctx.fill();
      } else if (node.state === VisitState.Pruned && !dense) {
        ctx.strokeStyle = colors.vermilion;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(me.x - 2, me.y - 3);
        ctx.lineTo(me.x + 2, me.y + 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Root spindle.
    ctx.fillStyle = colors.hole;
    ctx.beginPath();
    ctx.roundRect(rootX - 5, rootY - 9, 5, 18, 2);
    ctx.fill();

    current.current = next;
  });

  const stats = outcome?.trieStats;
  const engineStats = snap.stats;
  const truncated = outcome && stats ? stats.visited > outcome.trace.node.length : false;

  return (
    <section className="panel area-trie" aria-labelledby="trie-title">
      <div className="panel-head">
        <h2 className="panel-title" id="trie-title">Trie search</h2>
        <span className="panel-meta">
          {stats && engineStats ? (
            <>
              visited <strong>{stats.visited.toLocaleString()}</strong> of {engineStats.trieNodes.toLocaleString()} nodes ·
              pruned <strong>{stats.pruned.toLocaleString()}</strong> · matched <strong>{stats.matched.toLocaleString()}</strong> ·{' '}
              {(outcome!.searchMicros / 1000).toFixed(2)} ms
            </>
          ) : engineStats ? (
            <>
              {engineStats.trieNodes.toLocaleString()} nodes · depth {engineStats.trieDepth}
            </>
          ) : null}
        </span>
      </div>
      <div className="trie" ref={boxRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            stats
              ? `Trie search: ${stats.visited} nodes visited, ${stats.pruned} pruned, ${stats.matched} within the edit budget`
              : 'Trie search, waiting for a query'
          }
        />
        {!layout?.nodes.length && (
          <div className="canvas-empty">
            <div className="canvas-empty-copy">
              {snap.status === 'loading' ? (
                <p className="canvas-empty-title">Building the trie…</p>
              ) : (
                <>
                  <p className="canvas-empty-title">
                    {outcome ? 'No branch stayed within the budget' : 'Every phrase of every song, one branch each'}
                  </p>
                  <p className="canvas-empty-body">
                    {outcome
                      ? 'Nothing in the library is close to that contour. Raise the tolerance or hum a few more notes.'
                      : `${engineStats ? `${engineStats.trieNodes.toLocaleString()} nodes index ${engineStats.songs} songs. ` : ''}Once you have hummed four notes, the branches within the edit budget stay inked and the rest are torn off.`}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="legend">
        <span className="legend-item"><span className="swatch swatch-matched" /> leads to a match</span>
        <span className="legend-item"><span className="swatch swatch-alive" /> within budget, no match below (subtree folded)</span>
        <span className="legend-item"><span className="swatch swatch-pruned" /> pruned: over budget</span>
        {truncated && <span>Showing the first {outcome!.trace.node.length.toLocaleString()} visited nodes.</span>}
      </div>
    </section>
  );
}
