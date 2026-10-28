import { describe, expect, it } from 'vitest';
import { centsOff, midiToHz, noteName, parseNotes } from './notation';
import { SONGS } from './songs';

describe('parseNotes', () => {
  it('reads pitch, accidentals, octave and beats', () => {
    expect(parseNotes('C4/1 D#5/0.5 Bb3/2')).toEqual([
      { midi: 60, beats: 1 },
      { midi: 75, beats: 0.5 },
      { midi: 58, beats: 2 },
    ]);
  });

  it('rejects malformed tokens', () => {
    expect(() => parseNotes('H4/1')).toThrow(/Bad note token/);
    expect(() => parseNotes('C4')).toThrow(/Bad note token/);
  });
});

describe('note helpers', () => {
  it('names and tunes pitches', () => {
    expect(noteName(69)).toBe('A4');
    expect(noteName(61.4)).toBe('C♯4');
    expect(centsOff(69.25)).toBe(25);
    expect(midiToHz(69)).toBeCloseTo(440);
  });
});

describe('library', () => {
  it('parses every song with unique ids and enough notes to search', () => {
    const ids = new Set(SONGS.map((s) => s.id));
    expect(ids.size).toBe(SONGS.length);
    for (const song of SONGS) {
      expect(song.notes.length, song.title).toBeGreaterThanOrEqual(8);
      expect(song.tempo).toBeGreaterThan(0);
    }
  });
});
