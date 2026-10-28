import { useEffect, useState } from 'react';
import { useSession } from '../lib/hooks';
import { noteName } from '../library/notation';

// Computer keys laid out like a piano: home row = white keys, row above = black.
const KEY_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};
const LETTERS = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k.toUpperCase()]));
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK = [1, 3, 6, 8, 10];
const WHITE_WIDTH = 34;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
}

export function PianoKeys() {
  const session = useSession();
  const [octave, setOctave] = useState(4);
  const [down, setDown] = useState<Set<number>>(() => new Set());
  const base = (octave + 1) * 12;

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z') setOctave((o) => Math.max(2, o - 1));
      else if (key === 'x') setOctave((o) => Math.min(6, o + 1));
      const offset = KEY_MAP[key];
      if (offset === undefined) return;
      event.preventDefault();
      session.pressKey(base + offset);
      setDown((prev) => new Set(prev).add(offset));
    };
    const onUp = (event: KeyboardEvent) => {
      const offset = KEY_MAP[event.key.toLowerCase()];
      if (offset === undefined) return;
      setDown((prev) => {
        const next = new Set(prev);
        next.delete(offset);
        return next;
      });
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [session, base]);

  const press = (offset: number) => session.pressKey(base + offset);

  return (
    <div className="keys">
      <div className="keys-board" role="group" aria-label={`Piano, octave ${octave}`} style={{ width: WHITE.length * (WHITE_WIDTH - 1) + 1 }}>
        {WHITE.map((offset) => (
          <button
            key={offset}
            type="button"
            className="key key-white"
            data-down={down.has(offset)}
            aria-label={noteName(base + offset)}
            onPointerDown={(event) => {
              event.preventDefault();
              press(offset);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                press(offset);
              }
            }}
          >
            {LETTERS[offset]}
          </button>
        ))}
        {BLACK.map((offset) => {
          const whiteIndex = WHITE.filter((w) => w < offset).length;
          return (
            <button
              key={offset}
              type="button"
              className="key key-black"
              data-down={down.has(offset)}
              aria-label={noteName(base + offset)}
              style={{ left: whiteIndex * (WHITE_WIDTH - 1) - 11 }}
              onPointerDown={(event) => {
                event.preventDefault();
                press(offset);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  press(offset);
                }
              }}
            >
              {LETTERS[offset]}
            </button>
          );
        })}
      </div>
      <div className="keys-octave">
        <span className="field-label">Octave {octave}</span>
        <div className="keys-octave-buttons">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOctave((o) => Math.max(2, o - 1))} aria-label="Octave down (Z)">
            Z −
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOctave((o) => Math.min(6, o + 1))} aria-label="Octave up (X)">
            X +
          </button>
        </div>
      </div>
    </div>
  );
}
