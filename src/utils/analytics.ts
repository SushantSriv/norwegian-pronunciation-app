/**
 * Optional, privacy-respecting page counting.
 *
 * Disabled unless VITE_ANALYTICS_URL is set at build time, so the app ships with
 * NO tracking by default and nothing is sent from a self-hosted copy unless the
 * operator opts in. Designed for a cookie-less counter such as GoatCounter or
 * Plausible: no cookies are set, no identifiers are stored, and no personal data
 * (and never any audio or transcript) leaves the browser.
 */
const ENDPOINT = import.meta.env.VITE_ANALYTICS_URL;

export function countVisit() {
    if (!ENDPOINT) return;
    // Respect an explicit Do Not Track signal.
    if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return;

    try {
        const url = new URL(ENDPOINT);
        url.searchParams.set('p', window.location.pathname);
        url.searchParams.set('r', document.referrer || '');
        // A plain image request keeps this dependency-free and blockable.
        const beacon = new Image();
        beacon.referrerPolicy = 'no-referrer';
        beacon.src = url.toString();
    } catch {
        // A malformed endpoint should never break the app.
    }
}
