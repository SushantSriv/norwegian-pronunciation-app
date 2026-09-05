/**
 * The leaderboard server: one Cloudflare Worker and one D1 database.
 *
 * The app itself is static and needs nothing running anywhere. This exists
 * only because a board shared between people has to live somewhere, and it is
 * deliberately the smallest thing that can do that job: three endpoints, four
 * tables, no framework, no build step beyond wrangler, and comfortably inside
 * the free tier at any plausible size for this app. README.md alongside it has
 * the deployment steps, the cost arithmetic and the security model.
 *
 * IT DOES NOT TRUST THE CLIENT. Every rule it applies comes from
 * ../src/utils/leaderboardRules.ts — the same file the browser checks against,
 * so the two cannot drift — and every number it publishes is derived here from
 * events it decided to accept. A modified client can claim a plausible day it
 * did not have; it cannot claim a million points, replay yesterday's, or post
 * a total.
 */
import {
    budgetFor,
    CLOCK_SKEW_MS,
    DAILY_CAP,
    DAILY_KIND_LIMIT,
    LEVELS,
    MAX_EVENTS_PER_SYNC,
    MIN_IMPROVEMENT_DELTA,
    nicknameKey,
    sanitizeNickname,
    validateEvent,
    validateImprovement,
    type SubmittedEvent,
} from '../src/utils/leaderboardRules';
import { dayKey, weekKey } from '../src/utils/period';

// ---------------------------------------------------------------------------
// The slice of the D1 API this uses, typed here so the worker compiles with
// the app and needs no @cloudflare/workers-types dependency.
// ---------------------------------------------------------------------------

interface D1Statement {
    bind(...values: unknown[]): D1Statement;
    first<T>(): Promise<T | null>;
    all<T>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
}

interface D1Database {
    prepare(query: string): D1Statement;
    batch(statements: D1Statement[]): Promise<unknown[]>;
}

interface Env {
    DB: D1Database;
    /** Comma-separated origins allowed to call this. */
    ALLOWED_ORIGINS?: string;
}

// ---------------------------------------------------------------------------

/** Rows a board returns. */
const BOARD_SIZE = 10;
/** Minimum gap between two syncs from one learner. */
const SYNC_INTERVAL_MS = 3_000;
/**
 * The `week` value of the all-time row in `totals`.
 *
 * Not a real week key — those all look like 2026-W02 — so one table and one
 * index serve both boards.
 */
const ALL_TIME = 'all';

const ID_PATTERN = /^[a-f0-9]{16,64}$/i;

const json = (body: unknown, status: number, origin: string): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': origin,
            'cache-control': 'no-store',
        },
    });

