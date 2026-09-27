/**
 * Fundamental-frequency (F0) extraction from a recorded attempt.
 *
 * Norwegian is a pitch-accent language: melody carries meaning, and speaking it
 * with flat English-style intonation is the most common giveaway of a
 * non-native speaker. Showing the learner their own measured pitch contour is
 * something the mainstream apps do not do.
 *
 * Method is normalized autocorrelation per frame — robust enough for a clear
 * close-mic recording, and honest about being an estimate: unvoiced or quiet
 * frames come back as null rather than a guess.
 */
import { decodeMono, frameRms } from './audioFrames';

export interface PitchPoint {
    /** Seconds from the start of the recording. */
    time: number;
    /** Estimated F0 in Hz, or null when the frame is silent/unvoiced. */
    hz: number | null;
    /**
     * The same pitch in semitones relative to this speaker's median, which is
     * the only form worth comparing or plotting. Null wherever `hz` is.
     */
    semitones: number | null;
}

export interface SpeechBounds {
    /** Seconds into the recording where speech starts. */
    start: number;
    /** Seconds into the recording where speech ends. */
    end: number;
    /** Full decoded length, so callers can tell if trimming did anything. */
    duration: number;
}

export interface RecordingAnalysis {
    contour: PitchContour;
    bounds: SpeechBounds | null;
}

export interface PitchContour {
    points: PitchPoint[];
    /** Voiced frames only. */
    voicedCount: number;
    medianHz: number | null;
    minHz: number | null;
    maxHz: number | null;
    /** Pitch movement in semitones between the 10th and 90th percentile. */
    rangeSemitones: number | null;
}

/**
 * Pitch distance in semitones: ST = 12 · log₂(f / reference).
 *
 * Absolute frequency says nothing about melody. A bass at 95 Hz and a soprano
 * at 240 Hz saying the same word share a shape and no frequencies at all, so
 * everything downstream — the chart, the target contours, the DTW scoring —
 * works in semitones relative to the speaker's own median instead.
 */
export function toSemitones(hz: number, reference: number): number {
    if (hz <= 0 || reference <= 0) return 0;
    return 12 * Math.log2(hz / reference);
}

const FRAME_SECONDS = 0.04;
const HOP_SECONDS = 0.01;
const MIN_HZ = 70;
const MAX_HZ = 400;
const MIN_RMS = 0.012;
const MIN_CORRELATION = 0.5;
/** How close to the best correlation a shorter lag must score to win. */
const OCTAVE_TOLERANCE = 0.85;

/** Exported for tests. */
export function detectF0(frame: Float32Array, rate: number): number | null {
    const size = frame.length;

    let rms = 0;
    for (let i = 0; i < size; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / size);
    if (rms < MIN_RMS) return null;

    const minLag = Math.floor(rate / MAX_HZ);
    const maxLag = Math.min(Math.floor(rate / MIN_HZ), size - 1);
    if (maxLag <= minLag) return null;

    const correlations = new Float32Array(maxLag + 1);
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        let energyA = 0;
        let energyB = 0;
        for (let i = 0; i < size - lag; i++) {
            corr += frame[i] * frame[i + lag];
            energyA += frame[i] * frame[i];
            energyB += frame[i + lag] * frame[i + lag];
        }
        const denom = Math.sqrt(energyA * energyB);
        const normalized = denom > 0 ? corr / denom : 0;
        correlations[lag] = normalized;
        if (normalized > bestCorr) bestCorr = normalized;
    }

    // Octave-error guard: a perfectly periodic signal correlates just as well
    // at twice its true period, and the longer lag can edge ahead numerically
    // because fewer terms are summed. Take the SHORTEST lag that is a local
    // peak and scores close to the best, which is the true fundamental.
    let bestLag = -1;
    const acceptable = bestCorr * OCTAVE_TOLERANCE;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
        if (
            correlations[lag] >= acceptable &&
            correlations[lag] >= correlations[lag - 1] &&
            correlations[lag] >= correlations[lag + 1]
        ) {
            bestLag = lag;
            break;
        }
    }

    if (bestLag < 0 || bestCorr < MIN_CORRELATION) return null;
    return rate / bestLag;
}

function percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
    return sorted[index];
}

