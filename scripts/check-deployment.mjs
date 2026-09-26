/**
 * Check a deployed copy of the app, from a real browser.
 *
 *   npm run check:deploy -- https://norskuttale.no
 *   npm run check:deploy                              # the GitHub Pages copy
 *
 * Written for the moment a domain changes, because that is when the things
 * nobody thinks to check break: the base path, the service worker's scope, the
 * icons, the link previews. Every one of those fails silently — the page still
 * renders and looks perfectly fine.
 *
 * Exits non-zero if anything is wrong, so CI can run it too.
 */
import { chromium } from 'playwright';

const TARGET = process.argv[2] ?? 'https://sushantsriv.github.io/norwegian-pronunciation-app/';
const url = TARGET.endsWith('/') ? TARGET : TARGET + '/';

const problems = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    if (!ok) problems.push(name);
};

console.log(`Checking ${url}\n`);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => message.type() === 'error' && errors.push(message.text()));

const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
check('the site responds', response?.ok() === true, `HTTP ${response?.status()}`);

// Assets resolve. A wrong base path leaves the HTML fine and everything else 404.
const assetFailures = [];
page.on('response', r => {
    if (r.url().startsWith(url) && r.status() >= 400) assetFailures.push(`${r.status()} ${r.url()}`);
});

// Recognition is the browser's own speech service now, so a secure context is
// not a nicety: getUserMedia refuses to run without one, and the microphone
// button would simply do nothing.
check(
    'served over a secure context',
    await page.evaluate(() => window.isSecureContext),
    new URL(url).protocol
);

check(
    'the browser exposes a speech recognition service',
    await page.evaluate(
        () => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
    )
);

check(
    'the app rendered',
    await page
        .getByRole('button', { name: /Fellesskap/ })
        .isVisible()
        .catch(() => false)
);

// The manifest and icons are what make it installable.
const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    try {
        const response = await fetch(link.href);
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
});
check('the PWA manifest loads', Boolean(manifest), manifest?.name ?? 'missing');

check(
    'a service worker is registered',
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => Boolean(r)))
);

// Icons and link previews are absolute or base-relative URLs that no rendering
// check would notice: a 404 here costs an icon on someone's home screen or a
// broken thumbnail in a shared link, and the page still looks perfect. Both
// were wrong on this project's first deployment to a new address.
const head = await page.evaluate(() => ({
    appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.href ?? null,
    ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? null,
}));

const reachable = async target => {
    if (!target) return false;
    try {
        const response = await page.request.get(target);
        return response.ok();
    } catch {
        return false;
    }
};

check('the apple-touch-icon resolves', await reachable(head.appleIcon), head.appleIcon ?? 'missing');
check('the link-preview image resolves', await reachable(head.ogImage), head.ogImage ?? 'missing');

// Not a failure: on a temporary address like *.workers.dev you would not set
// VITE_SITE_URL, and pointing previews at the real site is right. On the final
// domain, pointing them anywhere else is not.
const advertised = head.ogUrl ? new URL(head.ogUrl).host : null;
if (advertised && advertised !== new URL(url).host) {
    console.log(
        `NOTE  link previews advertise ${advertised}, not ${new URL(url).host}` +
            '  — set VITE_SITE_URL if this is the address people will share'
    );
}

await page.waitForTimeout(3000);
check('no same-origin request 404ed', assetFailures.length === 0, assetFailures[0] ?? '');
check('no page errors', errors.length === 0, errors[0] ?? '');

await browser.close();

console.log(
    problems.length ? `\n${problems.length} FAILING: ${problems.join(', ')}` : '\nEverything checks out'
);
process.exit(problems.length ? 1 : 0);
