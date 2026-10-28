import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession, useSnapshot } from '../lib/hooks';
import { SONGS } from '../library/songs';
import { Icon } from './Icon';

export function LibraryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const snap = useSnapshot();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const contours = useMemo(() => {
    // Same U/D/S encoding the engine indexes; computed here so the list
    // renders before the WASM module has loaded.
    return SONGS.map((song) =>
      song.notes
        .slice(1)
        .map((note, i) => {
          const delta = note.midi - (song.notes[i]?.midi ?? note.midi);
          return delta > 0 ? 'U' : delta < 0 ? 'D' : 'S';
        })
        .join(''),
    );
  }, []);

  const query = filter.trim().toLowerCase();
  const visible = SONGS.filter(
    (song) => !query || song.title.toLowerCase().includes(query) || song.composer.toLowerCase().includes(query),
  );
  const ready = snap.status !== 'loading' && snap.status !== 'fatal';

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby="library-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="drawer-head">
        <div>
          <h2 className="drawer-title" id="library-title">Song library</h2>
          <p className="drawer-sub">
            {SONGS.length} public-domain melodies, opening phrases
            {snap.stats ? ` · ${snap.stats.triePostings.toLocaleString()} trie postings` : ''}
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close library">
          <Icon name="close" />
        </button>
      </div>
      <div className="drawer-search">
        <input
          className="input"
          type="search"
          placeholder="Filter by title or composer"
          aria-label="Filter songs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <ul className="song-list">
        {visible.map((song) => (
          <li key={song.id} className="song">
            <span className="song-title">{song.title}</span>
            <span className="song-meta">
              {song.composer} · {song.year} · {song.notes.length} notes
            </span>
            <span className="song-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!ready}
                onClick={() => {
                  session.setSource('demo');
                  session.setDemoSong(song.index);
                  onClose();
                  void session.playDemo(song.index);
                }}
              >
                <Icon name="play" size={16} />
                Hum it
              </button>
            </span>
            <span className="song-code" title="Contour indexed in the trie">{contours[song.index]}</span>
          </li>
        ))}
        {visible.length === 0 && <li className="song-list-empty">No song matches "{filter}".</li>}
      </ul>
    </dialog>
  );
}
