/**
 * The rules a leaderboard server enforces, and the client checks first.
 *
 * ONE COPY, DELIBERATELY. The worker in server/ imports this file, so the
 * caps the browser respects and the caps the server rejects on are the same
 * constants — there is no second table to drift out of step.
 *
 * The threat model is a modified client, because that is what a static web app
 * hands you: anyone can open devtools and POST whatever they like. So nothing
 * here trusts a total. The client sends individual events; the server checks
 * each one against a per-kind ceiling, a clock window and a daily budget, then
 * derives every total itself by summing what it accepted. A cheat is therefore
 * bounded by the same DAILY_CAP an honest learner has, and the worst outcome
 * is someone who claims a good day they did not have — not someone with a
 * billion points.
 *
 * What this does NOT defend against is spelled out in server/README.md: an
 * anonymous board with no accounts cannot stop a determined person from
 * creating many identities, or from posting plausible events for practice they
 * never did. Closing that needs real authentication and server-side scoring of
 * the audio, which this app deliberately does not do.
 */
import {
    DAILY_CAP,
    MIN_IMPROVEMENT_DELTA,
    MIN_IMPROVEMENT_SAMPLES,
    type PointKind,
} from './learningPoints';

// Re-exported so the worker has one import for every rule it enforces, and
// so these can never be a second copy of the engine's numbers.
export { DAILY_CAP, MIN_IMPROVEMENT_DELTA, MIN_IMPROVEMENT_SAMPLES };

/**
 * The most one event of each kind can ever be worth.
 *
 * Ceilings, not values: the engine's own numbers are lower, and a test drives
 * the engine to prove it cannot exceed these. Anything above is a forgery.
 */
export const MAX_POINTS: Record<PointKind, number> = {
    attempt: 6,
    clear: 6,
    strong: 11,
    review: 3,
    improvement: 15,
    mastery: 20,
    session: 25,
    streak: 50,
};

/** Events accepted in one request. */
export const MAX_EVENTS_PER_SYNC = 200;

/** How far back an event may be dated. Older than this and it is not news. */
export const MAX_EVENT_AGE_MS = 7 * 86_400_000;

/** Allowance for a client clock that runs fast. */
export const CLOCK_SKEW_MS = 5 * 60_000;

/** Events of these kinds accepted per user per day. */
export const DAILY_KIND_LIMIT: Partial<Record<PointKind, number>> = {
    streak: 1,
    session: 4,
};

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;

/** Names nobody gets to take, because taking them is a way of lying. */
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'system', 'norsk uttale', 'root'];

export interface SubmittedEvent {
    id: string;
    kind: PointKind;
    points: number;
    /** Epoch milliseconds, from the client's clock. */
    at: number;
    /** CEFR level, where the stage had one. */
    cefr?: string;
}

export type Check<T> = { ok: true; value: T } | { ok: false; reason: string };

const ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

/** The levels a board can be filtered by. Mirrors CEFR_LEVELS in the engine. */
export const LEVELS: readonly string[] = ['A1', 'A1+', 'A2', 'B1', 'B2'];

export const isPointKind = (value: unknown): value is PointKind =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(MAX_POINTS, value);

/**
 * Whether one submitted event is possible.
 *
 * Rejects rather than clamps. A clamped event is a silent lie about what
 * happened; a rejected one shows up in the response and can be counted.
 */
export function validateEvent(raw: unknown, now: number): Check<SubmittedEvent> {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-an-object' };
    const event = raw as Record<string, unknown>;

    if (typeof event.id !== 'string' || !ID_PATTERN.test(event.id)) {
        return { ok: false, reason: 'bad-id' };
    }
    if (!isPointKind(event.kind)) return { ok: false, reason: 'unknown-kind' };
    if (typeof event.points !== 'number' || !Number.isInteger(event.points)) {
        return { ok: false, reason: 'points-not-an-integer' };
    }
    // Zero and negative are as much a forgery as a billion: the engine never
    // emits them, so their presence means the payload was hand-written.
    if (event.points < 1) return { ok: false, reason: 'points-too-low' };
    if (event.points > MAX_POINTS[event.kind]) return { ok: false, reason: 'points-too-high' };

    if (typeof event.at !== 'number' || !Number.isFinite(event.at)) {
        return { ok: false, reason: 'bad-timestamp' };
    }
    if (event.at > now + CLOCK_SKEW_MS) return { ok: false, reason: 'from-the-future' };
    if (event.at < now - MAX_EVENT_AGE_MS) return { ok: false, reason: 'too-old' };

    let cefr: string | undefined;
    if (event.cefr !== undefined) {
        if (typeof event.cefr !== 'string' || !LEVELS.includes(event.cefr)) {
            return { ok: false, reason: 'bad-level' };
        }
        cefr = event.cefr;
    }

    return {
        ok: true,
        value: { id: event.id, kind: event.kind, points: event.points, at: event.at, ...(cefr ? { cefr } : {}) },
    };
}

