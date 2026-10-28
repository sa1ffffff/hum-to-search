// Parses the library's note notation ("E4/1 D#5/0.5") into MIDI numbers and beats.
// Shared by the build scripts; the app has a typed twin in src/library/notation.ts.

const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TOKEN = /^([A-G])(#|b)?(-?\d)\/(\d+(?:\.\d+)?)$/;

export function parseNotes(text) {
  return text.trim().split(/\s+/).map((token) => {
    const m = TOKEN.exec(token);
    if (!m) throw new Error(`Bad note token "${token}"`);
    const [, letter, accidental, octave, beats] = m;
    const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
    return { midi: (Number(octave) + 1) * 12 + PITCH_CLASS[letter] + shift, beats: Number(beats) };
  });
}
