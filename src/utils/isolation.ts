/**
 * Getting the page cross-origin isolated, once, on hosts that cannot do it.
 *
 * The service worker in public/coi.js adds the COOP and COEP headers that
 * GitHub Pages cannot, but a document only gets those headers if the service
 * worker was already controlling the page when it was fetched. On a first
 * visit it is not, so the page has to come back once — after which the model
 * gets its WASM threads and transcription runs better than twice as fast.
 *
 * The whole risk here is a reload loop, so the guard is deliberately blunt: at
 * most one reload per tab, recorded before reloading, and nothing at all if
 * isolation is already in place or service workers are unavailable.
 */

const ONCE_KEY = 'npa-isolation-reload';

const alreadyTried = (): boolean => {
    try {
        return window.sessionStorage.getItem(ONCE_KEY) !== null;
    } catch {
        // No sessionStorage means no way to remember, and no way to be sure we
        // would not loop. Leave the page alone.
        return true;
    }
};

const remember = (): void => {
    try {
        window.sessionStorage.setItem(ONCE_KEY, '1');
    } catch {
        // Unreachable in practice: alreadyTried() has just succeeded.
    }
};

/**
 * Reload once, if that is what it takes to unlock the model's threads.
 *
 * A no-op when the page is already isolated — which is the case on the dev
 * server, where vite sends the headers itself.
 */
export function ensureIsolation(): void {
    if (typeof window === 'undefined') return;
    if (window.crossOriginIsolated) return;
    if (!('serviceWorker' in navigator)) return;
    if (alreadyTried()) return;

    const reload = () => {
        if (window.crossOriginIsolated) return;
        remember();
        window.location.reload();
    };

    // Controlled already: the headers should have been there, so a reload is
    // the thing that will produce them.
    if (navigator.serviceWorker.controller) {
        reload();
        return;
    }

    // Otherwise wait for the worker to take over, which it does on activation.
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
}
