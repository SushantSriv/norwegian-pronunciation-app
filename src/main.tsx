import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ensureIsolation } from './utils/isolation';

// Before anything else: on a host that cannot send COOP/COEP, this reloads
// once so the service worker can supply them. That is what lets the speech
// model use more than one WASM thread, which more than halves how long a
// learner waits after speaking.
ensureIsolation();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
