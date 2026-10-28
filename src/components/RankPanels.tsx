import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Candidate, RankingSnapshot } from '../engine/types';
import { useReducedMotion, useSnapshot } from '../lib/hooks';
import { SONGS } from '../library/songs';
import { Icon } from './Icon';

const SLOTS = 24;
const LOCKED = 0.7;
const NARROWING = 0.35;

export function ConfidencePanel() {
  const snap = useSnapshot();
  const outcome = snap.outcome;
  const confidence = outcome?.confidence ?? 0;
  const lead = outcome?.top[0];
  const lit = Math.round(confidence * SLOTS);
  const locked = confidence >= LOCKED && lead !== undefined;

  let word = 'Waiting for notes';
  if (outcome && !lead) word = 'No match yet';
  else if (lead && locked) word = SONGS[lead.song]?.title ?? 'Locked in';
  else if (lead && confidence >= NARROWING) word = 'Narrowing down';
  else if (lead) word = 'Listening';

  return (
    <section className="panel" aria-labelledby="confidence-title">
      <div className="panel-head">
        <h2 className="panel-title" id="confidence-title">Confidence</h2>
        <span className="panel-meta">{locked ? 'locked in' : 'score gap between first and second'}</span>
      </div>
      <div className="confidence-state">
        <p className="confidence-word" aria-live="polite">{word}</p>
        <span className="confidence-number">{Math.round(confidence * 100)}%</span>
      </div>
      <div
        className="meter"
        data-locked={locked}
        role="meter"
        aria-label="Match confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(confidence * 100)}
      >
        {Array.from({ length: SLOTS }, (_, i) => (
          <span key={i} className="meter-slot" data-on={i < lit} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
      <div className="meter-scale" aria-hidden="true">
        <span>listening</span>
        <span>narrowing</span>
        <span>locked in</span>
      </div>
    </section>
  );
}

export function LeaderboardPanel() {
  const snap = useSnapshot();
  const reduced = useReducedMotion();
  const outcome = snap.outcome;
  const top = outcome?.top ?? [];
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const lastRects = useRef(new Map<number, number>());

  // FLIP: rows that change rank slide from their old position to the new one.
  useLayoutEffect(() => {
    const rects = new Map<number, number>();
    for (const [song, el] of rowRefs.current) rects.set(song, el.getBoundingClientRect().top);
    if (!reduced) {
      for (const [song, el] of rowRefs.current) {
        const before = lastRects.current.get(song);
        const after = rects.get(song);
        if (before === undefined || after === undefined || before === after) continue;
        el.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'translateY(0)' }], {
          duration: 260,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        });
      }
    }
    lastRects.current = rects;
  }, [outcome, reduced]);

  return (
    <section className="panel" aria-labelledby="board-title">
      <div className="panel-head">
        <h2 className="panel-title" id="board-title">Leaderboard</h2>
        <span className="panel-meta">
          {outcome ? (
            <>
              <strong>{outcome.candidateCount}</strong> {outcome.candidateCount === 1 ? 'candidate' : 'candidates'} in the tree
            </>
          ) : (
            'top 5'
          )}
        </span>
      </div>
      {top.length === 0 ? (
        <p className="board-empty">
          {outcome
            ? 'No song is within the edit budget for this contour. Keep humming, or raise the tolerance.'
            : 'Candidates appear after four notes. The red-black tree keeps them ranked as every new note changes their scores.'}
        </p>
      ) : (
        <ol className="board" aria-live="polite">
          {top.map((candidate, rank) => (
            <BoardRow
              key={candidate.song}
              candidate={candidate}
              rank={rank}
              previousRank={snap.previousTop.indexOf(candidate.song)}
              refCallback={(el) => {
                if (el) rowRefs.current.set(candidate.song, el);
                else rowRefs.current.delete(candidate.song);
              }}
            />
          ))}
        </ol>
      )}
      {outcome && top.length > 0 && (
        <p className="board-foot">
          Score blends the contour edit distance with how closely each interval's size matches.
        </p>
      )}
    </section>
  );
}

function BoardRow({
  candidate,
  rank,
  previousRank,
  refCallback,
}: {
  candidate: Candidate;
  rank: number;
  previousRank: number;
  refCallback: (el: HTMLLIElement | null) => void;
}) {
  const song = SONGS[candidate.song];
  const moved = previousRank === -1 ? 'new' : previousRank > rank ? 'up' : previousRank < rank ? 'down' : 'same';
  const edits = candidate.distance / 2;
  return (
    <li className="board-row" ref={refCallback} data-lead={rank === 0}>
      <span className="board-rank" aria-label={`Rank ${rank + 1}`}>{rank + 1}</span>
      <span className="board-title">{song?.title ?? `Song ${candidate.song}`}</span>
      <span className="board-meta">
        {song?.composer} · from note {candidate.offset + 1} · {edits === 0 ? 'exact contour' : `${edits} ${edits === 1 ? 'edit' : 'edits'}`}
      </span>
      <span className="board-score">
        {(candidate.score * 100).toFixed(1)}
        <span className="board-move" data-dir={moved}>
          {moved === 'up' && <><Icon name="up" size={12} /> {previousRank - rank}</>}
          {moved === 'down' && <><Icon name="down" size={12} /> {rank - previousRank}</>}
          {moved === 'new' && 'new'}
        </span>
      </span>
      <span className="board-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${candidate.score})` }} />
      </span>
    </li>
  );
}

