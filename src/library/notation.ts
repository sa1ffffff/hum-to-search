// The library's note notation: "E4/1 D#5/0.5" = pitch name + octave, then beats.

export interface LibraryNote {
  midi: number;
  beats: number;
}

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TOKEN = /^([A-G])(#|b)?(-?\d)\/(\d+(?:\.\d+)?)$/;
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function parseNotes(text: string): LibraryNote[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => {
      const match = TOKEN.exec(token);
      if (!match) throw new Error(`Bad note token "${token}"`);
      const [, letter, accidental, octave, beats] = match as unknown as [string, string, string | undefined, string, string];
      const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
      return { midi: (Number(octave) + 1) * 12 + (PITCH_CLASS[letter] ?? 0) + shift, beats: Number(beats) };
    });
}

/** "A♯3" for 58; fractional input is rounded to the nearest semitone. */
export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NAMES[((rounded % 12) + 12) % 12] ?? '?';
  return `${name}${Math.floor(rounded / 12) - 1}`;
}

/** Cents away from the nearest equal-tempered pitch, −50…+50. */
export function centsOff(midi: number): number {
  return Math.round((midi - Math.round(midi)) * 100);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