function allowedOrigin(request: Request, env: Env): string {
    const origin = request.headers.get('origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map(one => one.trim())
        .filter(Boolean);
    if (!allowed.length) return origin || '*';
    return allowed.includes(origin) ? origin : allowed[0];
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Who is asking
// ---------------------------------------------------------------------------

interface UserRow {
    id: string;
    secret_hash: string;
    nickname: string;
    level: string | null;
    last_rank: number | null;
    last_sync_at: number;
}

/**
 * Find or create the learner behind a request.
 *
 * The bearer secret is the whole of the authentication. It is hashed on
 * arrival and compared against the stored hash, so a dump of this database
 * contains nothing that could be used to post as anybody.
 */
async function authenticate(
    db: D1Database,
    id: string,
    secret: string,
    nickname: string,
    now: number
): Promise<{ user: UserRow } | { error: string; status: number }> {
    if (!ID_PATTERN.test(id)) return { error: 'bad-learner-id', status: 400 };
    if (secret.length < 32 || secret.length > 128) return { error: 'bad-secret', status: 400 };

    const hash = await sha256(`${id}:${secret}`);
    const existing = await db
        .prepare(
            'SELECT id, secret_hash, nickname, level, last_rank, last_sync_at FROM users WHERE id = ?'
        )
        .bind(id)
        .first<UserRow>();

    if (existing) {
        if (existing.secret_hash !== hash) return { error: 'not-your-id', status: 403 };
        if (now - existing.last_sync_at < SYNC_INTERVAL_MS) {
            return { error: 'too-many-requests', status: 429 };
        }
        return { user: existing };
    }

    // A new learner. The nickname may collide, so try a few suffixed variants
    // before giving up — the alternative is turning somebody away because a
    // name the app offered them at random was already taken.
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = attempt === 0 ? nickname : `${nickname.slice(0, 17)}${attempt + 1}`;
        try {
            await db
                .prepare(
                    'INSERT INTO users (id, secret_hash, nickname, nickname_key, level, last_rank, last_sync_at, created_at) VALUES (?, ?, ?, ?, NULL, NULL, 0, ?)'
                )
                .bind(id, hash, candidate, nicknameKey(candidate), now)
                .run();
            return {
                user: {
                    id,
                    secret_hash: hash,
                    nickname: candidate,
                    level: null,
                    last_rank: null,
                    last_sync_at: 0,
                },
            };
        } catch {
            // Unique constraint on nickname_key: try the next variant.
        }
    }
    return { error: 'nickname-taken', status: 409 };
}

// ---------------------------------------------------------------------------
// Totals
//
// Kept as rows rather than recomputed per request. A board that SUM()s the
// whole events table on every view reads a hundred thousand rows to render
// ten, which is both slow and the one thing here that would leave the free
// tier. These rows are only ever written from events this worker accepted.
// ---------------------------------------------------------------------------

async function addToTotals(
    db: D1Database,
    userId: string,
    accepted: readonly SubmittedEvent[]
): Promise<void> {
    if (!accepted.length) return;

    const byWeek = new Map<string, number>();
    let lifetime = 0;
    for (const event of accepted) {
        const week = weekKey(event.at);
        byWeek.set(week, (byWeek.get(week) ?? 0) + event.points);
        lifetime += event.points;
    }
    byWeek.set(ALL_TIME, lifetime);

    await db.batch(
        [...byWeek].map(([week, points]) =>
            db
                .prepare(
                    'INSERT INTO totals (user_id, week, points) VALUES (?, ?, ?) ON CONFLICT(user_id, week) DO UPDATE SET points = points + excluded.points'
                )
                .bind(userId, week, points)
        )
    );
}

/** The level this learner has earned the most points at, from our own rows. */
async function deriveLevel(db: D1Database, userId: string): Promise<string | null> {
    const { results } = await db
        .prepare(
            'SELECT level, SUM(points) AS points FROM events WHERE user_id = ? AND level IS NOT NULL GROUP BY level'
        )
        .bind(userId)
        .all<{ level: string; points: number }>();

    let best: string | null = null;
    let bestPoints = 0;
    // Walked in level order, so a tie resolves upwards to the harder level —
    // the same rule the client applies to the badge it shows locally.
    for (const level of LEVELS) {
        const points = results.find(row => row.level === level)?.points ?? 0;
        if (points > 0 && points >= bestPoints) {
            best = level;
            bestPoints = points;
        }
    }
    return best;
}

interface RankRow {
    id: string;
    nickname: string;
    level: string | null;
    value: number;
}

const boardQuery = (byLevel: boolean) => `
    SELECT u.id AS id, u.nickname AS nickname, u.level AS level, t.points AS value
    FROM totals t JOIN users u ON u.id = t.user_id
    WHERE t.week = ? AND t.points > 0${byLevel ? ' AND u.level = ?' : ''}
    ORDER BY t.points DESC, u.id ASC
    LIMIT ?
`;

/**
 * Where one learner stands, without reading the whole board.
 *
 * Two counted lookups against the (week, points) index rather than fetching
 * every row and finding yourself in it — which matters at #4 000 as much as it
 * does at #4, and it is #4 000 who most needs to be told where they are.
 */
async function standingFor(
    db: D1Database,
    userId: string,
    week: string,
    previousRank: number | null
) {
    const mine = await db
        .prepare('SELECT points FROM totals WHERE user_id = ? AND week = ?')
        .bind(userId, week)
        .first<{ points: number }>();

    if (!mine || mine.points <= 0) {
        return { rank: null, value: 0, previousRank, toNext: null };
    }

    const ahead = await db
        .prepare(
            'SELECT COUNT(*) AS n FROM totals t JOIN users u ON u.id = t.user_id WHERE t.week = ? AND (t.points > ? OR (t.points = ? AND u.id < ?))'
        )
        .bind(week, mine.points, mine.points, userId)
        .first<{ n: number }>();

    const next = await db
        .prepare('SELECT MIN(points) AS points FROM totals WHERE week = ? AND points > ?')
        .bind(week, mine.points)
        .first<{ points: number | null }>();

    return {
        rank: (ahead?.n ?? 0) + 1,
        value: mine.points,
        previousRank,
        // One more point than the learner above is what it takes to pass them.
        toNext: next?.points != null ? next.points - mine.points + 1 : null,
    };
}

// ---------------------------------------------------------------------------
// POST /v1/sync
// ---------------------------------------------------------------------------

async function handleSync(request: Request, env: Env, origin: string): Promise<Response> {
    const now = Date.now();
    const id = request.headers.get('x-learner-id') ?? '';
    const secret = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');

    let body: { nickname?: unknown; events?: unknown; improvement?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return json({ error: 'bad-json' }, 400, origin);
    }

    const name = sanitizeNickname(body.nickname);
    if (!name.ok) return json({ error: `nickname-${name.reason}` }, 400, origin);

    const raw = Array.isArray(body.events) ? body.events : [];
    if (raw.length > MAX_EVENTS_PER_SYNC) return json({ error: 'too-many-events' }, 413, origin);

    const auth = await authenticate(env.DB, id, secret, name.value, now);
    if ('error' in auth) return json({ error: auth.error }, auth.status, origin);
    const user = auth.user;

    // ── Every event on its own terms ───────────────────────────────────
    const valid: SubmittedEvent[] = [];
    const rejected: { id: string; reason: string }[] = [];
    for (const candidate of raw) {
        const checked = validateEvent(candidate, now);
        if (checked.ok) {
            valid.push(checked.value);
        } else {
            const bad = candidate as { id?: unknown };
            rejected.push({
                id: typeof bad?.id === 'string' ? bad.id : 'unknown',
                reason: checked.reason,
            });
        }
    }

    // ── Anything already recorded pays nothing a second time ───────────
    const seen = new Set<string>();
    if (valid.length) {
        const placeholders = valid.map(() => '?').join(',');
        const { results } = await env.DB.prepare(
            `SELECT id FROM events WHERE id IN (${placeholders})`
        )
            .bind(...valid.map(event => event.id))
            .all<{ id: string }>();
        for (const row of results) seen.add(row.id);
    }
    const fresh = valid.filter(event => {
        if (!seen.has(event.id)) return true;
        rejected.push({ id: event.id, reason: 'already-recorded' });
        return false;
    });

    // ── The daily budget, per UTC day, across every request so far ─────
    const accepted: SubmittedEvent[] = [];
    const byDay = new Map<string, SubmittedEvent[]>();
    for (const event of fresh) {
        const day = dayKey(event.at);
        byDay.set(day, [...(byDay.get(day) ?? []), event]);
    }

    for (const [day, events] of byDay) {
        const spent = await env.DB.prepare(
            'SELECT COALESCE(SUM(points), 0) AS points FROM events WHERE user_id = ? AND day = ?'
        )
            .bind(user.id, day)
            .first<{ points: number }>();

        // How many more of each rationed kind may be claimed today. A streak
        // bonus is worth 50 and can only be earned once a day; without this,
        // submitting it fifty times would be the cheapest cheat available.
        const remaining = new Map<string, number>();
        for (const [kind, limit] of Object.entries(DAILY_KIND_LIMIT)) {
            const row = await env.DB.prepare(
                'SELECT COUNT(*) AS used FROM events WHERE user_id = ? AND day = ? AND kind = ?'
            )
                .bind(user.id, day, kind)
                .first<{ used: number }>();
            remaining.set(kind, (limit ?? 0) - (row?.used ?? 0));
        }

        const withinKindLimits = events.filter(event => {
            const left = remaining.get(event.kind);
            if (left === undefined) return true;
            if (left <= 0) {
                rejected.push({ id: event.id, reason: 'kind-limit' });
                return false;
            }
            remaining.set(event.kind, left - 1);
            return true;
        });

        const budget = budgetFor(spent?.points ?? 0, withinKindLimits);
        accepted.push(...budget.accepted);
        rejected.push(...budget.rejected);
    }

    // ── Write ──────────────────────────────────────────────────────────
    if (accepted.length) {
        await env.DB.batch(
            accepted.map(event =>
                env.DB.prepare(
                    'INSERT OR IGNORE INTO events (id, user_id, kind, points, level, day, week, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                ).bind(
                    event.id,
                    user.id,
                    event.kind,
                    event.points,
                    event.cefr ?? null,
                    dayKey(event.at),
                    weekKey(event.at),
                    event.at,
                    now
                )
            )
        );
        await addToTotals(env.DB, user.id, accepted);
    }

    const week = weekKey(now);

    if (body.improvement != null) {
        const checked = validateImprovement(body.improvement);
        if (checked.ok) {
            await env.DB.prepare(
                'INSERT INTO improvement (user_id, week, delta, samples, baseline, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, week) DO UPDATE SET delta = excluded.delta, samples = excluded.samples, baseline = excluded.baseline, updated_at = excluded.updated_at'
            )
                .bind(
                    user.id,
                    week,
                    checked.value.delta,
                    checked.value.samples,
                    checked.value.baseline,
                    now
                )
                .run();
        } else {
            rejected.push({ id: 'improvement', reason: checked.reason });
        }
    }

    const standing = await standingFor(env.DB, user.id, week, user.last_rank);
    const level = accepted.length ? await deriveLevel(env.DB, user.id) : user.level;

    await env.DB.prepare(
        'UPDATE users SET nickname = ?, nickname_key = ?, level = ?, last_rank = ?, last_sync_at = ? WHERE id = ?'
    )
        .bind(user.nickname, nicknameKey(user.nickname), level, standing.rank, now, user.id)
        .run();

    return json(
        {
            accepted: accepted.map(event => event.id),
            rejected,
            standing,
            nickname: user.nickname,
        },
        200,
        origin
    );
}

// ---------------------------------------------------------------------------
// GET /v1/board
// ---------------------------------------------------------------------------

async function handleBoard(request: Request, env: Env, origin: string): Promise<Response> {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'weekly';
    const level = url.searchParams.get('level') ?? 'all';
    const me = url.searchParams.get('me');
    const week = weekKey(Date.now());

    if (!['weekly', 'alltime', 'improved'].includes(scope)) {
        return json({ error: 'unknown-scope' }, 400, origin);
    }
    if (level !== 'all' && !LEVELS.includes(level)) {
        return json({ error: 'unknown-level' }, 400, origin);
    }

    let rows: RankRow[];
    if (scope === 'improved') {
        const { results } = await env.DB.prepare(
            `SELECT u.id AS id, u.nickname AS nickname, u.level AS level, i.delta AS value
             FROM improvement i JOIN users u ON u.id = i.user_id
             WHERE i.week = ? AND i.delta >= ?
             ORDER BY i.delta DESC, u.id ASC
             LIMIT ?`
        )
            .bind(week, MIN_IMPROVEMENT_DELTA, BOARD_SIZE)
            .all<RankRow>();
        rows = results;
    } else {
        const key = scope === 'weekly' ? week : ALL_TIME;
        const parameters = level === 'all' ? [key, BOARD_SIZE] : [key, level, BOARD_SIZE];
        const { results } = await env.DB.prepare(boardQuery(level !== 'all'))
            .bind(...parameters)
            .all<RankRow>();
        rows = results;
    }

    // The learner's own place is looked up rather than searched for in the top
    // ten, so #17 gets an answer as readily as #2 does.
    const you =
        me && scope !== 'improved'
            ? await standingFor(env.DB, me, scope === 'weekly' ? week : ALL_TIME, null)
            : null;

    return json(
        {
            scope,
            level,
            total: rows.length,
            rows: rows.map((row, position) => ({
                rank: position + 1,
                id: row.id,
                nickname: row.nickname,
                value: row.value,
                level: row.level,
            })),
            you,
        },
        200,
        origin
    );
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const origin = allowedOrigin(request, env);
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'access-control-allow-origin': origin,
                    'access-control-allow-methods': 'GET, POST, OPTIONS',
                    'access-control-allow-headers': 'content-type, authorization, x-learner-id',
                    'access-control-max-age': '86400',
                },
            });
        }

        try {
            if (request.method === 'POST' && url.pathname === '/v1/sync') {
                return await handleSync(request, env, origin);
            }
            if (request.method === 'GET' && url.pathname === '/v1/board') {
                return await handleBoard(request, env, origin);
            }
            if (request.method === 'GET' && url.pathname === '/v1/limits') {
                // Handy for checking a deployment against the client's rules.
                return json({ dailyCap: DAILY_CAP, clockSkewMs: CLOCK_SKEW_MS }, 200, origin);
            }
        } catch (error) {
            return json(
                { error: 'server-error', detail: error instanceof Error ? error.message : '' },
                500,
                origin
            );
        }

        return json({ error: 'not-found' }, 404, origin);
    },
};
