// Shapes returned by the WebAssembly engine (see engine/bindings/wasm.cpp).

export type StepChar = 'U' | 'D' | 'S';

export interface FrameReport {
  hz: number;
  clarity: number;
  rms: number;
  voiced: boolean;
  midi: number;
  activeMidi: number;
  noteCompleted: boolean;
  searched: boolean;
}

export interface EngineNote {
  midi: number;
  startMs: number;
  durationMs: number;
}

export interface Candidate {
  song: number;
  score: number;
  contourScore: number;
  intervalScore: number;
  /** Trie edit distance in half-units (a step flattened to "same" costs 1). */
  distance: number;
  offset: number;
  length: number;
}

/** Visited trie nodes in depth-first order, as parallel arrays. */
export interface TrieTrace {
  node: Int32Array;
  parent: Int32Array;
  step: Uint8Array;
  depth: Uint8Array;
  best: Uint8Array;
  state: Uint8Array;
}

export const VisitState = { Alive: 0, Pruned: 1, Matched: 2 } as const;
export const StepCode = { Down: 0, Same: 1, Up: 2 } as const;

export interface SearchOutcome {
  version: number;
  query: string;
  querySemitones: Float32Array;
  budget: number;
  candidateCount: number;
  confidence: number;
  searchMicros: number;
  top: Candidate[];
  trieStats: { visited: number; pruned: number; matched: number };
  rankStats: { inserts: number; erases: number; rotations: number; recolors: number; unchanged: number };
  trace: TrieTrace;
}

export interface RankingNode {
  song: number;
  score: number;
  red: boolean;
  left: number;
  right: number;
}

export interface RankingSnapshot {
  nodes: RankingNode[];
  height: number;
  blackHeight: number;
  size: number;
}

export interface EngineStats {
  songs: number;
  trieNodes: number;
  triePostings: number;
  trieDepth: number;
  queryWindow: number;
  minQuerySteps: number;
}

/** The Embind class. Call delete() when done; it owns WASM memory. */
export interface NativeEngine {
  addSong(title: string, composer: string, midi: number[]): number;
  pushFrame(samples: Float32Array, sampleRate: number, timeMs: number): FrameReport;
  pushNote(midi: number, startMs: number, durationMs: number): boolean;
  endInput(): boolean;
  /** Re-runs the search over the current notes (after a tolerance change). */
  research(): void;
  reset(): void;
  setTolerance(tolerance: number): void;
  tolerance(): number;
  budgetFor(steps: number): number;
  notes(): EngineNote[];
  outcome(): SearchOutcome;
  rankingSnapshot(): RankingSnapshot;
  stats(): EngineStats;
  songContour(id: number): string;
  delete(): void;
}

export interface EngineModule {
  Engine: new () => NativeEngine;
}
