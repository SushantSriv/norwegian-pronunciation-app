import { describe, expect, it } from 'vitest';
import { judgeAttempt } from '../attemptVerdict';
import type { SpeechBounds } from '../pitch';

const speechOf = (start: number, end: number): SpeechBounds => ({
    start,
    end,
    duration: end + 0.5,
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


    it('trusts a transcript when speech was clearly heard', () => {
        const verdict = judgeAttempt({
            heard: 'jeg kjøpte en ny bil',
            passed: false,
            speech: speechOf(0.1, 2.1),
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
        });
        expect(verdict.outcome).toBe('mispronounced');
        expect(verdict.counts).toBe(true);
    });

});
