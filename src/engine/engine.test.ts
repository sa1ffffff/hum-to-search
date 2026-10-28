// Runs the compiled WebAssembly engine under Node: checks the JS boundary the
// app depends on (field names, typed arrays, ordering), not just the C++.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createEngineModule from './generated/hts.mjs';
import { SONGS } from '../library/songs';
import type { NativeEngine } from './types';

let engine: NativeEngine;

beforeAll(async () => {
  const wasmBinary = readFileSync(fileURLToPath(new URL('./generated/hts.wasm', import.meta.url)));
  const module = await createEngineModule({ wasmBinary });
  engine = new module.Engine();
  for (const song of SONGS) engine.addSong(song.title, song.composer, song.notes.map((n) => n.midi));
});

afterAll(() => engine.delete());

function hum(songIndex: number, transpose: number, count = 10) {
  engine.reset();
  const notes = SONGS[songIndex]!.notes.slice(0, count);
  notes.forEach((note, i) => engine.pushNote(note.midi + transpose, i * 300, 280));
  return engine.outcome();
}

describe('wasm engine', () => {
  it('indexes the whole library', () => {
    const stats = engine.stats();
    expect(stats.songs).toBe(SONGS.length);
    expect(stats.trieNodes).toBeGreaterThan(1000);
    expect(engine.songContour(0)).toMatch(/^[UDS]+$/);
  });

  it('finds songs hummed in another key', () => {
    for (const index of [0, 3, 10, 20, 30]) {
      const outcome = hum(index, -4);
      expect(outcome.top[0]?.song, SONGS[index]!.title).toBe(index);
    }
  });

  it('returns a well-formed outcome', () => {
    const outcome = hum(0, 5);
    expect(outcome.query).toHaveLength(9);
    expect(outcome.budget).toBeGreaterThan(0);
    expect(outcome.confidence).toBeGreaterThan(0);
    expect(outcome.confidence).toBeLessThanOrEqual(1);
    const scores = outcome.top.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const { trace, trieStats } = outcome;
    expect(trace.node).toBeInstanceOf(Int32Array);
    expect(trace.node.length).toBe(trieStats.visited);
    expect(new Set([trace.node.length, trace.parent.length, trace.depth.length, trace.state.length]).size).toBe(1);
  });

  it('keeps the red-black tree valid and in rank order', () => {
    hum(7, 2, 14);
    const ranking = engine.rankingSnapshot();
    expect(ranking.size).toBeGreaterThan(0);
    expect(ranking.blackHeight).toBeGreaterThan(0); // −1 would mean a broken invariant
    expect(ranking.nodes[0]?.red).toBe(false);
    expect(ranking.height).toBeLessThanOrEqual(2 * Math.log2(ranking.size + 1));
  });

  it('detects pitch from raw audio frames', () => {
    engine.reset();
    const sr = 24000;
    const frame = new Float32Array(1024);
    const hz = 220;
    for (let i = 0; i < frame.length; i++) frame[i] = 0.3 * Math.sin((2 * Math.PI * hz * i) / sr);
    const report = engine.pushFrame(frame, sr, 0);
    expect(report.voiced).toBe(true);
    expect(report.midi).toBeCloseTo(57, 1);
  });

  it('resets cleanly', () => {
    hum(1, 0);
    engine.reset();
    expect(engine.notes()).toHaveLength(0);
    expect(engine.outcome().top).toHaveLength(0);
    expect(engine.rankingSnapshot().size).toBe(0);
  });
});
