/**
 * Where somebody stopped talking, and for how long.
 *
 * This is the ONLY measurement the rehearsal makes on a free answer, and it is
 * deliberately not a score. The exam's flyt criterion is about whether pauses
 * and reformulations get in the way of being understood; a count of silences
 * is evidence a candidate can look at against their own recording, not a
 * judgement of that criterion.
 *
 * WHAT IT CANNOT TELL APART, and says so wherever it is shown: a pause for
 * thought, a pause for breath, a rhetorical pause, and the microphone dropping
 * out are all the same silence to this. It also cannot hear a filler — "eh",
 * "liksom", "altså" — which is speech, and which an examiner hears as
 * disfluency. So a fluent-looking pause profile is not evidence of fluency; a
 * broken-looking one is worth listening back to.
 *
 * Pure over frame loudness, so it is tested without audio.
 */
import { frameRms, type Frames } from './audioFrames';

export interface Pause {
    /** Seconds into the clip. */
    at: number;
    seconds: number;
}

export interface PauseProfile {
    /** Length of the clip that was measured, in seconds. */
    duration: number;
    /** Seconds in which somebody was audibly speaking. */
    speaking: number;
    /** Silences at or over the reporting threshold, in order. */
    pauses: Pause[];
    /** The longest of them, or null when there were none. */
    longest: Pause | null;
    /**
     * False when the clip is too quiet to say anything about at all — a dead
     * microphone rather than a silent candidate. Everything above is zeroed,
     * and a caller must not read that as "spoke for no seconds".
     */
    measured: boolean;
}

/**
 * How long a silence has to be before it is worth reporting.
 *
 * Under about six-tenths of a second is the ordinary machinery of speech —
 * stops, breaths, the gap between clauses — and reporting those would bury the
 * ones a listener actually notices.
 */
export const PAUSE_SECONDS = 0.6;

/** Below this share of the loudest frame, a frame counts as silence. */
const SILENCE_RATIO = 0.1;
/** An absolute floor, so a clip of pure noise does not amplify its own hiss. */
const SILENCE_FLOOR = 0.008;
/** Under this peak there is nothing to measure. */
const DEAD_PEAK = 0.01;

const nothing = (duration: number): PauseProfile => ({
    duration,
    speaking: 0,
    pauses: [],
    longest: null,
    measured: false,
});

/**
 * Find the pauses in a run of loudness frames.
 *
 * Silence at the very start and the very end is not a pause — it is the take
 * being open before and after the candidate spoke, which is the app's doing
 * rather than theirs.
 */
export function pausesIn(frames: Frames, threshold = PAUSE_SECONDS): PauseProfile {
    const { rms, seconds, peak } = frames;
    const duration = rms.length * seconds;

    if (!rms.length || peak < DEAD_PEAK) return nothing(duration);

    const level = Math.max(peak * SILENCE_RATIO, SILENCE_FLOOR);
    const loud = rms.map(value => value >= level);

    const first = loud.indexOf(true);
    if (first === -1) return nothing(duration);
    let last = loud.length - 1;
    while (last > first && !loud[last]) last--;

    const pauses: Pause[] = [];
    let speakingFrames = 0;
    let runStart = -1;

    for (let i = first; i <= last; i++) {
        if (loud[i]) {
            speakingFrames++;
            if (runStart !== -1) {
                const length = (i - runStart) * seconds;
                if (length >= threshold) pauses.push({ at: runStart * seconds, seconds: length });
                runStart = -1;
            }
        } else if (runStart === -1) {
            runStart = i;
        }
    }

    const longest = pauses.reduce<Pause | null>(
        (best, pause) => (!best || pause.seconds > best.seconds ? pause : best),
        null
    );

    return {
        duration,
        speaking: speakingFrames * seconds,
        pauses,
        longest,
        measured: true,
    };
}

/** The same, from decoded samples. */
export function pausesFrom(
    data: Float32Array,
    rate: number,
    threshold = PAUSE_SECONDS
): PauseProfile {
    return pausesIn(frameRms(data, rate, 0.02), threshold);
}
