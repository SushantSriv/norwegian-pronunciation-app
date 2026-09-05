// @vitest-environment node
/**
 * The leaderboard server, run for real.
 *
 * Every test here drives the actual worker's fetch handler against an actual
 * SQLite database with the actual schema.sql applied. Nothing is mocked except
 * the clock's consequences: the worker's own rate limiter is stepped past by
 * ageing last_sync_at, the way real time would.
 *
 * The point of the file is the anti-cheat claims in server/README.md. Each one
 * is a table row there and a test here, because a security model nobody has
 * executed is a security model nobody should believe.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import worker from '../worker';
import type { TestDatabase } from '../sqlite-d1';
import { DAILY_CAP, MAX_POINTS } from '../../src/utils/leaderboardRules';
import { weekKey } from '../../src/utils/period';

/**
 * node:sqlite is a built-in only from Node 22.5. Imported dynamically and
 * skipped rather than thrown, so an older Node runs the other 400-odd tests
 * instead of failing at collection — and says why it skipped these.
 */
const sqlite = await import('../sqlite-d1').catch(() => null);
const describeWithSqlite = sqlite ? describe : describe.skip;
if (!sqlite) {
    console.warn('server/worker.test.ts skipped: node:sqlite needs Node 22.5 or newer.');
}

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(here, '..', 'schema.sql'), 'utf8');

const ORIGIN = 'https://learner.example';

let db: TestDatabase;
let env: { DB: TestDatabase; ALLOWED_ORIGINS: string };

beforeEach(() => {
    if (!sqlite) return;
    db = sqlite.createTestDatabase(SCHEMA);
    env = { DB: db, ALLOWED_ORIGINS: ORIGIN };
});

afterEach(() => db?.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hex = (seed: string, length = 32) =>
    seed.repeat(Math.ceil(length / seed.length)).slice(0, length);

interface Learner {
    id: string;
    secret: string;
    nickname: string;
}

const learner = (seed: string, nickname: string): Learner => ({
    id: hex(seed, 32),
    secret: hex(seed, 64),
    nickname,
});

let eventCounter = 0;
const eventId = () => hex(String(eventCounter++).padStart(4, 'a'), 16);

interface EventInput {
    id?: string;
    kind?: string;
    points?: number;
    at?: number;
    cefr?: string;
}

const event = (over: EventInput = {}) => ({
    id: over.id ?? eventId(),
    kind: over.kind ?? 'clear',
    points: over.points ?? 5,
    at: over.at ?? Date.now() - 1000,
    ...(over.cefr ? { cefr: over.cefr } : {}),
});

async function sync(
    who: Learner,
    body: { events?: unknown[]; improvement?: unknown; nickname?: unknown } = {},
    secret = who.secret
) {
    const response = await worker.fetch(
        new Request('https://board.example/v1/sync', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${secret}`,
                'x-learner-id': who.id,
                origin: ORIGIN,
            },
            body: JSON.stringify({
                nickname: body.nickname ?? who.nickname,
                events: body.events ?? [],
                improvement: body.improvement ?? null,
            }),
        }),
        env
    );
    return { status: response.status, body: await response.json() };
}

async function board(scope = 'weekly', extra: Record<string, string> = {}) {
    const query = new URLSearchParams({ scope, ...extra });
    const response = await worker.fetch(
        new Request(`https://board.example/v1/board?${query}`, {
            headers: { origin: ORIGIN },
        }),
        env
    );
    return { status: response.status, body: await response.json() };
}

/** Step past the worker's per-learner rate limit, as real time would. */
const timePasses = () => db.exec('UPDATE users SET last_sync_at = 0');

const totalFor = (id: string, week: string) =>
    (db.rows(`SELECT points FROM totals WHERE user_id = '${id}' AND week = '${week}'`)[0]
        ?.points ?? 0) as number;

// ---------------------------------------------------------------------------

