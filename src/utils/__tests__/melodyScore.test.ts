import { describe, expect, it } from 'vitest';
import { dtw, resample } from '../dtw';
import { sampleContour, scoreMelody } from '../melodyScore';
import { contourFrom, toSemitones, type PitchContour } from '../pitch';
import { targetContour } from '../../data/tonelag';

describe('toSemitones', () => {
    it('is zero at the reference and 12 an octave up', () => {
        expect(toSemitones(200, 200)).toBe(0);
        expect(toSemitones(400, 200)).toBeCloseTo(12, 6);
        expect(toSemitones(100, 200)).toBeCloseTo(-12, 6);
    });

    it('gives the same answer for two voices an octave apart', () => {
        // A bass at 100 Hz and a soprano at 200 Hz, each a fifth above their
        // own median, must land on the same number — that is the whole point.
        expect(toSemitones(150, 100)).toBeCloseTo(toSemitones(300, 200), 6);
    });

    it('refuses to take the log of a non-positive frequency', () => {
        expect(toSemitones(0, 200)).toBe(0);
        expect(toSemitones(200, 0)).toBe(0);
    });
});

describe('contourFrom', () => {
    const RATE = 16_000;

    /** A tone that steps up a fixed number of semitones halfway through. */
    function twoTones(lowHz: number, highHz: number, seconds = 0.6): Float32Array {
        const samples = Math.floor(seconds * RATE);
        const out = new Float32Array(samples);
        let phase = 0;
        for (let i = 0; i < samples; i++) {
            const hz = i < samples / 2 ? lowHz : highHz;
            phase += (2 * Math.PI * hz) / RATE;
            out[i] = 0.4 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
        }
        return out;
    }

    it('normalises every voiced frame against the speaker’s own median', () => {
        const contour = contourFrom(twoTones(120, 180), RATE);
        expect(contour.medianHz).not.toBeNull();

        for (const point of contour.points) {
            if (point.hz === null) {
                expect(point.semitones).toBeNull();
            } else {
                expect(point.semitones).toBeCloseTo(toSemitones(point.hz, contour.medianHz!), 6);
            }
        }
    });

    it('spans the interval the speaker actually produced', () => {
        // 120 → 180 Hz is a fifth, about 7 semitones.
        const contour = contourFrom(twoTones(120, 180), RATE);
        const voiced = contour.points.filter(p => p.semitones !== null).map(p => p.semitones!);
        const spread = Math.max(...voiced) - Math.min(...voiced);
        expect(spread).toBeGreaterThan(6);
        expect(spread).toBeLessThan(8);
    });
});

describe('resample', () => {
    it('keeps the endpoints and interpolates between them', () => {
        expect(resample([0, 10], 3)).toEqual([0, 5, 10]);
        expect(resample([0, 1, 2, 3], 4)).toEqual([0, 1, 2, 3]);
    });

    it('handles degenerate inputs', () => {
        expect(resample([], 5)).toEqual([]);
        expect(resample([7], 3)).toEqual([7, 7, 7]);
    });
});

describe('dtw', () => {
    it('reports zero distance for identical sequences', () => {
        const a = [0, 1, 2, 3, 2, 1, 0];
        expect(dtw(a, a)?.distance).toBe(0);
    });

    it('measures a constant offset as that offset', () => {
        // Two level lines two semitones apart. Warping cannot help here, so the
        // distance is the gap itself.
        expect(dtw([1, 1, 1, 1], [3, 3, 3, 3])?.distance).toBeCloseTo(2, 6);
    });

    it('treats a shifted ramp as a shift in time, not in pitch', () => {
        // [0,1,2,3] against [2,3,4,5] is the same climb started earlier, and
        // that is exactly what DTW is supposed to see through — the cost is far
        // below the two-semitone difference a frame-for-frame read would give.
        const shifted = dtw([0, 1, 2, 3], [2, 3, 4, 5])!;
        expect(shifted.distance).toBeLessThan(2);
    });

    /** The property the whole approach rests on. */
    it('is blind to how fast the shape was produced', () => {
        const shape = [0, 1, 2, 3, 2, 1, 0];
        // The same rise and fall, delivered at half speed.
        const slow = shape.flatMap(v => [v, v]);

        const aligned = dtw(shape, slow)!;
        expect(aligned.distance).toBeLessThan(0.2);

        // Compared frame for frame instead, the two look nothing alike.
        const naive =
            shape.reduce((sum, v, i) => sum + Math.abs(v - slow[i]), 0) / shape.length;
        expect(naive).toBeGreaterThan(1);
    });

    it('walks a monotonic path across both sequences', () => {
        const path = dtw([0, 2, 4, 6], [0, 1, 2, 3, 4, 5, 6])!.path;
        expect(path[0]).toEqual({ a: 0, b: 0 });
        expect(path[path.length - 1]).toEqual({ a: 3, b: 6 });
        for (let i = 1; i < path.length; i++) {
            expect(path[i].a).toBeGreaterThanOrEqual(path[i - 1].a);
            expect(path[i].b).toBeGreaterThanOrEqual(path[i - 1].b);
        }
    });

    it('will not let one frame absorb the whole of the other sequence', () => {
        // A single held note against a rising ramp. Unbanded DTW would park the
        // ramp's whole length on whichever frame is cheapest; the band forces
        // it to keep moving, so the mismatch shows up in the distance.
        const held = new Array<number>(40).fill(0);
        const ramp = Array.from({ length: 40 }, (_, i) => i / 4);
        expect(dtw(held, ramp)!.distance).toBeGreaterThan(3);
    });

    it('returns null for an empty sequence', () => {
        expect(dtw([], [1, 2])).toBeNull();
        expect(dtw([1, 2], [])).toBeNull();
    });
});

