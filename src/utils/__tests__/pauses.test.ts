import { describe, expect, it } from 'vitest';
import { pausesFrom, pausesIn, PAUSE_SECONDS } from '../pauses';
import { frameRms } from '../audioFrames';

/**
 * Pause measurement against audio built to order.
 *
 * Every case here is a clip whose right answer is known by construction, so a
 * failure means the measurement is wrong rather than that a real recording was
 * ambiguous. The cases that matter most are the ones where the honest answer is
 * "nothing": a dead microphone must not come back as a candidate who said
 * nothing, because a caller would then report silence as a finding.
 */

const RATE = 16_000;

/**
 * Build a clip from a script of alternating sound and silence.
 *
 * @param spans Seconds, starting with sound: [sound, silence, sound, ...].
 */
function clip(spans: number[], amplitude = 0.4): Float32Array {
    const total = spans.reduce((sum, span) => sum + span, 0);
    const data = new Float32Array(Math.round(total * RATE));
    let at = 0;
    spans.forEach((span, index) => {
        const samples = Math.round(span * RATE);
        if (index % 2 === 0) {
            // A 200 Hz tone stands in for voice: loud, and loud consistently.
            for (let i = 0; i < samples; i++) {
                data[at + i] = amplitude * Math.sin((2 * Math.PI * 200 * i) / RATE);
            }
        }
        at += samples;
    });
    return data;
}

describe('finding the pauses', () => {
    it('finds a single pause and places it', () => {
        const profile = pausesFrom(clip([1, 1.5, 1]), RATE);

        expect(profile.measured).toBe(true);
        expect(profile.pauses).toHaveLength(1);
        expect(profile.pauses[0].seconds).toBeCloseTo(1.5, 1);
        expect(profile.pauses[0].at).toBeCloseTo(1, 1);
        expect(profile.longest?.seconds).toBeCloseTo(1.5, 1);
    });

    it('ignores the ordinary machinery of speech', () => {
        // Gaps between clauses. Reporting these would bury the ones a listener
        // actually notices.
        const profile = pausesFrom(clip([1, 0.2, 1, 0.3, 1, 0.25, 1]), RATE);
        expect(profile.pauses).toEqual([]);
        expect(profile.longest).toBeNull();
        expect(profile.speaking).toBeCloseTo(4, 1);
    });

    it('does not count the take being open as a pause', () => {
        // Silence at either end is the app's doing — the microphone opened
        // before the candidate started and closed after they stopped. Three
        // seconds of each, around a clip whose only real pause is one second.
        const core = clip([2, 1, 2]);
        const padded = new Float32Array(RATE * 3 + core.length + RATE * 3);
        padded.set(core, RATE * 3);

        const profile = pausesFrom(padded, RATE);
        expect(profile.pauses).toHaveLength(1);
        expect(profile.pauses[0].seconds).toBeCloseTo(1, 1);
        // The clip really is eleven seconds long; only the pause count is
        // trimmed, so a caller can still say how long the take ran.
        expect(profile.duration).toBeCloseTo(11, 0);
        expect(profile.speaking).toBeCloseTo(4, 1);
    });

    it('works from frames directly, for a caller that already has them', () => {
        const framed = frameRms(clip([1, 1.5, 1]), RATE, 0.02);
        expect(pausesIn(framed).pauses).toHaveLength(1);
    });

    it('counts several pauses separately rather than summing them', () => {
        const profile = pausesFrom(clip([1, 0.8, 1, 2, 1, 0.9, 1]), RATE);
        expect(profile.pauses.map(p => Math.round(p.seconds * 10) / 10)).toEqual([0.8, 2, 0.9]);
        expect(profile.longest?.seconds).toBeCloseTo(2, 1);
    });

    it('takes the threshold from the caller', () => {
        const spans = [1, 0.8, 1];
        expect(pausesFrom(clip(spans), RATE, 0.5).pauses).toHaveLength(1);
        expect(pausesFrom(clip(spans), RATE, 1.5).pauses).toHaveLength(0);
    });
});

describe('refusing to measure', () => {
    it('reports a dead microphone as unmeasured, not as silence', () => {
        // The difference matters: a caller that read this as "spoke for zero
        // seconds" would report a broken recording as a finding about the
        // candidate.
        const profile = pausesFrom(new Float32Array(RATE * 5), RATE);
        expect(profile.measured).toBe(false);
        expect(profile.speaking).toBe(0);
        expect(profile.pauses).toEqual([]);
        expect(profile.longest).toBeNull();
    });

    it('reports an empty clip as unmeasured', () => {
        expect(pausesFrom(new Float32Array(0), RATE).measured).toBe(false);
    });

    it('measures a quiet speaker, because the threshold is relative', () => {
        // Same clip, a tenth of the level. A fixed threshold would call this
        // silence; the same person at the same distance records at wildly
        // different levels on different devices.
        const profile = pausesFrom(clip([1, 1.5, 1], 0.04), RATE);
        expect(profile.measured).toBe(true);
        expect(profile.pauses).toHaveLength(1);
    });
});

describe('the threshold is a published number, not a taste', () => {
    it('sits where ordinary speech machinery ends', () => {
        expect(PAUSE_SECONDS).toBe(0.6);
    });
});
