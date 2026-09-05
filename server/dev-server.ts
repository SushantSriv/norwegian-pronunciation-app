/**
 * The leaderboard worker, on your own machine.
 *
 * Cloudflare in production; here, the same worker.ts behind a plain Node HTTP
 * server with SQLite standing in for D1. That makes the shared board something
 * you can actually look at while developing — start this, build the app with
 * VITE_LEADERBOARD_URL pointed at it, and the community screen fills up with
 * real rows served by the real handler.
 *
 *   npm run leaderboard:dev            # in-memory, forgotten on exit
 *   npm run leaderboard:dev -- --file board.sqlite --port 8787
 *
 * Development only. It has no TLS, no origin restriction worth the name, and
 * it is not what you deploy — server/README.md has the deployment steps.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import worker from './worker';
import { createTestDatabase } from './sqlite-d1';

const argument = (name: string, fallback: string): string => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const port = Number(argument('port', '8787'));
const file = argument('file', ':memory:');
const origins = argument('origins', '*');

// Resolved from the working directory rather than from import.meta.url: this
// runs bundled out of a temporary directory, where the schema is not.
const schema = argument('schema', join(process.cwd(), 'server', 'schema.sql'));
const db = createTestDatabase(readFileSync(schema, 'utf8'), file);
const env = { DB: db, ALLOWED_ORIGINS: origins === '*' ? '' : origins };

const server = createServer((incoming, outgoing) => {
    // Everything is wrapped: a browser that navigates away mid-response makes
    // the write throw, and an unhandled rejection takes the whole process down
    // with it. A development server that dies when you close a tab is worse
    // than useless.
    void (async () => {
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of incoming) chunks.push(chunk as Buffer);
            const body = Buffer.concat(chunks);

            const url = `http://${incoming.headers.host ?? 'localhost'}${incoming.url ?? '/'}`;
            const request = new Request(url, {
                method: incoming.method,
                headers: incoming.headers as Record<string, string>,
                body: body.length ? body : undefined,
            });

            const response = await worker.fetch(request, env);
            const payload = Buffer.from(await response.arrayBuffer());
            if (outgoing.writableEnded || outgoing.destroyed) return;
            outgoing.writeHead(response.status, Object.fromEntries(response.headers));
            outgoing.end(payload);
        } catch (error) {
            console.error('request failed:', error);
            if (outgoing.writableEnded || outgoing.destroyed) return;
            try {
                outgoing.writeHead(500, { 'content-type': 'application/json' });
                outgoing.end(JSON.stringify({ error: String(error) }));
            } catch {
                // The socket went away while we were apologising for it.
            }
        }
    })();
});

server.on('clientError', (_error, socket) => socket.destroy());
process.on('uncaughtException', error => console.error('uncaught:', error));

server.listen(port, '127.0.0.1', () => {
    console.log(`leaderboard on http://127.0.0.1:${port}  (${file})`);
    console.log(`build the app with VITE_LEADERBOARD_URL=http://127.0.0.1:${port}`);
});