/**
 * A nickname fit to show other people.
 *
 * Letters in any script, digits, and single spaces or one of - _ between them.
 * No control characters, no impersonating the app. This is not moderation — a
 * determined person will still find something rude — it is the floor below
 * which a name is not a name.
 */
export function sanitizeNickname(raw: unknown): Check<string> {
    if (typeof raw !== 'string') return { ok: false, reason: 'not-a-string' };

    // Strip control characters, then collapse runs of whitespace.
    const cleaned = [...raw]
        .filter(character => {
            const code = character.codePointAt(0) ?? 0;
            return code > 31 && code !== 127;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleaned.length < NICKNAME_MIN) return { ok: false, reason: 'too-short' };
    if (cleaned.length > NICKNAME_MAX) return { ok: false, reason: 'too-long' };
    // Letters in any script, digits, and single spaces or one of - _ between
    // them. That allow-list is also what keeps links out: every URL needs a
    // colon, a slash or a dot, and none of those are in it. An explicit
    // "looks like a link" rule used to sit here and could never fire.
    if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(cleaned)) return { ok: false, reason: 'bad-characters' };
    if (RESERVED.includes(cleaned.toLowerCase())) return { ok: false, reason: 'reserved' };

    return { ok: true, value: cleaned };
}

/** The form two nicknames are compared in, for collision detection. */
export const nicknameKey = (nickname: string): string =>
    nickname.toLowerCase().replace(/[\s_-]+/g, '');

/**
 * A submitted improvement figure that is worth ranking.
 *
 * The server cannot recompute this — it never sees the individual scores, by
 * design — so it does the next best thing and refuses anything outside the
 * range a real change in median score can occupy, with a sample floor beneath
 * it. See server/README.md for why this one number is trusted more than the
 * others, and what that is worth.
 */
export function validateImprovement(
    raw: unknown
): Check<{ delta: number; samples: number; baseline: number }> {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-an-object' };
    const value = raw as Record<string, unknown>;

    const delta = value.delta;
    const samples = value.samples;
    const baseline = value.baseline;

    if (typeof delta !== 'number' || !Number.isFinite(delta) || Math.abs(delta) > 100) {
        return { ok: false, reason: 'bad-delta' };
    }
    if (typeof samples !== 'number' || !Number.isInteger(samples) || samples < MIN_IMPROVEMENT_SAMPLES) {
        return { ok: false, reason: 'too-few-samples' };
    }
    if (
        typeof baseline !== 'number' ||
        !Number.isInteger(baseline) ||
        baseline < MIN_IMPROVEMENT_SAMPLES
    ) {
        return { ok: false, reason: 'too-small-baseline' };
    }

    return { ok: true, value: { delta: Math.round(delta * 10) / 10, samples, baseline } };
}

/**
 * How much of a day's budget a set of events would use.
 *
 * The server calls this with everything it has already accepted for that user
 * on that day, so the cap holds across requests and across devices rather than
 * per payload.
 */
export function budgetFor(spentToday: number, events: readonly SubmittedEvent[]): {
    accepted: SubmittedEvent[];
    rejected: { id: string; reason: string }[];
} {
    const accepted: SubmittedEvent[] = [];
    const rejected: { id: string; reason: string }[] = [];
    let spent = spentToday;

    for (const event of events) {
        if (spent + event.points > DAILY_CAP) {
            rejected.push({ id: event.id, reason: 'daily-cap' });
            continue;
        }
        spent += event.points;
        accepted.push(event);
    }

    return { accepted, rejected };
}
