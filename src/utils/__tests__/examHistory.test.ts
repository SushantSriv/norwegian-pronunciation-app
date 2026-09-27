import { beforeEach, describe, expect, it } from 'vitest';
import { forgetHistory, previousAt, readHistory, remember, type ExamRun } from '../examHistory';

/**
 * The local history, including the promise that it holds nothing it should not.
 *
 * The privacy test is the one that matters here. A rehearsal is somebody
 * describing their own family, their own job and their own opinions out loud,
 * and the mode's whole claim is that none of that is kept. So the stored JSON
 * is walked for anything that looks like speech, rather than the type being
 * trusted to have prevented it.
 */

const run = (overrides: Partial<ExamRun> = {}): ExamRun => ({
    at: '2026-09-27T10:00:00.000Z',
    nivaa: 'A2-B1',
    elapsedMs: 1_200_000,
    speaking: 180,
    tokens: 320,
    pauses: 4,
    longestPause: 2.1,
    skipped: 1,
    ...overrides,
});

beforeEach(() => {
    window.localStorage.clear();
});

describe('keeping runs', () => {
    it('starts empty and returns newest first', () => {
        expect(readHistory()).toEqual([]);

        remember(run({ at: '2026-09-20T10:00:00.000Z' }));
        remember(run({ at: '2026-09-27T10:00:00.000Z' }));

        expect(readHistory().map(r => r.at)).toEqual([
            '2026-09-27T10:00:00.000Z',
            '2026-09-20T10:00:00.000Z',
        ]);
    });

    it('caps the history rather than growing forever', () => {
        for (let i = 0; i < 60; i++) remember(run({ tokens: i }));
        expect(readHistory()).toHaveLength(40);
        // The newest survive.
        expect(readHistory()[0].tokens).toBe(59);
    });

    it('forgets everything on request', () => {
        remember(run());
        forgetHistory();
        expect(readHistory()).toEqual([]);
    });

    it('survives storage holding something that is not a history', () => {
        window.localStorage.setItem('npa-muntlig-historikk-v1', '{"nope":true}');
        expect(readHistory()).toEqual([]);

        window.localStorage.setItem('npa-muntlig-historikk-v1', 'not json at all');
        expect(readHistory()).toEqual([]);
    });

    it('drops entries that are not runs rather than returning them', () => {
        window.localStorage.setItem(
            'npa-muntlig-historikk-v1',
            JSON.stringify([run(), null, 42, { at: 5 }])
        );
        expect(readHistory()).toHaveLength(1);
    });
});

describe('what is stored', () => {
    it('never writes audio or anything said', () => {
        remember(run());
        const stored = window.localStorage.getItem('npa-muntlig-historikk-v1') ?? '';

        // Nothing that could be a transcript, a data URI or a blob handle.
        expect(stored).not.toMatch(/blob:/);
        expect(stored).not.toMatch(/data:audio/);
        expect(stored).not.toMatch(/base64/i);

        // Every value is a number, a short ISO date, or the level. Anything
        // else has no business being here.
        const [entry] = JSON.parse(stored) as Record<string, unknown>[];
        for (const [key, value] of Object.entries(entry)) {
            if (value === null || typeof value === 'number') continue;
            expect(typeof value, key).toBe('string');
            expect((value as string).length, key).toBeLessThanOrEqual(30);
        }
    });

    it('keeps exactly the fields the summary showed and no others', () => {
        remember(run());
        expect(Object.keys(readHistory()[0]).sort()).toEqual([
            'at',
            'elapsedMs',
            'longestPause',
            'nivaa',
            'pauses',
            'skipped',
            'speaking',
            'tokens',
        ]);
    });
});

describe('comparing to your past self', () => {
    it('finds the previous run at the same level', () => {
        remember(run({ at: '2026-09-01T10:00:00.000Z', nivaa: 'A2-B1', pauses: 9 }));
        remember(run({ at: '2026-09-10T10:00:00.000Z', nivaa: 'B1-B2', pauses: 2 }));
        remember(run({ at: '2026-09-20T10:00:00.000Z', nivaa: 'A2-B1', pauses: 4 }));

        // The levels are different exams; a pause count from one says nothing
        // about the other, so B1-B2 is skipped rather than being the previous.
        expect(previousAt(readHistory(), 'A2-B1')?.pauses).toBe(9);
    });

    it('has nothing to compare against on a first run', () => {
        remember(run());
        expect(previousAt(readHistory(), 'A2-B1')).toBeNull();
        expect(previousAt(readHistory(), 'A1-A2')).toBeNull();
    });
});
