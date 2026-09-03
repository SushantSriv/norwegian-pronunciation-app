/**
 * Run the browser benchmark in real engines and report what it found.
 *
 * The speech model was measured under Node, which shares ONNX Runtime with the
 * browser and nothing else — not the engine, not the WASM implementation, not
 * the memory limits. A learner runs this in a browser, so the numbers that
 * matter have to come from one.
 *
 *   npm run bench:browser
 *   npm run bench:browser -- --engines chromium,webkit --keep
 *
 * WHAT THIS CAN AND CANNOT COVER. Playwright drives Chromium, Firefox and
 * WebKit on this machine. Chromium is what Chrome and Edge are built on and
 * WebKit is what Safari is built on, so those numbers transfer in kind but are
 * not the branded browsers themselves. Chrome on Android and Safari on iOS
 * cannot be reached from here at all: they need real devices or a device cloud.
 * Do not report them as verified.
 *
 * The page is also just a page — open `bench/bench.html` through `npm run dev`
 * on a phone and it prints the same table.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? fallback : args[at + 1];
};

const ENGINES = flag('engines', 'chromium,firefox,webkit').split(',').filter(Boolean);
const PORT = Number(flag('port', 5199));
/** The model download is the slow part, and it is paid once per engine. */
const TIMEOUT_MS = Number(flag('timeout', 300_000));

const { chromium, firefox, webkit } = await import('playwright');
const LAUNCHERS = { chromium, firefox, webkit };

// ---- dev server -----------------------------------------------------------
console.log(`starting vite on :${PORT}…`);
// shell: true because Node refuses to spawn a .cmd shim directly on Windows,
// which is what npx is there.
const server = spawn('npx vite --port ' + PORT + ' --strictPort', {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
});

let serverOutput = '';
server.stdout.on('data', chunk => (serverOutput += chunk));
server.stderr.on('data', chunk => (serverOutput += chunk));

/** Killing the shell does not kill vite under it, so take the tree. */
function stopServer() {
    if (process.platform === 'win32') {
        try {
            spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
            server.kill();
        }
    } else {
        server.kill();
    }
}

const base = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) {
    try {
        const probe = await fetch(base);
        if (probe.ok) break;
    } catch {
        // not up yet
    }
    await sleep(500);
    if (i === 59) {
        console.error('vite did not start:\n' + serverOutput);
        stopServer();
        process.exit(1);
    }
}

// ---- run ------------------------------------------------------------------
const results = [];
for (const engine of ENGINES) {
    const launcher = LAUNCHERS[engine];
    if (!launcher) {
        console.log(`${engine}: unknown engine, skipped`);
        continue;
    }

    process.stdout.write(`${engine}: `);
    let browser;
    try {
        browser = await launcher.launch({
            // A fake capture device, so getUserMedia can be exercised without a
            // real microphone and without a permission prompt.
            args:
                engine === 'chromium'
                    ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
                    : [],
        });
        const context = await browser.newContext({ permissions: ['microphone'] }).catch(() =>
            browser.newContext()
        );
        const page = await context.newPage();
        page.on('pageerror', error => console.log(`\n  page error: ${error.message}`));

        await page.goto(`${base}/bench/bench.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => '__BENCH__' in window, null, { timeout: TIMEOUT_MS });
        const result = await page.evaluate(() => window.__BENCH__);
        results.push({ engine, ...result });
        console.log('done');
    } catch (error) {
        results.push({ engine, error: error.message.split('\n')[0] });
        console.log(`FAILED — ${error.message.split('\n')[0]}`);
    } finally {
        await browser?.close();
    }
}

stopServer();

// ---- report ---------------------------------------------------------------
const cell = (value, unit = '') =>
    value === null || value === undefined ? '—' : `${Number(value).toFixed(2)}${unit}`;

console.log('\n=== BROWSER BENCHMARK ===');
console.log(
    'engine'.padEnd(11) +
        'load'.padStart(9) +
        'transcribe'.padStart(12) +
        'xRT'.padStart(7) +
        'pitch'.padStart(9) +
        'latency'.padStart(9) +
        'heap'.padStart(8) +
        '  mic'
);
for (const row of results) {
    if (row.error) {
        console.log(`${row.engine.padEnd(11)}  FAILED — ${row.error}`);
        continue;
    }
    console.log(
        row.engine.padEnd(11) +
            cell(row.modelLoadSeconds, 's').padStart(9) +
            cell(row.transcribeSeconds?.at(-1), 's').padStart(12) +
            cell(row.realtimeFactor).padStart(7) +
            cell(row.pitchSeconds?.at(-1), 's').padStart(9) +
            cell(row.attemptLatencySeconds, 's').padStart(9) +
            (row.heapMb === null ? '—' : `${row.heapMb}MB`).padStart(8) +
            `  ${row.microphone}` +
            (row.failures?.length ? `  (${row.failures.length} failures)` : '')
    );
}

console.log(
    '\nChromium stands in for Chrome and Edge, WebKit for Safari — same engines, not the\n' +
        'branded builds. Chrome on Android and Safari on iOS are NOT covered: they need real\n' +
        'devices. Open bench/bench.html through `npm run dev` on a phone for those.'
);

for (const row of results) {
    for (const failure of row.failures ?? []) console.log(`  ${row.engine}: ${failure}`);
}
