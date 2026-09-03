/**
 * Turning a melody comparison into something a learner can act on.
 *
 * "Melody score: 72" is a mark, and a mark is the least useful thing you can
 * hand someone learning a distinction they cannot yet hear. What they need is
 * the next instruction: too flat, too early, the wrong way round, the wrong
 * accent altogether.
 *
 * Every diagnosis here is a measurement of the two contours, not a guess. They
 * are checked in order of how much they matter — there is no point telling
 * someone their peak is late when they did not move their pitch at all.
 */
import type { PitchAccent } from '../data/tonelag';
import { ACCENT_LABEL, ACCENT_SHAPE } from '../data/tonelag';
import type { AccentVerdict } from './melodyScore';

export type MelodyIssue =
    | 'good'
    | 'flat'
    | 'wrong-accent'
    | 'wrong-direction'
    | 'peak-too-early'
    | 'peak-too-late'
    | 'dip-too-early'
    | 'dip-too-late'
    | 'too-little-movement';

export interface MelodyAdvice {
    issue: MelodyIssue;
    /** One sentence, addressed to the learner, saying what to change. */
    text: string;
}

/**
 * Pitch movement below this reads as monotone. Norwegian sits around 4-8
 * semitones within a phrase; under 2 there is no melody to judge, only the
 * absence of one, which is the classic English-speaker giveaway.
 */
const FLAT_RANGE = 2;

/**
 * How far a peak or dip may sit from where the target puts it, as a fraction of
 * the word. Whisper's word spans are estimates and pitch tracking is frame-wise,
 * so a fifth of a word is about the resolution this can honestly claim.
 */
const TIMING_TOLERANCE = 0.2;

/** Below this share of the target's movement, the shape is right but too small. */
const MOVEMENT_FLOOR = 0.55;

const range = (series: number[]): number =>
    series.length ? Math.max(...series) - Math.min(...series) : 0;

/** Where the highest point sits, as a fraction from 0 (start) to 1 (end). */
function peakAt(series: number[]): number {
    if (series.length < 2) return 0;
    let best = 0;
    for (let i = 1; i < series.length; i++) if (series[i] > series[best]) best = i;
    return best / (series.length - 1);
}

function troughAt(series: number[]): number {
    if (series.length < 2) return 0;
    let worst = 0;
    for (let i = 1; i < series.length; i++) if (series[i] < series[worst]) worst = i;
    return worst / (series.length - 1);
}

/** Pearson correlation, as a shape-agreement measure in [-1, 1]. */
export function correlation(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;

    let sumA = 0;
    let sumB = 0;
    for (let i = 0; i < n; i++) {
        sumA += a[i];
        sumB += b[i];
    }
    const meanA = sumA / n;
    const meanB = sumB / n;

    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;
    for (let i = 0; i < n; i++) {
        const da = a[i] - meanA;
        const db = b[i] - meanB;
        covariance += da * db;
        varianceA += da * da;
        varianceB += db * db;
    }
    const denominator = Math.sqrt(varianceA * varianceB);
    return denominator > 0 ? covariance / denominator : 0;
}

/**
 * What to tell the learner about one word's melody.
 *
 * @param user     Their contour, in semitones, resampled to the target's length.
 * @param target   The expected contour, same length.
 * @param produced Which accent their delivery actually fits, if it is clear.
 * @param expected The accent the word takes.
 */
export function adviseMelody(
    user: number[],
    target: number[],
    produced: AccentVerdict | null,
    expected: PitchAccent
): MelodyAdvice {
    const userRange = range(user);

    // Nothing else is worth saying to someone who did not move their pitch.
    if (userRange < FLAT_RANGE) {
        return {
            issue: 'flat',
            text: 'Your pitch barely moved. Norwegian leans on melody far more than English does — let it rise and fall.',
        };
    }

    // They produced a melody, just the other one. This is the single most
    // useful thing the app can say, because the two accents are different
    // words rather than better and worse versions of one.
    if (produced?.clear && expected !== 'NONE' && produced.accent !== expected) {
        return {
            issue: 'wrong-accent',
            // Shape first, name second: "Tonelag 2" means nothing to someone
            // who has not met the term, and this sentence is the one that has
            // to be actionable.
            text:
                `You gave it ${ACCENT_SHAPE[produced.accent]}. This word needs ` +
                `${ACCENT_SHAPE[expected]} — ${ACCENT_LABEL[expected]}.`,
        };
    }

    if (correlation(user, target) < 0) {
        return {
            issue: 'wrong-direction',
            text: 'Your pitch moved the opposite way to the target — where it should rise, it fell.',
        };
    }

    const peakDrift = peakAt(user) - peakAt(target);
    if (Math.abs(peakDrift) > TIMING_TOLERANCE) {
        return peakDrift < 0
            ? {
                  issue: 'peak-too-early',
                  text: 'Your pitch peaks too early. Hold the rise until later in the word.',
              }
            : {
                  issue: 'peak-too-late',
                  text: 'Your pitch peaks too late. Start the rise sooner.',
              };
    }

    const dipDrift = troughAt(user) - troughAt(target);
    if (Math.abs(dipDrift) > TIMING_TOLERANCE) {
        return dipDrift < 0
            ? {
                  issue: 'dip-too-early',
                  text: 'Your pitch falls too early. Keep it up a little longer before dropping.',
              }
            : {
                  issue: 'dip-too-late',
                  text: 'Your pitch falls too late. The drop should come sooner.',
              };
    }

    if (userRange < range(target) * MOVEMENT_FLOOR) {
        return {
            issue: 'too-little-movement',
            text: 'The shape is right but too small. Exaggerate the rise and fall.',
        };
    }

    return { issue: 'good', text: 'Melody shape matches the target closely.' };
}