// ---------------------------------------------------------------------------

/** A contour carrying a given semitone series over `seconds`. */
function contourOf(semitones: number[], seconds = 1): PitchContour {
    const points = semitones.map((st, i) => ({
        time: (i / Math.max(1, semitones.length - 1)) * seconds,
        hz: 120 * Math.pow(2, st / 12),
        semitones: st,
    }));
    return {
        points,
        voicedCount: points.length,
        medianHz: 120,
        minHz: Math.min(...points.map(p => p.hz)),
        maxHz: Math.max(...points.map(p => p.hz)),
        rangeSemitones: Math.max(...semitones) - Math.min(...semitones),
    };
}

const accent2 = (length: number) => sampleContour(targetContour('ACCENT_2'), length);
const accent1 = (length: number) => sampleContour(targetContour('ACCENT_1'), length);

describe('scoreMelody', () => {
    it('gives full marks to a contour that traces the target', () => {
        const result = scoreMelody(contourOf(accent2(64)), 'ACCENT_2')!;
        expect(result.score).toBe(100);
        expect(result.distance).toBeCloseTo(0, 3);
    });

    it('scores a flat delivery at zero', () => {
        // The failure mode this exists to catch: English-style monotone.
        const flat = scoreMelody(contourOf(new Array(64).fill(0)), 'ACCENT_2')!;
        expect(flat.score).toBe(0);
        expect(flat.distance).toBeCloseTo(flat.flatDistance, 6);
    });

    /** The reason DTW is here at all. */
    it('scores the same shape the same however slowly it was said', () => {
        const brisk = scoreMelody(contourOf(accent2(40), 0.5), 'ACCENT_2')!;
        const slow = scoreMelody(contourOf(accent2(200), 2.4), 'ACCENT_2')!;
        expect(brisk.score).toBeGreaterThan(95);
        expect(slow.score).toBeGreaterThan(95);
    });

    it('forgives an uneven delivery that still has the right shape', () => {
        // Same contour, but dawdling through the first half and hurrying the
        // second — what a learner concentrating on the opening actually does.
        const warped = Array.from({ length: 64 }, (_, i) => {
            const t = i / 63;
            return sampleContour(targetContour('ACCENT_2'), 1000)[Math.round(t ** 1.6 * 999)];
        });
        expect(scoreMelody(contourOf(warped), 'ACCENT_2')!.score).toBeGreaterThan(70);
    });

    it('tells the two accents apart', () => {
        // Accent 1 rises once; accent 2 falls and rises again. Saying one when
        // the other was asked for must not score like a match.
        const asAccent1 = scoreMelody(contourOf(accent1(64)), 'ACCENT_1')!;
        const mismatched = scoreMelody(contourOf(accent1(64)), 'ACCENT_2')!;
        expect(asAccent1.score).toBe(100);
        expect(mismatched.score).toBeLessThan(50);
    });

    it('hands back the target on the learner’s own timeline', () => {
        const result = scoreMelody(contourOf(accent2(64), 1.8), 'ACCENT_2')!;
        expect(result.alignedTarget.length).toBeGreaterThan(0);
        const times = result.alignedTarget.map(p => p.time);
        expect(times[0]).toBeCloseTo(0, 3);
        expect(times[times.length - 1]).toBeCloseTo(1.8, 3);
        // Strictly increasing, so it can be drawn as a path.
        for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    });

    it('declines to score when there is nothing to compare', () => {
        expect(scoreMelody(null, 'ACCENT_2')).toBeNull();
        expect(scoreMelody(contourOf(accent2(64)), 'NONE')).toBeNull();
        // A couple of voiced frames is not a melody.
        expect(scoreMelody(contourOf([0, 1, 2]), 'ACCENT_2')).toBeNull();
    });
});
