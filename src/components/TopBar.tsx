import { useRef } from 'react';
import { useSession, useSnapshot } from '../lib/hooks';
import type { Source } from '../session/session';
import { Icon, Mark, type IconName } from './Icon';

const SOURCES: { id: Source; label: string; icon: IconName }[] = [
  { id: 'mic', label: 'Microphone', icon: 'mic' },
  { id: 'demo', label: 'Demo hum', icon: 'hum' },
  { id: 'keys', label: 'Keys', icon: 'keys' },
  { id: 'file', label: 'Recording', icon: 'file' },
];

export function TopBar({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const session = useSession();
  const snap = useSnapshot();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const ready = snap.status !== 'loading' && snap.status !== 'fatal';

  const onTabKey = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + SOURCES.length) % SOURCES.length;
    const source = SOURCES[next];
    if (!source) return;
    session.setSource(source.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <header className="topbar">
      <div className="brand">
        <Mark />
        <div>
          <h1 className="brand-name">Hum-to-Search</h1>
          <p className="brand-course">Trie and red-black tree melody search</p>
        </div>
      </div>

      <div className="source-switch" role="tablist" aria-label="Input source">
        {SOURCES.map((source, index) => (
          <button
            key={source.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`source-tab-${source.id}`}
            aria-controls="source-panel"
            aria-selected={snap.source === source.id}
            tabIndex={snap.source === source.id ? 0 : -1}
            className="source-tab"
            onClick={() => session.setSource(source.id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            <Icon name={source.icon} />
            {source.label}
          </button>
        ))}
      </div>

      <div className="topbar-actions">
        <PrimaryAction ready={ready} />
        <button
          type="button"
          className="btn btn-ghost-dark"
          onClick={() => session.reset()}
          disabled={!ready || (snap.notes.length === 0 && !session.isActive())}
          title="Clear the query and the leaderboard (N)"
          aria-label="New search"
        >
          <Icon name="reset" />
          <span className="label-wide">New search</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost-dark"
          onClick={onOpenLibrary}
          title="Browse the song library (L)"
          aria-label={`Library, ${snap.stats?.songs ?? ''} songs`}
          aria-haspopup="dialog"
        >
          <Icon name="library" />
          <span className="label-wide">Library</span>
          {snap.stats && <span className="mono">{snap.stats.songs}</span>}
        </button>
      </div>
    </header>
  );
}

function PrimaryAction({ ready }: { ready: boolean }) {
  const session = useSession();
  const snap = useSnapshot();
  const active = snap.status === 'listening' || snap.status === 'playing';

  if (active) {
    return (
      <button type="button" className="btn btn-stop" onClick={() => session.stop()}>
        <Icon name="stop" />
        Stop <span className="kbd">Space</span>
      </button>
    );
  }

  switch (snap.source) {
    case 'mic':
      return (
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void session.startMicrophone()}>
          <Icon name="mic" />
          Start listening <span className="kbd">Space</span>
        </button>
      );
    case 'demo':
      return (
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void session.playDemo()}>
          <Icon name="play" />
          Play demo hum <span className="kbd">Space</span>
        </button>
      );
    case 'file':
      return (
        <label className={`btn btn-primary file-pick${ready ? '' : ' is-disabled'}`}>
          <Icon name="file" />
          Choose recording
          <input
            className="file-input"
            type="file"
            accept="audio/*"
            disabled={!ready}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void session.analyzeFile(file);
              event.target.value = '';
            }}
          />
        </label>
      );
    case 'keys':
      return null;
  }
}
