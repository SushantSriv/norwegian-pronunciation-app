/**
 * Cross-origin isolation, supplied by the service worker.
 *
 * WHY THIS EXISTS. ONNX Runtime can only use more than one WASM thread when
 * the page is cross-origin isolated, and a page is only cross-origin isolated
 * if it is served with COOP and COEP response headers. GitHub Pages cannot set
 * response headers at all. Measured in Chromium, on the same machine and the
 * same clip:
 *
 *   1 thread    6.41 s to transcribe   2.85x real time
 *   4 threads   2.96 s to transcribe   1.47x real time
 *
 * So the hosted app was doing the work more than twice as slowly as the dev
 * server, for a reason that had nothing to do with the model — vite.config.ts
 * sets those headers for development, and nothing could set them in production.
 *
 * A service worker can, because it composes the response the browser sees. It
 * adds the two headers to navigations, the page notices it is not yet isolated,
 * reloads once, and from then on the model gets its threads.
 *
 * `credentialless` rather than `require-corp` for the same reason as in
 * vite.config.ts: the model is fetched from the Hugging Face CDN, which sends
 * no CORP header, and require-corp would block it outright.
 *
 * This file is imported into the generated Workbox service worker, so it must
 * be plain JS with no build step, and it must not break offline: the fetch
 * handler below falls back to the precache exactly as the app did before.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/**
 * Which responses need the headers.
 *
 * The document, obviously. But also the speech worker's own script: a page
 * under COEP may only start a dedicated worker whose script came with a
 * compatible COEP header of its own, and without this the browser blocks it
 * with ERR_BLOCKED_BY_RESPONSE — isolation would have made the page faster in
 * theory and killed speech recognition outright in practice.
 *
 * Everything else is left to Workbox, which is what caches it.
 */
const needsHeaders = request =>
    request.mode === 'navigate' || request.destination === 'worker';

const isolated = response => {
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    // Same-origin resources must also declare themselves loadable by an
    // isolated document.
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};

self.addEventListener('fetch', event => {
    if (!needsHeaders(event.request)) return;

    event.respondWith(
        (async () => {
            // The worker script is a hashed, immutable asset that Workbox has
            // already precached, so cache first. The document goes to the
            // network first, as it did before, and falls back to the precached
            // shell — which is what makes this app work on a plane.
            const cacheFirst = event.request.destination === 'worker';

            if (cacheFirst) {
                const cached = await caches.match(event.request, { ignoreSearch: true });
                if (cached) return isolated(cached);
            }

            let response;
            try {
                response = await fetch(event.request);
            } catch {
                response =
                    (await caches.match(event.request, { ignoreSearch: true })) ??
                    (await caches.match('index.html', { ignoreSearch: true }));
                if (!response) throw new Error('offline and nothing cached');
            }

            return isolated(response);
        })()
    );
});