/** Median filter to drop isolated octave errors. */
function smooth(points: PitchPoint[]): PitchPoint[] {
    return points.map((point, i) => {
        if (point.hz === null) return point;
        const window = [points[i - 1], point, points[i + 1]]
            .filter((p): p is PitchPoint => !!p && p.hz !== null)
            .map(p => p.hz as number)
            .sort((a, b) => a - b);
        return { ...point, hz: window[Math.floor(window.length / 2)] };
    });
}

const EMPTY_CONTOUR: PitchContour = {
    points: [],
    voicedCount: 0,
    medianHz: null,
    minHz: null,
    maxHz: null,
    rangeSemitones: null,
};

/**
 * Build a pitch contour from already-decoded, already-downsampled samples.
 * Exported for the tests.
 */
export function contourFrom(data: Float32Array, rate: number): PitchContour {
    const frameSize = Math.floor(FRAME_SECONDS * rate);
    const hopSize = Math.floor(HOP_SECONDS * rate);
    if (data.length < frameSize) return EMPTY_CONTOUR;

    const points: PitchPoint[] = [];
    for (let start = 0; start + frameSize <= data.length; start += hopSize) {
        points.push({
            time: start / rate,
            hz: detectF0(data.subarray(start, start + frameSize), rate),
            semitones: null,
        });
    }

    const smoothed = smooth(points);
    const voiced = smoothed.map(p => p.hz).filter((hz): hz is number => hz !== null);
    if (voiced.length < 3) return { ...EMPTY_CONTOUR, points: smoothed };

    const sorted = [...voiced].sort((a, b) => a - b);
    const low = percentile(sorted, 0.1);
    const high = percentile(sorted, 0.9);
    const medianHz = percentile(sorted, 0.5);

    return {
        // Normalise once, here, so every consumer works in the same units and
        // none of them has to know the speaker's baseline.
        points: smoothed.map(point => ({
            ...point,
            semitones: point.hz === null ? null : toSemitones(point.hz, medianHz),
        })),
        voicedCount: voiced.length,
        medianHz,
        minHz: sorted[0],
        maxHz: sorted[sorted.length - 1],
        rangeSemitones: low > 0 ? toSemitones(high, low) : null,
    };
}

/**
 * Find where speech actually starts and stops inside a recording.
 *
 * The learner holds the mic button before they start talking and often pauses
 * after, so playing the raw clip back begins with dead air. Rather than
 * re-encoding the audio we just report the boundaries and let playback seek.
 *
 * The threshold is relative to the clip's own peak, so it adapts to quiet and
 * loud recordings alike instead of assuming a fixed input level.
 */
export function findSpeechBounds(data: Float32Array, rate: number): SpeechBounds | null {
    const duration = data.length / rate;
    const { rms: frames, seconds: frameSeconds, peak } = frameRms(data, rate, 0.02);

    if (!frames.length || peak <= 0) return null;

    // Speech is anything above a fraction of the loudest moment, with an
    // absolute floor so near-silent clips do not amplify their own noise.
    const threshold = Math.max(peak * 0.12, 0.006);
    let first = frames.findIndex(rms => rms >= threshold);
    if (first === -1) return null;
    let last = frames.length - 1;
    while (last > first && frames[last] < threshold) last--;

    // Keep a little air either side so the first consonant is not clipped.
    const padFrames = Math.ceil(0.06 / frameSeconds);
    first = Math.max(0, first - padFrames);
    last = Math.min(frames.length - 1, last + padFrames);

    return {
        start: first * frameSeconds,
        end: Math.min(duration, (last + 1) * frameSeconds),
        duration,
    };
}

/**
 * Decode the recording once and derive everything the feedback UI needs from
 * it — the pitch contour and the speech boundaries. Decoding is the expensive
 * part, so the two consumers share a single pass.
 */
export async function analyseRecording(objectUrl: string): Promise<RecordingAnalysis> {
    const empty: RecordingAnalysis = {
        contour: {
            points: [],
            voicedCount: 0,
            medianHz: null,
            minHz: null,
            maxHz: null,
            rangeSemitones: null,
        },
        bounds: null,
    };

    const decoded = await decodeMono(objectUrl);
    if (!decoded) return empty;

    return {
        contour: contourFrom(decoded.data, decoded.rate),
        bounds: findSpeechBounds(decoded.data, decoded.rate),
    };
}
