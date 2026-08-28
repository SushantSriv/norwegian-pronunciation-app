/**
 * Scoring the learner's melody against the pitch accent they were aiming for.
 *
 * Two normalisations have to happen before the comparison means anything:
 *
 *   - PITCH, handled in pitch.ts: everything is in semitones relative to the
 *     speaker's own median, so a bass and a soprano saying the same word come
 *     out identical.
 *   - PACE, handled here with DTW: a learner is usually slower than the
 *     reference, and comparing frame-for-frame would mark a correctly shaped
 *     but unhurried delivery as wrong.
 *
 * What is left after both is the shape of the melody, which is the thing pitch
 * accent actually is.
 */
import { dtw, resample, type DtwStep } from './dtw';
import type { PitchContour } from './pitch';
import { targetContour, type ContourPoint, type PitchAccent } from '../data/tonelag';

/**
 * Points each contour is resampled to before aligning.
 *
 * The target is a handful of control points and a recording is a few hundred
 * frames; putting both on the same modest grid keeps the warping band
 * meaningful and the cost matrix small (64² cells, computed on every result
 * screen).
 */
const RESOLUTION = 64;

/** Below this there is not enough voiced sound to read a melody from. */
const MIN_VOICED_FRAMES = 8;

export interface AlignedPoint {
    /** Seconds into the recording — the learner's own timeline. */
    time: number;
    /** Where the target contour sits at this moment, in semitones. */
    semitones: number;
}

export interface MelodyScore {
    /**
     * 0-100. 100 is tracking the target exactly; 0 is no closer to it than a
     * completely flat delivery would be, which is the failure mode this is
     * meant to catch.
     */
    score: number;
    /** Mean semitone gap between the two contours once aligned. */
    distance: number;
    /** What a monotone delivery would have scored, for the same accent. */
    flatDistance: number;
    /**
     * The target contour warped onto the learner's timeline, so a chart can
     * draw the two against each other rather than side by side.
     */
    alignedTarget: AlignedPoint[];
}

/** Sample a contour's control points at `length` evenly spaced positions. Exported for tests. */
export function sampleContour(points: ContourPoint[], length: number): number[] {
    if (!points.length) return [];
    const out: number[] = [];
    for (let i = 0; i < length; i++) {
        const t = length === 1 ? 0 : i / (length - 1);
        // The first control point at or after t, so we can interpolate back.
        let next = points.findIndex(p => p.t >= t);
        if (next === -1) next = points.length - 1;
        if (next === 0) {
            out.push(points[0].semitones);
            continue;
        }
        const before = points[next - 1];
        const after = points[next];
        const span = after.t - before.t;
        const fraction = span > 0 ? (t - before.t) / span : 0;
        out.push(before.semitones + (after.semitones - before.semitones) * fraction);
    }
    return out;
}

/** Average of the target values each user frame ended up aligned with. */
function warpTargetOntoUser(
    path: DtwStep[],
    targetValues: number[],
    userTimes: number[]
): AlignedPoint[] {
    const sums = new Map<number, { total: number; count: number }>();
    for (const step of path) {
        const bucket = sums.get(step.a) ?? { total: 0, count: 0 };
        bucket.total += targetValues[step.b];
        bucket.count += 1;
        sums.set(step.a, bucket);
    }
    return [...sums.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([index, { total, count }]) => ({
            time: userTimes[index],
            semitones: total / count,
        }));
}

/**
 * How much closer the better-fitting accent has to be before we name it.
 *
 * The two contours are only a few semitones apart at their widest, and real
 * speech is noisy, so a hair's difference in fit means nothing. Below this the
 * honest answer is that the delivery did not commit to either shape — which is
 * itself worth telling a learner, since a flat delivery lands exactly there.
 */
export const CLEAR_MARGIN = 0.5;

export interface AccentVerdict {
    /** The accent this delivery actually fits best. */
    accent: 'ACCENT_1' | 'ACCENT_2';
    /** How much better it fits than the other, in semitones. */
    margin: number;
    /** True when the margin is wide enough to be worth stating. */
    clear: boolean;
}

/**
 * Which accent the learner actually produced, rather than how well they hit the
 * one they were aiming for.
 *
 * This is the more useful question, and a far more robust one. Judging a
 * contour against a single target needs an absolute threshold on stylised
 * curves; asking which of the two it is CLOSER to is a relative decision, and
 * relative decisions survive the noise in a phone microphone. It is also the
 * question the language actually poses: `hender` is either hands or happens,
 * and the melody is the entire difference.
 */
export function classifyAccent(contour: PitchContour | null): AccentVerdict | null {
    const first = scoreMelody(contour, 'ACCENT_1');
    const second = scoreMelody(contour, 'ACCENT_2');
    if (!first || !second) return null;

    const margin = Math.abs(first.distance - second.distance);
    return {
        accent: first.distance <= second.distance ? 'ACCENT_1' : 'ACCENT_2',
        margin,
        clear: margin >= CLEAR_MARGIN,
    };
}

/**
 * How well the recording matched the expected accent, or null when there is
 * nothing to compare — no accent to aim at, or too little voiced sound.
 *
 * The score is expressed against a flat baseline rather than an absolute
 * semitone tolerance, because the two accents differ in how much movement they
 * ask for. Dividing by the distance a monotone delivery would have scored puts
 * both on the same 0-100 scale and makes 0 mean something concrete: "no better
 * than not trying".
 */
export function scoreMelody(contour: PitchContour | null, accent: PitchAccent): MelodyScore | null {
    if (!contour || accent === 'NONE') return null;

    const voiced = contour.points.filter(
        (p): p is (typeof contour.points)[number] & { semitones: number } => p.semitones !== null
    );
    if (voiced.length < MIN_VOICED_FRAMES) return null;

    const target = targetContour(accent);
    if (!target.length) return null;

    const userValues = resample(
        voiced.map(p => p.semitones),
        RESOLUTION
    );
    const userTimes = resample(
        voiced.map(p => p.time),
        RESOLUTION
    );
    const targetValues = sampleContour(target, RESOLUTION);

    const aligned = dtw(userValues, targetValues);
    if (!aligned) return null;

    // What a learner who never moved their pitch would have scored. Their
    // contour would be flat at their own median, which is 0 semitones.
    const flatDistance =
        targetValues.reduce((sum, value) => sum + Math.abs(value), 0) / targetValues.length;
    if (flatDistance <= 0) return null;

    const ratio = 1 - aligned.distance / flatDistance;
    return {
        score: Math.round(Math.max(0, Math.min(1, ratio)) * 100),
        distance: aligned.distance,
        flatDistance,
        alignedTarget: warpTargetOntoUser(aligned.path, targetValues, userTimes),
    };
}
