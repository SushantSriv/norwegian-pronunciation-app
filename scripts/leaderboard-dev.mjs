/**
 * Run the leaderboard worker locally.
 *
 * server/ is TypeScript, so it is bundled with the esbuild that ships inside
 * Vite and then executed — no extra dependency, no separate build step to
 * remember. Development only; see server/README.md for deploying the real one.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(mkdtempSync(join(tmpdir(), 'npa-leaderboard-')), 'dev-server.mjs');

await build({
    entryPoints: ['server/dev-server.ts'],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['node:*'],
    logLevel: 'warning',
});

spawn(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit' }).on('exit', code =>
    process.exit(code ?? 0)
);
