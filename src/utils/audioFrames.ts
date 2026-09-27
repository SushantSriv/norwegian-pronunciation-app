/**
 * Getting audio into a shape something can be measured from.
 *
 * Two jobs that used to live inside `pitch.ts` and are needed by things that
 * have nothing to do with pitch. Decoding a recording is the expensive part of
 * every audio measurement in the app, and the loudness of successive short
 * frames is the raw material for both "where does speech start" and "where did
 * this person pause".
 *
 * Factored out so pause measurement can reuse the decode WITHOUT reusing the
 * pitch analysis. Running a full F0 contour over a three-minute exam answer
 * would cost seconds of a learner's time to produce a number this app has no
 * business reporting: the exam grades uttale on whether you are understood, not
 * on whether your melody matches a reference — and for a free answer there is
 * no reference to match against anyway.
 */

/** Everything downstream works at this rate; speech F0 and RMS need no more. */
export const TARGET_RATE = 16_000;

export interface Decoded {
    data: Float32Array;
    rate: number;
}

/** Cheap decimation to ~16 kHz; plenty of resolution for speech. */
export function downsample(input: Float32Array, fromRate: number): Decoded {
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

/**
 * Decode a recorded clip to one downsampled channel.
 *
 * Resolves null rather than throwing on anything that is not decodable audio:
 * a caller that cannot measure should say so, not fail.
 */
export async function decodeMono(objectUrl: string): Promise<Decoded | null> {
    const AudioCtor: typeof AudioContext | undefined =
        typeof window === 'undefined'
            ? undefined
            : (window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext })
                  .webkitAudioContext);
    if (!AudioCtor) return null;

    let encoded: ArrayBuffer;
    try {
        encoded = await (await fetch(objectUrl)).arrayBuffer();
    } catch {
        return null;
    }

    const context = new AudioCtor();
    try {
        const decoded = await context.decodeAudioData(encoded);
        return downsample(decoded.getChannelData(0), decoded.sampleRate);
    } catch {
        return null;
    } finally {
        void context.close();
    }
}

export interface Frames {
    /** Root-mean-square loudness of each frame, in order. */
    rms: number[];
    /** Seconds each frame covers. */
    seconds: number;
    /** The loudest frame, which every threshold here is relative to. */
    peak: number;
}

/**
 * Loudness frame by frame.
 *
 * Relative to the clip's own peak rather than an absolute level, because the
 * same person at the same distance records at wildly different levels on
 * different devices, and a fixed threshold would call one of those recordings
 * silent.
 */
export function frameRms(data: Float32Array, rate: number, seconds = 0.02): Frames {
    const size = Math.max(1, Math.floor(seconds * rate));
    const rms: number[] = [];
    let peak = 0;

    for (let start = 0; start + size <= data.length; start += size) {
        let sum = 0;
        for (let i = start; i < start + size; i++) sum += data[i] * data[i];
        const value = Math.sqrt(sum / size);
        rms.push(value);
        if (value > peak) peak = value;
    }

    return { rms, seconds: size / rate, peak };
}
