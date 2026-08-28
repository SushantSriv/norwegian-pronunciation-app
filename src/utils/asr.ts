/**
 * Local speech recognition, and the protocol the worker speaks.
 *
 * The app used to hand recognition to the Web Speech API. That was a browser
 * feature, not a library, and it came with the browser's terms attached:
 * Firefox has never implemented it, several Chromium forks ship the interface
 * without access to the service behind it, and every implementation that does
 * work streams the learner's audio to a vendor's servers — so nothing worked
 * offline, and on a plane or a train the app was simply dead.
 *
 * Recognition now runs here instead, as a quantized Whisper checkpoint on
 * ONNX Runtime Web. The trade is explicit: about 40 MB fetched once and then
 * cached, and a second or two of WASM inference per attempt, in exchange for
 * working in every browser with a microphone and working with the network off.
 */

/**
 * Multilingual whisper-tiny, 8-bit. The smallest checkpoint that knows any
 * Norwegian at all; the `.en` variants are English-only and the next size up is
 * roughly six times the download, which is not a reasonable thing to ask of
 * someone on a phone.
 *
 * It is a genuinely small model and it will mis-hear a learner sometimes. That
 * is visible in the score, so it is worth knowing that a low score is not
 * always the learner's fault.
 */
export const ASR_MODEL = 'Xenova/whisper-tiny';

/** Whisper's language code for Norwegian Bokmål. */
export const ASR_LANGUAGE = 'no';

export type AsrRequest =
    | { type: 'load' }
    | { type: 'transcribe'; id: number; audio: Float32Array };

export type AsrResponse =
    | { type: 'progress'; ratio: number }
    | { type: 'ready' }
    | { type: 'failed'; message: string }
    | { type: 'result'; id: number; text: string }
    | { type: 'error'; id: number; message: string };

export type AsrState = 'idle' | 'loading' | 'ready' | 'failed';

export interface AsrStatus {
    state: AsrState;
    /** Download progress, 0 to 1, while `state` is 'loading'. */
    progress: number;
    error?: string;
}

/**
 * Tidy a Whisper transcript into something scoreable.
 *
 * The model returns a leading space, sentence casing and punctuation — " Hva er
 * det?" — none of which the learner said out loud. Scoring lowercases and
 * strips punctuation anyway, but the raw string is also shown back to them, and
 * leading whitespace makes the word alignment count an empty first token.
 */
export function cleanTranscript(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Whisper's answer when it was given no speech.
 *
 * Asked to transcribe silence or noise, Whisper does not return nothing — it
 * returns whatever its language model finds likely, which for Norwegian is
 * usually a stock phrase or one of the caption artefacts in its training data.
 * Scoring a hallucination as if the learner had said it is worse than saying
 * "I did not catch that", so these are treated as no answer at all.
 */
const HALLUCINATIONS = [
    'takk for at du så på',
    'takk for at dere så på',
    'tekst og undertekster av nicolai winther',
    'undertekster av nicolai winther',
    'norsk tekst av nicolai winther',
    'teksting av nicolai winther',
    'abonner',
];

export function looksHallucinated(text: string): boolean {
    const bare = cleanTranscript(text)
        .toLowerCase()
        .replace(/[.,!?;:«»"'-]/g, '')
        .trim();
    if (!bare) return true;
    return HALLUCINATIONS.some(phrase => bare === phrase || bare.startsWith(phrase));
}

// ---------------------------------------------------------------------------
// Worker client
// ---------------------------------------------------------------------------

export interface AsrClient {
    /** Start fetching the model. Safe to call more than once. */
    load(): void;
    /** Transcribe 16 kHz mono samples. Rejects if the model failed to load. */
    transcribe(audio: Float32Array): Promise<string>;
    subscribe(listener: (status: AsrStatus) => void): () => void;
    status(): AsrStatus;
    dispose(): void;
}

/** True when this browser can run the model at all. */
export function recognitionSupported(): boolean {
    return (
        typeof Worker !== 'undefined' &&
        typeof WebAssembly !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia
    );
}

const spawnWorker = (): Worker =>
    new Worker(new URL('../workers/asr.worker.ts', import.meta.url), { type: 'module' });

/**
 * Wrap the worker in promises and a subscribable status.
 *
 * `spawn` is injected so the module can be exercised without a real worker.
 */
export function createAsrClient(spawn: () => Worker = spawnWorker): AsrClient {
    let worker: Worker | null = null;
    let requestId = 0;
    let current: AsrStatus = { state: 'idle', progress: 0 };

    const listeners = new Set<(status: AsrStatus) => void>();
    const pending = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>();

    const publish = (next: AsrStatus) => {
        current = next;
        listeners.forEach(listener => listener(current));
    };

    function ensureWorker(): Worker {
        if (worker) return worker;

        worker = spawn();
        worker.onmessage = (event: MessageEvent<AsrResponse>) => {
            const message = event.data;
            switch (message.type) {
                case 'progress':
                    publish({ state: 'loading', progress: message.ratio });
                    break;
                case 'ready':
                    publish({ state: 'ready', progress: 1 });
                    break;
                case 'failed':
                    publish({ state: 'failed', progress: 0, error: message.message });
                    // Nothing queued can succeed once loading has failed.
                    pending.forEach(p => p.reject(new Error(message.message)));
                    pending.clear();
                    break;
                case 'result':
                    pending.get(message.id)?.resolve(message.text);
                    pending.delete(message.id);
                    break;
                case 'error':
                    pending.get(message.id)?.reject(new Error(message.message));
                    pending.delete(message.id);
                    break;
            }
        };
        worker.onerror = event => {
            const message = event.message || 'The speech model could not start.';
            publish({ state: 'failed', progress: 0, error: message });
            pending.forEach(p => p.reject(new Error(message)));
            pending.clear();
        };
        return worker;
    }

    return {
        load() {
            if (current.state === 'ready' || current.state === 'loading') return;
            publish({ state: 'loading', progress: 0 });
            ensureWorker().postMessage({ type: 'load' } satisfies AsrRequest);
        },

        transcribe(audio) {
            if (current.state === 'failed') {
                return Promise.reject(new Error(current.error ?? 'The speech model is unavailable.'));
            }
            const id = ++requestId;
            const instance = ensureWorker();
            if (current.state === 'idle') {
                publish({ state: 'loading', progress: 0 });
            }
            return new Promise<string>((resolve, reject) => {
                pending.set(id, { resolve, reject });
                // A copy, so transferring the buffer cannot detach the caller's
                // decoded audio out from under them.
                const samples = audio.slice();
                instance.postMessage({ type: 'transcribe', id, audio: samples } satisfies AsrRequest, [
                    samples.buffer,
                ]);
            });
        },

        subscribe(listener) {
            listeners.add(listener);
            listener(current);
            return () => listeners.delete(listener);
        },

        status: () => current,

        dispose() {
            worker?.terminate();
            worker = null;
            listeners.clear();
            pending.forEach(p => p.reject(new Error('Recognition was cancelled.')));
            pending.clear();
            current = { state: 'idle', progress: 0 };
        },
    };
}