interface PlacedNode {
  song: number;
  score: number;
  red: boolean;
  x: number;
  y: number;
  rank: number;
  parent: { x: number; y: number } | null;
}

function placeTree(snapshot: RankingSnapshot, width: number, height: number): PlacedNode[] {
  const placed: PlacedNode[] = [];
  const nodes = snapshot.nodes;
  if (!nodes.length) return placed;
  const levels = Math.max(snapshot.height, 1);
  const rowGap = levels > 1 ? (height - 28) / (levels - 1) : 0;
  const colGap = width / nodes.length;
  let order = 0;

  // In-order position gives x (and the rank); depth gives y.
  const walk = (index: number, depth: number, parent: { x: number; y: number } | null) => {
    const node = nodes[index];
    if (!node) return;
    const self: PlacedNode = { song: node.song, score: node.score, red: node.red, x: 0, y: 14 + depth * rowGap, rank: 0, parent };
    if (node.left >= 0) walk(node.left, depth + 1, self);
    self.rank = order;
    self.x = colGap * (order + 0.5);
    order++;
    placed.push(self);
    if (node.right >= 0) walk(node.right, depth + 1, self);
  };
  walk(0, 0, null);
  return placed;
}

const TREE_W = 360;
const TREE_H = 190;

export function RankingTreePanel() {
  const snap = useSnapshot();
  const ranking = snap.ranking;
  const placed = useMemo(() => (ranking ? placeTree(ranking, TREE_W, TREE_H) : []), [ranking]);
  const radius = placed.length > 24 ? 5 : placed.length > 12 ? 8 : 12;
  const stats = snap.outcome?.rankStats;
  const lead = snap.outcome?.top[0]?.song;

  return (
    <section className="panel" aria-labelledby="rbt-title">
      <div className="panel-head">
        <h2 className="panel-title" id="rbt-title">Red-black tree</h2>
        <span className="panel-meta">keyed by score, best on the left</span>
      </div>
      {placed.length === 0 ? (
        <p className="board-empty">
          Each candidate becomes a node keyed by its score. When a score changes, its node is erased and reinserted,
          and the tree rebalances with rotations and recolouring in O(log n).
        </p>
      ) : (
        <svg className="rbt" viewBox={`0 0 ${TREE_W} ${TREE_H + 20}`} role="img" aria-label={`Red-black tree with ${placed.length} candidates, height ${ranking?.height}`}>
          {placed.map((node) =>
            node.parent ? (
              <line key={`e${node.song}`} className="rbt-edge" x1={node.parent.x} y1={node.parent.y} x2={node.x} y2={node.y} />
            ) : null,
          )}
          {placed.map((node) => (
            <g
              key={node.song}
              className="rbt-node"
              data-red={node.red}
              data-lead={node.song === lead}
              style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
            >
              <title>
                {`${SONGS[node.song]?.title ?? node.song}: score ${(node.score * 100).toFixed(1)}, ${node.red ? 'red' : 'black'}`}
              </title>
              <circle r={radius} />
              {radius >= 8 && <text>{node.rank + 1}</text>}
            </g>
          ))}
        </svg>
      )}
      <div className="rbt-stats">
        <div>
          <span className="stat-label">nodes</span>
          <span className="stat-value">{ranking?.size ?? 0}</span>
        </div>
        <div>
          <span className="stat-label">height</span>
          <span className="stat-value">{ranking?.height ?? 0}</span>
        </div>
        <div>
          <span className="stat-label">black height</span>
          <span className="stat-value">{ranking && ranking.size > 0 ? ranking.blackHeight - 1 : 0}</span>
        </div>
        <div>
          <span className="stat-label">rotations</span>
          <span className="stat-value">{stats?.rotations ?? 0}</span>
        </div>
      </div>
      {stats && (
        <p className="rbt-note">
          Last note: {stats.inserts} {stats.inserts === 1 ? 'insert' : 'inserts'}, {stats.erases}{' '}
          {stats.erases === 1 ? 'erase' : 'erases'}, {stats.recolors} {stats.recolors === 1 ? 'recolour' : 'recolours'}.
          Numbers in nodes are ranks.
        </p>
      )}
    </section>
  );
}