describeWithSqlite('a learner joining and syncing', () => {
    it('creates the account and banks the points', async () => {
        const kari = learner('a1', 'FjordFox');
        const result = await sync(kari, { events: [event(), event({ kind: 'attempt' })] });

        expect(result.status).toBe(200);
        expect(result.body.accepted).toHaveLength(2);
        expect(result.body.rejected).toEqual([]);
        expect(result.body.nickname).toBe('FjordFox');
        expect(result.body.standing.rank).toBe(1);
        expect(result.body.standing.value).toBe(10);
    });

    it('stores only a hash of the secret, never the secret', async () => {
        const kari = learner('a1', 'FjordFox');
        await sync(kari, { events: [event()] });

        const [row] = db.rows('SELECT secret_hash FROM users');
        expect(row.secret_hash).not.toBe(kari.secret);
        expect(String(row.secret_hash)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('keeps totals in step with the events it accepted', async () => {
        const kari = learner('a1', 'FjordFox');
        await sync(kari, { events: [event({ points: 5 }), event({ points: 11, kind: 'strong' })] });

        const week = weekKey(Date.now());
        expect(totalFor(kari.id, week)).toBe(16);
        expect(totalFor(kari.id, 'all')).toBe(16);
    });

    it('refuses a nickname that is not one', async () => {
        const kari = learner('a1', 'FjordFox');
        const result = await sync(kari, { nickname: 'x', events: [event()] });
        expect(result.status).toBe(400);
        expect(result.body.error).toMatch(/nickname/);
    });

    it('hands a second learner a variant when the name is taken', async () => {
        const kari = learner('a1', 'FjordFox');
        const ola = learner('b2', 'FjordFox');
        await sync(kari, { events: [event()] });
        const second = await sync(ola, { events: [event()] });

        expect(second.status).toBe(200);
        expect(second.body.nickname).not.toBe('FjordFox');
        expect(second.body.nickname).toMatch(/^FjordFox\d$/);
    });
});

describeWithSqlite('the anti-cheat rules, one by one', () => {
    const kari = learner('a1', 'FjordFox');

    it('refuses a forged point value instead of clamping it', async () => {
        const result = await sync(kari, { events: [event({ points: 999_999 })] });
        expect(result.body.accepted).toEqual([]);
        expect(result.body.rejected[0].reason).toBe('points-too-high');
        expect(totalFor(kari.id, 'all')).toBe(0);
    });

    it('refuses one point more than a kind can ever be worth', async () => {
        const ok = await sync(kari, { events: [event({ kind: 'strong', points: MAX_POINTS.strong })] });
        expect(ok.body.accepted).toHaveLength(1);

        timePasses();
        const over = await sync(kari, {
            events: [event({ kind: 'strong', points: MAX_POINTS.strong + 1 })],
        });
        expect(over.body.accepted).toEqual([]);
    });

    it('refuses negative and zero points', async () => {
        const result = await sync(kari, { events: [event({ points: -500 }), event({ points: 0 })] });
        expect(result.body.accepted).toEqual([]);
        expect(result.body.rejected.map((r: { reason: string }) => r.reason)).toEqual([
            'points-too-low',
            'points-too-low',
        ]);
    });

    it('pays a replayed event exactly once', async () => {
        const replayed = event({ points: 5 });
        const first = await sync(kari, { events: [replayed] });
        expect(first.body.accepted).toHaveLength(1);

        timePasses();
        const second = await sync(kari, { events: [replayed] });
        expect(second.body.accepted).toEqual([]);
        expect(second.body.rejected[0].reason).toBe('already-recorded');
        expect(totalFor(kari.id, 'all')).toBe(5);
    });

    it('refuses results dated in the future or long past', async () => {
        const result = await sync(kari, {
            events: [
                event({ at: Date.now() + 60 * 60_000 }),
                event({ at: Date.now() - 30 * 86_400_000 }),
            ],
        });
        expect(result.body.accepted).toEqual([]);
        expect(result.body.rejected.map((r: { reason: string }) => r.reason)).toEqual([
            'from-the-future',
            'too-old',
        ]);
    });

    it('holds the daily cap across separate requests', async () => {
        // 120 events of 5 points is 600, exactly the cap; the rest must bounce.
        const batch = () => Array.from({ length: 60 }, () => event({ points: 5 }));

        await sync(kari, { events: batch() });
        timePasses();
        await sync(kari, { events: batch() });
        timePasses();
        const third = await sync(kari, { events: batch() });

        expect(totalFor(kari.id, 'all')).toBe(DAILY_CAP);
        expect(third.body.accepted).toEqual([]);
        expect(third.body.rejected[0].reason).toBe('daily-cap');
    });

    it('pays the streak bonus once a day, however many are claimed', async () => {
        const result = await sync(kari, {
            events: [
                event({ kind: 'streak', points: 50 }),
                event({ kind: 'streak', points: 50 }),
                event({ kind: 'streak', points: 50 }),
            ],
        });
        expect(result.body.accepted).toHaveLength(1);
        expect(result.body.rejected.every((r: { reason: string }) => r.reason === 'kind-limit')).toBe(true);
        expect(totalFor(kari.id, 'all')).toBe(50);
    });

    it('remembers the kind limit across requests, not just within one', async () => {
        await sync(kari, { events: [event({ kind: 'streak', points: 50 })] });
        timePasses();
        const again = await sync(kari, { events: [event({ kind: 'streak', points: 50 })] });

        expect(again.body.accepted).toEqual([]);
        expect(totalFor(kari.id, 'all')).toBe(50);
    });

    it('caps how many sessions a day can be claimed', async () => {
        const result = await sync(kari, {
            events: Array.from({ length: 7 }, () => event({ kind: 'session', points: 25 })),
        });
        expect(result.body.accepted).toHaveLength(4);
    });

    it('refuses to let one learner post as another', async () => {
        await sync(kari, { events: [event()] });
        timePasses();

        const impostor = await sync(kari, { events: [event()] }, hex('ff', 64));
        expect(impostor.status).toBe(403);
        expect(impostor.body.error).toBe('not-your-id');
    });

    it('rate-limits a learner syncing on a loop', async () => {
        await sync(kari, { events: [event()] });
        const immediate = await sync(kari, { events: [event()] });
        expect(immediate.status).toBe(429);
    });

    it('refuses an id that is trying to be SQL', async () => {
        const injected = { ...kari, id: "'; DROP TABLE users; --" };
        const result = await sync(injected, { events: [event()] });

        expect(result.status).toBe(400);
        expect(result.body.error).toBe('bad-learner-id');
        // And the table is still there.
        expect(() => db.rows('SELECT 1 FROM users')).not.toThrow();
    });

    it('survives an event id full of quotes', async () => {
        // The IN (...) clause is built from placeholders, never from values.
        const result = await sync(kari, { events: [event({ id: "a'); DROP TABLE events; --" })] });
        expect(result.body.rejected[0].reason).toBe('bad-id');
        expect(() => db.rows('SELECT 1 FROM events')).not.toThrow();
    });

    it('refuses a payload larger than a real session could produce', async () => {
        const result = await sync(kari, {
            events: Array.from({ length: 500 }, () => event()),
        });
        expect(result.status).toBe(413);
    });
});

describeWithSqlite('the boards', () => {
    const kari = learner('a1', 'FjordFox');
    const ola = learner('b2', 'NorskNinja');
    const per = learner('c3', 'FjellTale');

    const seed = async (who: Learner, points: number, cefr?: string) => {
        timePasses();
        // Split across events so no single one exceeds its ceiling.
        const events = [];
        let left = points;
        while (left > 0) {
            const chunk = Math.min(5, left);
            events.push(event({ points: chunk, kind: 'clear', ...(cefr ? { cefr } : {}) }));
            left -= chunk;
        }
        await sync(who, { events });
    };

    it('ranks by points, highest first', async () => {
        await seed(kari, 100);
        await seed(ola, 200);
        await seed(per, 50);

        const { body } = await board('weekly');
        expect(body.rows.map((r: { nickname: string }) => r.nickname)).toEqual([
            'NorskNinja',
            'FjordFox',
            'FjellTale',
        ]);
        expect(body.rows[0].rank).toBe(1);
        expect(body.total).toBe(3);
    });

    it('breaks a tie the same way every time', async () => {
        await seed(kari, 100);
        await seed(ola, 100);

        const first = await board('weekly');
        const second = await board('weekly');
        expect(first.body.rows.map((r: { id: string }) => r.id)).toEqual(
            second.body.rows.map((r: { id: string }) => r.id)
        );
        expect(first.body.rows[0].rank).toBe(1);
        expect(first.body.rows[1].rank).toBe(2);
    });

    it('tells a learner outside the top where they actually are', async () => {
        await seed(kari, 200);
        await seed(ola, 150);
        await seed(per, 50);

        const { body } = await board('weekly', { me: per.id });
        expect(body.you.rank).toBe(3);
        expect(body.you.value).toBe(50);
        // One more point than the learner above is what it takes to pass them.
        expect(body.you.toNext).toBe(101);
    });

    it('has nothing to say about a learner who has not synced', async () => {
        await seed(kari, 50);
        const { body } = await board('weekly', { me: hex('99', 32) });
        expect(body.you.rank).toBeNull();
        expect(body.you.toNext).toBeNull();
    });

    it('serves an all-time board from the same rows', async () => {
        await seed(kari, 100);
        await seed(ola, 30);

        const { body } = await board('alltime');
        expect(body.rows[0].nickname).toBe('FjordFox');
        expect(body.rows[0].value).toBe(100);
    });

    it('filters by a level it derived itself, not one the client sent', async () => {
        await seed(kari, 60, 'B1');
        await seed(ola, 60, 'A1');

        const b1 = await board('weekly', { level: 'B1' });
        expect(b1.body.rows.map((r: { nickname: string }) => r.nickname)).toEqual(['FjordFox']);

        const a1 = await board('weekly', { level: 'A1' });
        expect(a1.body.rows.map((r: { nickname: string }) => r.nickname)).toEqual(['NorskNinja']);
    });

    it('refuses a level or scope it does not recognise', async () => {
        expect((await board('weekly', { level: 'C2' })).status).toBe(400);
        expect((await board('sideways')).status).toBe(400);
    });

    it('shows no one on the most-improved board without enough evidence', async () => {
        await seed(kari, 50);
        timePasses();
        await sync(kari, {
            events: [event()],
            improvement: { delta: 40, samples: 3, baseline: 2 },
        });

        const { body } = await board('improved');
        expect(body.rows).toEqual([]);
    });

    it('ranks a real improvement, and ignores a trivial one', async () => {
        await seed(kari, 50);
        timePasses();
        await sync(kari, {
            events: [event()],
            improvement: { delta: 12.5, samples: 30, baseline: 25 },
        });

        await seed(ola, 50);
        timePasses();
        await sync(ola, {
            events: [event()],
            improvement: { delta: 0.4, samples: 30, baseline: 25 },
        });

        const { body } = await board('improved');
        expect(body.rows.map((r: { nickname: string }) => r.nickname)).toEqual(['FjordFox']);
        expect(body.rows[0].value).toBeCloseTo(12.5);
    });

    it('replaces a learner improvement figure rather than stacking it', async () => {
        await seed(kari, 50);
        timePasses();
        await sync(kari, { events: [event()], improvement: { delta: 12, samples: 30, baseline: 25 } });
        timePasses();
        await sync(kari, { events: [event()], improvement: { delta: 4, samples: 31, baseline: 25 } });

        expect(db.rows('SELECT delta FROM improvement')).toHaveLength(1);
        expect((await board('improved')).body.rows[0].value).toBeCloseTo(4);
    });
});

describeWithSqlite('the level a learner is shown at', () => {
    it('is the one carrying the most of their points', async () => {
        const kari = learner('a1', 'FjordFox');
        await sync(kari, {
            events: [
                event({ points: 5, cefr: 'A2' }),
                event({ points: 5, cefr: 'A2' }),
                event({ points: 5, cefr: 'B1' }),
            ],
        });

        const { body } = await board('weekly');
        expect(body.rows[0].level).toBe('A2');
    });

    it('is nothing at all for a learner who only does occupation stages', async () => {
        const kari = learner('a1', 'FjordFox');
        await sync(kari, { events: [event({ points: 5 })] });

        const { body } = await board('weekly');
        expect(body.rows[0].level).toBeNull();
    });
});

describeWithSqlite('the HTTP surface', () => {
    it('answers a preflight with the allowed origin', async () => {
        const response = await worker.fetch(
            new Request('https://board.example/v1/sync', {
                method: 'OPTIONS',
                headers: { origin: ORIGIN },
            }),
            env
        );
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    });

    it('does not echo an origin that was never allowed', async () => {
        const response = await worker.fetch(
            new Request('https://board.example/v1/board?scope=weekly', {
                headers: { origin: 'https://evil.example' },
            }),
            env
        );
        expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    });

    it('404s an unknown path rather than guessing', async () => {
        const response = await worker.fetch(
            new Request('https://board.example/v1/whatever', { headers: { origin: ORIGIN } }),
            env
        );
        expect(response.status).toBe(404);
    });

    it('refuses a body that is not JSON', async () => {
        const response = await worker.fetch(
            new Request('https://board.example/v1/sync', {
                method: 'POST',
                headers: { authorization: 'Bearer x', 'x-learner-id': hex('a1', 32), origin: ORIGIN },
                body: 'not json',
            }),
            env
        );
        expect(response.status).toBe(400);
    });

    it('publishes the limits the client is expected to respect', async () => {
        const response = await worker.fetch(
            new Request('https://board.example/v1/limits', { headers: { origin: ORIGIN } }),
            env
        );
        expect(await response.json()).toMatchObject({ dailyCap: DAILY_CAP });
    });
});
