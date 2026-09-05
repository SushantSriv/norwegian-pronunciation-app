import { describe, expect, it } from 'vitest';
import {
    budgetFor,
    CLOCK_SKEW_MS,
    DAILY_CAP,
    MAX_EVENT_AGE_MS,
    MAX_POINTS,
    nicknameKey,
    sanitizeNickname,
    validateEvent,
    validateImprovement,
    type SubmittedEvent,
} from '../leaderboardRules';

const NOW = Date.UTC(2026, 0, 5, 10);

const event = (over: Partial<SubmittedEvent> = {}): Record<string, unknown> => ({
    id: 'a1b2c3d4e5f60718',
    kind: 'clear',
    points: 5,
    at: NOW - 1000,
    ...over,
});

const accept = (over: Partial<SubmittedEvent> = {}) => validateEvent(event(over), NOW);

describe('validateEvent — what a modified client cannot get past', () => {
    it('accepts an ordinary event', () => {
        const result = accept();
        expect(result.ok).toBe(true);
    });

    it('refuses an absurd point value', () => {
        expect(accept({ points: 999_999 })).toEqual({ ok: false, reason: 'points-too-high' });
    });

    it('refuses one point more than the kind can ever be worth', () => {
        expect(accept({ kind: 'clear', points: MAX_POINTS.clear })).toMatchObject({ ok: true });
        expect(accept({ kind: 'clear', points: MAX_POINTS.clear + 1 })).toMatchObject({
            ok: false,
        });
    });

    it('refuses negative and zero points', () => {
        expect(accept({ points: -50 })).toEqual({ ok: false, reason: 'points-too-low' });
        expect(accept({ points: 0 })).toEqual({ ok: false, reason: 'points-too-low' });
    });

    it('refuses fractional points, which the engine never emits', () => {
        expect(accept({ points: 5.5 })).toEqual({ ok: false, reason: 'points-not-an-integer' });
    });

    it('refuses a kind it has never heard of', () => {
        expect(accept({ kind: 'jackpot' as SubmittedEvent['kind'] })).toEqual({
            ok: false,
            reason: 'unknown-kind',
        });
    });

    it('refuses an event dated in the future', () => {
        expect(accept({ at: NOW + CLOCK_SKEW_MS + 1000 })).toEqual({
            ok: false,
            reason: 'from-the-future',
        });
    });

    it('allows for a client clock that runs a little fast', () => {
        expect(accept({ at: NOW + CLOCK_SKEW_MS - 1000 })).toMatchObject({ ok: true });
    });

    it('refuses an old result being replayed', () => {
        expect(accept({ at: NOW - MAX_EVENT_AGE_MS - 1000 })).toEqual({
            ok: false,
            reason: 'too-old',
        });
    });

    it('refuses an id it could not de-duplicate on', () => {
        expect(accept({ id: '' })).toEqual({ ok: false, reason: 'bad-id' });
        expect(accept({ id: 'short' })).toEqual({ ok: false, reason: 'bad-id' });
        expect(accept({ id: 'x'.repeat(200) })).toEqual({ ok: false, reason: 'bad-id' });
        expect(accept({ id: "'; DROP TABLE events; --" })).toEqual({ ok: false, reason: 'bad-id' });
    });

    it('refuses a level that is not one of the app’s own', () => {
        expect(accept({ cefr: 'C2' })).toEqual({ ok: false, reason: 'bad-level' });
        expect(accept({ cefr: 'B1' })).toMatchObject({ ok: true });
    });

    it('refuses junk that is not an event at all', () => {
        expect(validateEvent(null, NOW).ok).toBe(false);
        expect(validateEvent('5000 points please', NOW).ok).toBe(false);
        expect(validateEvent([], NOW).ok).toBe(false);
    });

    it('keeps only the fields it knows about', () => {
        const result = validateEvent({ ...event(), nickname: 'admin', points_: 99 }, NOW);
        expect(result.ok && Object.keys(result.value).sort()).toEqual(['at', 'id', 'kind', 'points']);
    });
});

describe('budgetFor — the daily ceiling, across requests', () => {
    const events = (count: number, points: number): SubmittedEvent[] =>
        Array.from({ length: count }, (_, i) => ({
            id: `event${String(i).padStart(12, '0')}`,
            kind: 'clear' as const,
            points,
            at: NOW,
        }));

    it('takes everything inside the budget', () => {
        const { accepted, rejected } = budgetFor(0, events(10, 5));
        expect(accepted).toHaveLength(10);
        expect(rejected).toHaveLength(0);
    });

    it('refuses what would breach the cap, and says why', () => {
        const { accepted, rejected } = budgetFor(DAILY_CAP - 5, events(3, 5));
        expect(accepted).toHaveLength(1);
        expect(rejected).toHaveLength(2);
        expect(rejected[0].reason).toBe('daily-cap');
    });

    it('holds even when a cheat spreads the day over many requests', () => {
        let spent = 0;
        let taken = 0;
        for (let request = 0; request < 100; request++) {
            const { accepted } = budgetFor(spent, events(20, 5));
            taken += accepted.reduce((sum, one) => sum + one.points, 0);
            spent = taken;
        }
        expect(taken).toBe(DAILY_CAP);
    });
});

describe('sanitizeNickname', () => {
    it('accepts a plain name and gives back the cleaned form', () => {
        expect(sanitizeNickname('  Fjord  Fox ')).toEqual({ ok: true, value: 'Fjord Fox' });
    });

    it('refuses what is not a string at all', () => {
        expect(sanitizeNickname(undefined).ok).toBe(false);
        expect(sanitizeNickname({ toString: () => 'admin' }).ok).toBe(false);
    });

    it('compares names for collision without punctuation or case', () => {
        expect(nicknameKey('Fjord Fox')).toBe(nicknameKey('fjord_fox'));
        expect(nicknameKey('FjordFox')).toBe(nicknameKey('Fjord-Fox'));
        expect(nicknameKey('FjordFox')).not.toBe(nicknameKey('FjordFox2'));
    });
});

describe('validateImprovement', () => {
    const improvement = { delta: 12.4, samples: 30, baseline: 25 };

    it('accepts a figure with enough behind it', () => {
        expect(validateImprovement(improvement)).toEqual({ ok: true, value: improvement });
    });

    it('refuses a change larger than the score range allows', () => {
        expect(validateImprovement({ ...improvement, delta: 5000 }).ok).toBe(false);
    });

    it('refuses a figure computed from too few attempts', () => {
        expect(validateImprovement({ ...improvement, samples: 2 }).ok).toBe(false);
        expect(validateImprovement({ ...improvement, baseline: 0 }).ok).toBe(false);
    });

    it('refuses a new learner with no baseline to improve on', () => {
        expect(validateImprovement({ delta: 40, samples: 40, baseline: 0 }).ok).toBe(false);
    });

    it('refuses nonsense', () => {
        expect(validateImprovement(null).ok).toBe(false);
        expect(validateImprovement({ delta: Infinity, samples: 30, baseline: 30 }).ok).toBe(false);
        expect(validateImprovement({ delta: 'lots', samples: 30, baseline: 30 }).ok).toBe(false);
    });
});
