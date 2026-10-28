import { VisitState, type TrieTrace } from '../engine/types';

export interface LaidOutNode {
  id: number;
  parentId: number; // 0 = trie root
  depth: number;
  state: number;
  /** True when this node or a descendant matched: the branch is still alive. */
  live: boolean;
  /** Visited nodes folded into this one (dead-end subtree below a stub). */
  folded: number;
  /** Vertical position in leaf units, 0…totalWeight. */
  y: number;
}

export interface TrieLayout {
  nodes: LaidOutNode[];
  byId: Map<number, LaidOutNode>;
  totalWeight: number;
  maxDepth: number;
  rootY: number;
}

// Room per leaf: branches that reach a match get the most, dead ends less,
// and pruned stubs least, so the surviving paths stay legible.
const WEIGHT = { live: 1, alive: 0.5, pruned: 0.3 };

/**
 * Tidy layout of the visited part of the trie.
 *
 * Every path that reaches a match is drawn in full. A branch that leaves such a
 * path without reaching a match is drawn as a single stub and its subtree is
 * folded into it: those nodes were still visited, and are counted in the stats,
 * but drawing each of them would bury the surviving paths.
 *
 * The trace arrives in depth-first pre-order, so leaves already appear top to
 * bottom in drawing order: each leaf takes the next slot and each parent sits
 * midway between its first and last child. Linear passes, O(V).
 */
export function layoutTrace(trace: TrieTrace): TrieLayout {
  const count = trace.node.length;
  const all: LaidOutNode[] = new Array(count);
  const indexOf = new Map<number, number>();

  for (let i = 0; i < count; i++) {
    const id = trace.node[i]!;
    all[i] = {
      id,
      parentId: trace.parent[i]!,
      depth: trace.depth[i]!,
      state: trace.state[i]!,
      live: trace.state[i] === VisitState.Matched,
      folded: 0,
      y: 0,
    };
    indexOf.set(id, i);
  }

  // A node is live if it or any descendant matched (children follow parents).
  for (let i = count - 1; i >= 0; i--) {
    const node = all[i]!;
    const p = indexOf.get(node.parentId);
    if (p !== undefined && node.live) all[p]!.live = true;
  }

  // Keep live nodes and the first step off a live path (the root counts as live).
  // Everything deeper in a dead branch is folded into that first step.
  const keep = new Uint8Array(count);
  const stubOf = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const node = all[i]!;
    const p = indexOf.get(node.parentId);
    const parentLive = p === undefined || all[p]!.live;
    if (node.live || parentLive) {
      keep[i] = 1;
    } else if (p !== undefined) {
      const stub = keep[p] ? p : stubOf[p]!;
      stubOf[i] = stub;
      if (stub >= 0) all[stub]!.folded++;
    }
  }

  const nodes: LaidOutNode[] = [];
  const keptIndex = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    if (!keep[i]) continue;
    keptIndex.set(all[i]!.id, nodes.length);
    nodes.push(all[i]!);
  }

  const hasChild = new Uint8Array(nodes.length);
  let maxDepth = 1;
  for (const node of nodes) {
    const p = keptIndex.get(node.parentId);
    if (p !== undefined) hasChild[p] = 1;
    if (node.depth > maxDepth) maxDepth = node.depth;
  }

  // Leaves take consecutive slots in pre-order.
  let cursor = 0;
  nodes.forEach((node, i) => {
    if (hasChild[i]) return;
    const weight = node.state === VisitState.Pruned ? WEIGHT.pruned : node.live ? WEIGHT.live : WEIGHT.alive;
    node.y = cursor + weight / 2;
    cursor += weight;
  });

  // Parents sit midway between their first and last child.
  const minY = new Float64Array(nodes.length).fill(Infinity);
  const maxY = new Float64Array(nodes.length).fill(-Infinity);
  let rootMin = Infinity;
  let rootMax = -Infinity;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    if (hasChild[i]) node.y = (minY[i]! + maxY[i]!) / 2;
    const p = keptIndex.get(node.parentId);
    if (p === undefined) {
      rootMin = Math.min(rootMin, node.y);
      rootMax = Math.max(rootMax, node.y);
      continue;
    }
    minY[p] = Math.min(minY[p]!, node.y);
    maxY[p] = Math.max(maxY[p]!, node.y);
  }

  return {
    nodes,
    byId: new Map(nodes.map((n) => [n.id, n])),
    totalWeight: Math.max(cursor, 1),
    maxDepth,
    rootY: Number.isFinite(rootMin) ? (rootMin + rootMax) / 2 : cursor / 2,
  };
}
