import { describe, expect, it } from 'vitest';
import { buildReport, countTokens, EVIDENCE, type TakeEvidence } from '../criteriaReport';
import type { PauseProfile } from '../pauses';

/**
 * The report against its own promises.
 *
 * The promises are negative ones — no score, no level, no number without its
 * footnote, nothing at all from too little speech — so most of these tests
 * assert that something is ABSENT. That is the right shape: the failure mode
 * this module exists to prevent is a number appearing where none is warranted,
 * and a test that only checked the happy path would not see it.
 */

const profile = (overrides: Partial<PauseProfile> = {}): PauseProfile => ({
    duration: 60,
    speaking: 50,
    pauses: [],
    longest: null,
    measured: true,
    ...overrides,
});

/** Enough words to clear the gate, without writing sixty by hand. */
const manyWords = (count: number) => Array.from({ length: count }, () => 'ord').join(' ');

const take = (overrides: Partial<TakeEvidence> = {}): TakeEvidence => ({
    segmentId: 'a',
    assessed: true,
    transcript: manyWords(80),
    pauses: profile(),
    ...overrides,
});

describe('the four criteria', () => {
    it('always lists all four, in the order the skjema prints them', () => {
        const report = buildReport([take()]);
        expect(report.rows.map(row => row.kriterium)).toEqual([
            'flyt',
            'uttale',
            'ordforrad',
            'grammatikk',
        ]);
    });

    it('measures none of the three that cannot be measured honestly, and says why', () => {
        const report = buildReport([take()]);
        for (const row of report.rows.filter(r => r.kriterium !== 'flyt')) {
            expect(row.finding, row.kriterium).toBeNull();
            expect(row.footnote, row.kriterium).toBeNull();
            expect(row.whyNot, row.kriterium).toBeTruthy();
        }
    });

    it('never prints a number without saying what it is a number of', () => {
        // A figure with no footnote is a figure a learner reads as a grade.
        for (const row of buildReport([take()]).rows) {
            if (row.finding === null) continue;
            expect(row.footnote, row.kriterium).toBeTruthy();
        }
    });

    it('never produces a score, a band or a level', () => {
        const report = buildReport([
            take({ pauses: profile({ pauses: [{ at: 4, seconds: 1.2 }], longest: { at: 4, seconds: 1.2 } }) }),
        ]);
        const printed = report.rows
            .flatMap(row => [row.finding, row.footnote, row.whyNot])
            .filter(Boolean)
            .join(' ');

        // No CEFR level anywhere, and nothing shaped like a mark.
        expect(printed).not.toMatch(/\b[AB][12]\b/);
        expect(printed).not.toMatch(/\d+\s*(?:%|av 100|\/\s*100|poeng)/i);
        expect(Object.keys(report)).toEqual(['evidence', 'rows']);
    });
});

describe('the evidence gate', () => {
    it('reports nothing at all from too little speech', () => {
        const report = buildReport([
            take({ transcript: 'jeg heter ola', pauses: profile({ speaking: 6 }) }),
        ]);

        expect(report.evidence.enough).toBe(false);
        expect(report.rows.every(row => row.finding === null)).toBe(true);
        expect(report.rows[0].whyNot).toContain('for lite å gå på');
    });

    it('names both shortfalls, so it is clear what is missing', () => {
        const report = buildReport([take({ transcript: 'kort', pauses: profile({ speaking: 5 }) })]);
        expect(report.evidence.shortfall).toContain('sekunder');
        expect(report.evidence.shortfall).toContain('ord');
    });

    it('passes once there is both enough time and enough said', () => {
        const report = buildReport([
            take({ transcript: manyWords(EVIDENCE.tokens), pauses: profile({ speaking: EVIDENCE.seconds }) }),
        ]);
        expect(report.evidence.enough).toBe(true);
        expect(report.rows[0].finding).toBeTruthy();
    });

    it('will not pass on words alone when nothing could be measured', () => {
        // The microphone can be taken by the speech service, leaving a
        // transcript and no audio. That is not evidence of fluency.
        const report = buildReport([take({ pauses: null })]);
        expect(report.evidence.seconds).toBeNull();
        expect(report.evidence.enough).toBe(false);
        expect(report.evidence.shortfall).toContain('kunne måles');
    });

    it('does not read an unmeasurable recording as zero seconds of speech', () => {
        const report = buildReport([take({ pauses: profile({ measured: false, speaking: 0 }) })]);
        expect(report.evidence.seconds).toBeNull();
    });
});

describe('what counts towards the evidence', () => {
    it('leaves the warm-up out, because the real exam does', () => {
        const report = buildReport([
            take({ segmentId: 'oppvarming', assessed: false, transcript: manyWords(200) }),
            take({ segmentId: 'a', transcript: manyWords(10), pauses: profile({ speaking: 8 }) }),
        ]);
        expect(report.evidence.tokens).toBe(10);
        expect(report.evidence.enough).toBe(false);
    });

    it('adds the assessed takes together', () => {
        const report = buildReport([
            take({ segmentId: 'a', transcript: manyWords(40), pauses: profile({ speaking: 20 }) }),
            take({ segmentId: 'c', transcript: manyWords(40), pauses: profile({ speaking: 20 }) }),
        ]);
        expect(report.evidence.tokens).toBe(80);
        expect(report.evidence.seconds).toBe(40);
        expect(report.evidence.enough).toBe(true);
    });
});

describe('the flyt row', () => {
    it('reports the pauses and the longest of them', () => {
        const report = buildReport([
            take({
                pauses: profile({
                    pauses: [
                        { at: 3, seconds: 0.9 },
                        { at: 12, seconds: 2.4 },
                    ],
                    longest: { at: 12, seconds: 2.4 },
                }),
            }),
        ]);
        expect(report.rows[0].finding).toContain('2 pauser');
        expect(report.rows[0].finding).toContain('2,4');
    });

    it('says so plainly when there were none', () => {
        expect(buildReport([take()]).rows[0].finding).toContain('Ingen pauser');
    });

    it('says what a pause cannot tell apart, next to the number', () => {
        const footnote = buildReport([take()]).rows[0].footnote ?? '';
        expect(footnote).toContain('mikrofonbortfall');
        expect(footnote).toContain('fyllord');
        expect(footnote).toContain('ikke en vurdering av flyt');
    });
});

describe('counting words', () => {
    it('counts words and not punctuation or noise', () => {
        expect(countTokens('jeg heter ola , og jeg er 42 .')).toBe(6);
        expect(countTokens('   ')).toBe(0);
        expect(countTokens('')).toBe(0);
    });
});
