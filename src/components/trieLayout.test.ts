import { describe, expect, it } from 'vitest';
import { VisitState, type TrieTrace } from '../engine/types';
import { layoutTrace } from './trieLayout';

function trace(rows: [node: number, parent: number, depth: number, state: number][]): TrieTrace {
  return {
    node: Int32Array.from(rows.map((r) => r[0])),
    parent: Int32Array.from(rows.map((r) => r[1])),
    step: new Uint8Array(rows.length),
    depth: Uint8Array.from(rows.map((r) => r[2])),
    best: new Uint8Array(rows.length),
    state: Uint8Array.from(rows.map((r) => r[3])),
  };
}

describe('layoutTrace', () => {
  // root ─ 1 ─ 2 (matched)
  //          └ 3 (pruned)
  //      └ 4 (alive leaf)
  const layout = layoutTrace(
    trace([
      [1, 0, 1, VisitState.Alive],
      [2, 1, 2, VisitState.Matched],
      [3, 1, 2, VisitState.Pruned],
      [4, 0, 1, VisitState.Alive],
    ]),
  );

  it('marks ancestors of a match as live', () => {
    expect(layout.byId.get(1)?.live).toBe(true);
    expect(layout.byId.get(4)?.live).toBe(false);
  });

  it('keeps leaves in depth-first order and centres parents on their children', () => {
    const y = (id: number) => layout.byId.get(id)!.y;
    expect(y(2)).toBeLessThan(y(3));
    expect(y(3)).toBeLessThan(y(4));
    expect(y(1)).toBeCloseTo((y(2) + y(3)) / 2);
    expect(layout.maxDepth).toBe(2);
  });

  it('gives live leaves more room than dead ends', () => {
    expect(layout.totalWeight).toBeCloseTo(1 + 0.3 + 0.5);
  });

  it('folds dead-end subtrees into the stub that leaves a live path', () => {
    const folded = layoutTrace(
      trace([
        [1, 0, 1, VisitState.Matched],
        [2, 0, 1, VisitState.Alive], // stub off the root
        [3, 2, 2, VisitState.Alive], // folded into 2
        [4, 3, 3, VisitState.Pruned], // folded into 2
      ]),
    );
    expect(folded.nodes.map((n) => n.id)).toEqual([1, 2]);
    expect(folded.byId.get(2)?.folded).toBe(2);
  });

  it('handles an empty trace', () => {
    const empty = layoutTrace(trace([]));
    expect(empty.nodes).toHaveLength(0);
    expect(empty.totalWeight).toBe(1);
  });
});
