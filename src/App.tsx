import { useEffect, useState } from 'react';
import { LibraryDrawer } from './components/LibraryDrawer';
import { ConfidencePanel, LeaderboardPanel, RankingTreePanel } from './components/RankPanels';
import { RollPanel } from './components/RollPanel';
import { SourceBar } from './components/SourceBar';
import { TopBar } from './components/TopBar';
import { TriePanel } from './components/TriePanel';
import { useSession, useSnapshot } from './lib/hooks';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName));
}

export function App() {
  const session = useSession();
  const snap = useSnapshot();
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Space starts or stops, N clears, L opens the library.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || libraryOpen) return;
      if (event.key === ' ' && !isTyping(event.target)) {
        event.preventDefault();
        if (session.isActive()) session.stop();
        else if (snap.source === 'mic') void session.startMicrophone();
        else if (snap.source === 'demo') void session.playDemo();
        return;
      }
      if (isTyping(event.target) || snap.source === 'keys') return;
      if (event.key === 'n' || event.key === 'N') session.reset();
      if (event.key === 'l' || event.key === 'L') setLibraryOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, snap.source, libraryOpen]);

  if (snap.status === 'fatal') {
    return (
      <div className="app">
        <main className="fatal">
          <h1 className="confidence-word">The search engine did not load</h1>
          <p>{snap.fatalError}</p>
          <p>This app needs WebAssembly. Reload the page, or try a current version of Chrome, Edge, Firefox or Safari.</p>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar onOpenLibrary={() => setLibraryOpen(true)} />
      <SourceBar />
      <main className="workspace">
        <RollPanel />
        <TriePanel />
        <aside className="area-rank" aria-label="Ranking">
          <ConfidencePanel />
          <LeaderboardPanel />
          <RankingTreePanel />
        </aside>
      </main>
      <LibraryDrawer open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </div>
  );
}
