import { describe, expect, it } from 'vitest';
import { detectF0, findSpeechBounds } from '../pitch';

const RATE = 16_000;

/** A synthetic voiced sound: fundamental plus a couple of harmonics. */
function tone(hz: number, seconds = 0.04, amplitude = 0.4): Float32Array {
    const samples = Math.floor(seconds * RATE);
    const out = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const t = i / RATE;
        out[i] =
            amplitude *
            (Math.sin(2 * Math.PI * hz * t) +
                0.5 * Math.sin(2 * Math.PI * 2 * hz * t) +
                0.25 * Math.sin(2 * Math.PI * 3 * hz * t));
    }
    return out;
}

describe('detectF0', () => {
    it.each([98, 120, 150, 200, 260])('recovers a %i Hz fundamental', hz => {
        const detected = detectF0(tone(hz), RATE);
        expect(detected).not.toBeNull();
        // Within a semitone (~6%) is plenty for a contour display.
        expect(Math.abs((detected as number) - hz) / hz).toBeLessThan(0.06);
    });

    // Known limitation of autocorrelation: if the second harmonic overwhelmingly
    // dominates the fundamental (roughly 4:1 or more), the detector reports the
    // harmonic. Real speech does not usually look like that, and an octave slip on
    // an occasional frame is smoothed out by the median filter in extractPitch.
    it('finds the fundamental when it is somewhat weaker than its harmonic', () => {
        const samples = Math.floor(0.04 * RATE);
        const buf = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const t = i / RATE;
            buf[i] = 0.3 * Math.sin(2 * Math.PI * 130 * t) + 0.4 * Math.sin(2 * Math.PI * 260 * t);
        }
        const detected = detectF0(buf, RATE);
        expect(detected).not.toBeNull();
        expect(Math.abs((detected as number) - 130) / 130).toBeLessThan(0.06);
    });

    it('returns null for silence', () => {
        expect(detectF0(new Float32Array(640), RATE)).toBeNull();
    });

    it('returns null for white noise rather than inventing a pitch', () => {
        const noise = new Float32Array(640);
        // Deterministic pseudo-noise so the test cannot flake.
        let seed = 7;
        for (let i = 0; i < noise.length; i++) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            noise[i] = (seed / 2147483648) * 2 - 1;
        }
        expect(detectF0(noise, RATE)).toBeNull();
    });
});

describe('findSpeechBounds', () => {
    const RATE_B = 16_000;

    /** silence → tone → silence, in seconds. */
    function clip(leadIn: number, speech: number, tail: number): Float32Array {
        const total = Math.floor((leadIn + speech + tail) * RATE_B);
        const out = new Float32Array(total);
        const from = Math.floor(leadIn * RATE_B);
        const to = from + Math.floor(speech * RATE_B);
        for (let i = from; i < to; i++) {
            out[i] = 0.5 * Math.sin((2 * Math.PI * 140 * i) / RATE_B);
        }
        return out;
    }

    it('skips the pause before the learner starts speaking', () => {
        const bounds = findSpeechBounds(clip(1.0, 1.0, 0.5), RATE_B);
        expect(bounds).not.toBeNull();
        // Allow for the deliberate 60ms of padding either side.
        expect(bounds!.start).toBeGreaterThan(0.85);
        expect(bounds!.start).toBeLessThan(1.02);
    });

    it('stops at the end of speech rather than the end of the clip', () => {
        const bounds = findSpeechBounds(clip(0.5, 1.0, 1.5), RATE_B);
        expect(bounds).not.toBeNull();
        expect(bounds!.end).toBeGreaterThan(1.48);
        expect(bounds!.end).toBeLessThan(1.65);
        expect(bounds!.duration).toBeCloseTo(3.0, 1);
    });

    it('keeps a little padding so the first consonant is not clipped', () => {
        const withPad = findSpeechBounds(clip(1.0, 0.6, 0.4), RATE_B)!;
        expect(withPad.start).toBeLessThan(1.0);
    });

    it('returns null for a clip with no speech in it', () => {
        expect(findSpeechBounds(new Float32Array(RATE_B), RATE_B)).toBeNull();
    });

    it('does not trim a clip that is speech from end to end', () => {
        const bounds = findSpeechBounds(clip(0, 1.5, 0), RATE_B)!;
        expect(bounds.start).toBe(0);
        expect(bounds.end).toBeCloseTo(bounds.duration, 1);
    });
});
