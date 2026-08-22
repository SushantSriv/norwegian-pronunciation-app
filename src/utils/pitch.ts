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

export interface PitchPoint {
    /** Seconds from the start of the recording. */
    time: number;
    /** Estimated F0 in Hz, or null when the frame is silent/unvoiced. */
    hz: number | null;
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

const TARGET_RATE = 16_000;
const FRAME_SECONDS = 0.04;
const HOP_SECONDS = 0.01;
const MIN_HZ = 70;
const MAX_HZ = 400;
const MIN_RMS = 0.012;
const MIN_CORRELATION = 0.5;
/** How close to the best correlation a shorter lag must score to win. */
const OCTAVE_TOLERANCE = 0.85;

/** Cheap decimation to ~16 kHz; plenty of resolution for speech F0. */
function downsample(input: Float32Array, fromRate: number): { data: Float32Array; rate: number } {
    if (fromRate <= TARGET_RATE) return { data: input, rate: fromRate };

    const factor = Math.floor(fromRate / TARGET_RATE);
    const outLength = Math.floor(input.length / factor);
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
        // Average the window rather than picking one sample, to avoid aliasing.
        let sum = 0;
        for (let k = 0; k < factor; k++) sum += input[i * factor + k];
        out[i] = sum / factor;
    }
    return { data: out, rate: fromRate / factor };
}

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

export async function extractPitch(objectUrl: string): Promise<PitchContour> {
    const empty: PitchContour = {
        points: [],
        voicedCount: 0,
        medianHz: null,
        minHz: null,
        maxHz: null,
        rangeSemitones: null,
    };

    const AudioCtor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return empty;

    const response = await fetch(objectUrl);
    const encoded = await response.arrayBuffer();

    const context = new AudioCtor();
    let decoded: AudioBuffer;
    try {
        decoded = await context.decodeAudioData(encoded);
    } catch {
        return empty;
    } finally {
        void context.close();
    }

    const { data, rate } = downsample(decoded.getChannelData(0), decoded.sampleRate);
    const frameSize = Math.floor(FRAME_SECONDS * rate);
    const hopSize = Math.floor(HOP_SECONDS * rate);
    if (data.length < frameSize) return empty;

    const points: PitchPoint[] = [];
    for (let start = 0; start + frameSize <= data.length; start += hopSize) {
        points.push({
            time: start / rate,
            hz: detectF0(data.subarray(start, start + frameSize), rate),
        });
    }

    const smoothed = smooth(points);
    const voiced = smoothed.map(p => p.hz).filter((hz): hz is number => hz !== null);
    if (voiced.length < 3) return { ...empty, points: smoothed };

    const sorted = [...voiced].sort((a, b) => a - b);
    const low = percentile(sorted, 0.1);
    const high = percentile(sorted, 0.9);

    return {
        points: smoothed,
        voicedCount: voiced.length,
        medianHz: percentile(sorted, 0.5),
        minHz: sorted[0],
        maxHz: sorted[sorted.length - 1],
        // Semitones = 12 * log2(f2 / f1)
        rangeSemitones: low > 0 ? 12 * Math.log2(high / low) : null,
    };
}
