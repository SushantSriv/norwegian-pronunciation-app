/**
 * Turning a recorded blob into samples.
 *
 * Two consumers want the learner's audio in different shapes: the pitch tracker
 * wants roughly 16 kHz and does not care about the exact rate, while the speech
 * model wants exactly 16 kHz mono because that is what it was trained on.
 * Decoding is the expensive half of both, so it lives here once.
 */

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
    if (typeof window === 'undefined') return null;
    return (
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
        null
    );
}

/** Decode a recording to an AudioBuffer at whatever rate it was captured at. */
export async function decodeRecording(objectUrl: string): Promise<AudioBuffer | null> {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;

    let encoded: ArrayBuffer;
    try {
        encoded = await (await fetch(objectUrl)).arrayBuffer();
    } catch {
        return null;
    }

    const context = new Ctor();
    try {
        return await context.decodeAudioData(encoded);
    } catch {
        // An unplayable or empty recording. Callers treat null as "no audio".
        return null;
    } finally {
        void context.close();
    }
}

/** The recognition sample rate every Whisper checkpoint expects. */
export const RECOGNITION_RATE = 16_000;

/**
 * Mix an AudioBuffer down to one channel.
 *
 * MediaRecorder usually hands back mono already, but a headset or an interface
 * can deliver stereo, and feeding the model one channel of a stereo pair would
 * quietly halve the level on anything panned.
 */
export function toMono(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);

    const out = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) out[i] += data[i];
    }
    for (let i = 0; i < out.length; i++) out[i] /= buffer.numberOfChannels;
    return out;
}

/**
 * Resample to exactly `rate`, mono.
 *
 * OfflineAudioContext does this properly — it is the browser's own resampler,
 * with the filtering that implies. Dropping samples by an integer factor is
 * good enough for reading a pitch contour but not for a model that was trained
 * on band-limited 16 kHz speech.
 */
export async function resampleMono(buffer: AudioBuffer, rate: number): Promise<Float32Array> {
    if (buffer.sampleRate === rate) return toMono(buffer);

    const length = Math.max(1, Math.ceil((buffer.duration * rate)));
    const offline = new OfflineAudioContext(1, length, rate);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
}

/** Decode a recording straight to what the speech model wants. */
export async function decodeForRecognition(objectUrl: string): Promise<Float32Array | null> {
    const buffer = await decodeRecording(objectUrl);
    if (!buffer) return null;
    try {
        return await resampleMono(buffer, RECOGNITION_RATE);
    } catch {
        // OfflineAudioContext can refuse unusual rates on older WebKit.
        return toMono(buffer);
    }
}
