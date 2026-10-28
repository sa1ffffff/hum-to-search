import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SessionContext } from './lib/hooks';
import { Session } from './session/session';

// One session for the page's lifetime; it owns the audio graph and the engine.
// It is not disposed on pagehide, so a page restored from the back/forward
// cache keeps working; the browser releases audio and WASM memory on unload.
const session = new Session();
import.meta.hot?.dispose(() => session.dispose());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionContext.Provider value={session}>
      <App />
    </SessionContext.Provider>
  </StrictMode>,
);
