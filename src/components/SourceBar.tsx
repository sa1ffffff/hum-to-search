import { useRef } from 'react';
import { useAnimationFrame, useSession, useSnapshot } from '../lib/hooks';
import { SONGS } from '../library/songs';
import { Icon } from './Icon';
import { PianoKeys } from './PianoKeys';

export function SourceBar() {
  const session = useSession();
  const snap = useSnapshot();

  return (
    <section
      className="sourcebar"
      id="source-panel"
      role="tabpanel"
      aria-labelledby={`source-tab-${snap.source}`}
    >
      <div className="sourcebar-main">
        {snap.source === 'mic' && (
          <>
            {snap.status === 'listening' ? <LevelMeter /> : null}
            <p className="sourcebar-hint">
              {snap.status === 'listening'
                ? 'Listening. Hum 6 to 12 notes; any key or octave works. Leave a small gap between repeated notes.'
                : 'Hum a tune into your microphone. Off-key is fine: only the ups and downs between notes are searched.'}
            </p>
          </>
        )}

        {snap.source === 'demo' && (
          <>
            <label className="field">
              <span className="field-label">Song</span>
              <select
                className="select"
                value={snap.demoSong ?? ''}
                onChange={(event) => session.setDemoSong(event.target.value === '' ? null : Number(event.target.value))}
              >
                <option value="">Surprise me</option>
                {SONGS.map((song) => (
                  <option key={song.id} value={song.index}>
                    {song.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Sloppiness</span>
              <input
                className="range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={snap.demoSloppiness}
                onChange={(event) => session.setDemoSloppiness(Number(event.target.value))}
              />
              <span className="range-value">{Math.round(snap.demoSloppiness * 100)}%</span>
            </label>
            <p className="sourcebar-hint">
              {snap.status === 'playing' && snap.playingSong !== null
                ? 'Humming in a random key. The engine only hears the audio.'
                : 'A synthetic voice hums the opening in a random key and tempo, through the same pitch detector as the mic.'}
            </p>
          </>
        )}

        {snap.source === 'keys' && (
          <>
            <PianoKeys />
            <p className="sourcebar-hint">
              Exact notes, no pitch detection. Play with the mouse or the keyboard row A to K.
            </p>
          </>
        )}

        {snap.source === 'file' && (
          <p className="sourcebar-hint">
            {snap.fileName
              ? `Analysing "${snap.fileName}" in real time.`
              : 'Analyse a recorded hum (WAV, MP3, OGG, M4A). The first 60 seconds play through the pitch detector.'}
          </p>
        )}

        {snap.inputError && (
          <p className="alert" role="alert">
            <Icon name="alert" />
            {snap.inputError.message}
          </p>
        )}
      </div>

      <label className="field" title="How many edit operations a phrase may need and still match">
        <span className="field-label">Tolerance</span>
        <span>strict</span>
        <input
          className="range"
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={snap.tolerance}
          onChange={(event) => session.setTolerance(Number(event.target.value))}
          disabled={snap.status === 'loading' || snap.status === 'fatal'}
        />
        <span>loose</span>
        <span className="range-value">×{snap.tolerance.toFixed(1)}</span>
      </label>
    </section>
  );
}

const HOLES = 12;

function LevelMeter() {
  const session = useSession();
  const holes = useRef<(HTMLSpanElement | null)[]>([]);
  useAnimationFrame(() => {
    // Log scale: a soft hum around −40 dBFS should light about half the holes.
    const db = 20 * Math.log10(Math.max(session.live.level, 1e-5));
    const lit = Math.round(((db + 60) / 50) * HOLES);
    holes.current.forEach((hole, i) => hole?.setAttribute('data-on', String(i < lit)));
  });
  return (
    <span className="level" aria-hidden="true">
      Level
      <span className="level-holes">
        {Array.from({ length: HOLES }, (_, i) => (
          <span
            key={i}
            className="level-hole"
            ref={(el) => {
              holes.current[i] = el;
            }}
          />
        ))}
      </span>
    </span>
  );
}
