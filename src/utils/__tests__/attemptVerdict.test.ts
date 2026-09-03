import { describe, expect, it } from 'vitest';
import { coveredSeconds, judgeAttempt } from '../attemptVerdict';
import type { SpeechBounds } from '../pitch';

const speechOf = (start: number, end: number): SpeechBounds => ({
    start,
    end,
    duration: end + 0.5,
});

describe('coveredSeconds', () => {
    it('adds up the spans', () => {
        expect(
            coveredSeconds([
                { word: 'god', start: 0, end: 0.4 },
                { word: 'morgen', start: 0.5, end: 1.1 },
            ])
        ).toBeCloseTo(1.0, 6);
    });

    it('does not count overlapping spans twice', () => {
        // Whisper's spans butt up against each other and occasionally overlap.
        expect(
            coveredSeconds([
                { word: 'a', start: 0, end: 1 },
                { word: 'b', start: 0.5, end: 1.5 },
            ])
        ).toBeCloseTo(1.5, 6);
    });

    it('is order-independent and empty-safe', () => {
        expect(coveredSeconds([])).toBe(0);
        expect(
            coveredSeconds([
                { word: 'b', start: 1, end: 2 },
                { word: 'a', start: 0, end: 0.5 },
            ])
        ).toBeCloseTo(1.5, 6);
    });
});

describe('judgeAttempt', () => {
    it('reduces to pass/fail when no audio evidence was gathered', () => {
        // The scoring-only callers must keep working unchanged: with nothing
        // measured, there is no basis for claiming the model misheard.
        expect(judgeAttempt({ heard: 'god morgen', passed: true })).toMatchObject({
            outcome: 'good',
            counts: true,
        });
        expect(judgeAttempt({ heard: 'noe helt annet', passed: false })).toMatchObject({
            outcome: 'mispronounced',
            counts: true,
        });
    });

    it('calls an empty transcript no speech, and does not charge for it', () => {
        const verdict = judgeAttempt({ heard: '   ', passed: false });
        expect(verdict.outcome).toBe('no-speech');
        expect(verdict.counts).toBe(false);
    });

    it('treats a recording with no detected speech as nothing said', () => {
        const verdict = judgeAttempt({ heard: 'god morgen', passed: false, speech: null });
        expect(verdict.outcome).toBe('no-speech');
        expect(verdict.counts).toBe(false);
    });

    it('ignores a click too short to be an attempt', () => {
        const verdict = judgeAttempt({
            heard: 'hei',
            passed: false,
            speech: speechOf(0, 0.1),
        });
        expect(verdict.outcome).toBe('no-speech');
    });

    it('flags recognition as uncertain when it accounted for little of the speech', () => {
        // Two seconds of speech, and the model placed words over a fifth of a
        // second of it. That is evidence it dropped audio, not that the learner
        // mispronounced anything.
        const verdict = judgeAttempt({
            heard: 'hei',
            passed: false,
            speech: speechOf(0.2, 2.2),
            words: [{ word: 'hei', start: 0.3, end: 0.5 }],
        });
        expect(verdict.outcome).toBe('uncertain');
        expect(verdict.counts).toBe(false);
        expect(verdict.message).toMatch(/uncertain/i);
    });

    it('trusts a transcript that covers the speech', () => {
        const verdict = judgeAttempt({
            heard: 'jeg kjøpte en ny bil',
            passed: false,
            speech: speechOf(0.1, 2.1),
            words: [
                { word: 'jeg', start: 0.15, end: 0.45 },
                { word: 'kjøpte', start: 0.45, end: 1.0 },
                { word: 'en', start: 1.0, end: 1.2 },
                { word: 'ny', start: 1.2, end: 1.5 },
                { word: 'bil', start: 1.5, end: 2.05 },
            ],
        });
        expect(verdict.outcome).toBe('mispronounced');
        expect(verdict.counts).toBe(true);
    });

    /**
     * The line this module deliberately does not cross. A learner who says
     * something quite different must still be marked wrong: an app that never
     * says you were wrong teaches nothing.
     */
    it('does not excuse a wrong answer just because it scored badly', () => {
        const verdict = judgeAttempt({
            heard: 'helt andre ord her nå',
            passed: false,
            speech: speechOf(0, 2),
            words: [
                { word: 'helt', start: 0.0, end: 0.4 },
                { word: 'andre', start: 0.4, end: 0.9 },
                { word: 'ord', start: 0.9, end: 1.2 },
                { word: 'her', start: 1.2, end: 1.6 },
                { word: 'nå', start: 1.6, end: 2.0 },
            ],
        });
        expect(verdict.outcome).toBe('mispronounced');
        expect(verdict.counts).toBe(true);
    });

    it('makes no claim when the model gave no word spans', () => {
        const verdict = judgeAttempt({
            heard: 'god morgen',
            passed: true,
            speech: speechOf(0, 2),
            words: [],
        });
        expect(verdict.outcome).toBe('good');
        expect(verdict.counts).toBe(true);
    });
});
