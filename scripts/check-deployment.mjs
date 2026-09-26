/**
 * Check a deployed copy of the app, from a real browser.
 *
 *   npm run check:deploy -- https://norskuttale.no
 *   npm run check:deploy                              # the GitHub Pages copy
 *
 * Written for the moment a domain changes, because that is when the things
 * nobody thinks to check break: the base path, the isolation headers, the
 * service worker's scope, whether the model CDN is still reachable under COEP.
 * Every one of those fails silently — the page still renders, and recognition
 * simply never works.
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
const cdn = { ok: 0, failed: [] };
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => message.type() === 'error' && errors.push(message.text()));
page.on('response', response => {
    if (/huggingface|hf\.co|jsdelivr/.test(response.url()) && response.status() < 400) cdn.ok++;
});
page.on('requestfailed', request => {
    if (/huggingface|hf\.co|jsdelivr/.test(request.url())) {
        cdn.failed.push(`${request.failure()?.errorText} ${request.url().slice(0, 80)}`);
    }
});

const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
check('the site responds', response?.ok() === true, `HTTP ${response?.status()}`);

// Assets resolve. A wrong base path leaves the HTML fine and everything else 404.
const assetFailures = [];
page.on('response', r => {
    if (r.url().startsWith(url) && r.status() >= 400) assetFailures.push(`${r.status()} ${r.url()}`);
});

const headers = response?.headers() ?? {};
const sentByHost = Boolean(headers['cross-origin-opener-policy']);
console.log(
    `\n  isolation headers from the host: ${sentByHost ? 'yes' : 'no (the service worker will supply them)'}\n`
);

// Either way it must end up isolated, or the model runs on one thread.
await page
    .waitForFunction(() => crossOriginIsolated === true, null, { timeout: 25000 })
    .then(() => check('cross-origin isolated', true, sentByHost ? 'from headers' : 'via service worker'))
    .catch(() => check('cross-origin isolated', false, 'the model will run single-threaded'));

check(
    'SharedArrayBuffer available, so WASM threads are possible',
    await page.evaluate(() => typeof SharedArrayBuffer === 'function')
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

// The model is fetched eagerly; give it long enough to get going.
await page.waitForTimeout(30000);
check('the speech worker started', page.workers().length > 0, `${page.workers().length} workers`);
check('the model CDN is reachable', cdn.ok > 0, `${cdn.ok} responses`);
check('nothing cross-origin was blocked', cdn.failed.length === 0, cdn.failed[0] ?? '');
check('no same-origin request 404ed', assetFailures.length === 0, assetFailures[0] ?? '');
check('no page errors', errors.length === 0, errors[0] ?? '');

await browser.close();

console.log(
    problems.length ? `\n${problems.length} FAILING: ${problems.join(', ')}` : '\nEverything checks out'
);
process.exit(problems.length ? 1 : 0);
