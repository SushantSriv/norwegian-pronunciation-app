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
 * Multilingual whisper-base, 8-bit.
 *
 * Chosen by measurement, not by reputation — `scripts/bench-asr.mjs` runs the
 * candidates over read Norwegian from google/fleurs and reports word error
 * rate. On 99 s of it:
 *
 *   whisper-small   WER 35.8%   240 MB   0.42x real time
 *   whisper-base    WER 48.3%    76 MB   0.18x real time   <- this
 *   whisper-tiny    WER 79.0%    41 MB   0.13x real time
 *
 * `tiny` is what a size-first reading of the problem lands on, and it is not
 * usable here: at 79% it would mis-hear a learner more often than not, and in a
 * pronunciation app every mis-hearing is a failed attempt that was actually
 * correct. `base` nearly halves that for less than double the download and a
 * difference in speed too small to feel. `small` is better again and asks for
 * 240 MB, which is not a reasonable thing to put in front of someone on a
 * phone.
 *
 * FLEURS is long-form read prose with hard vocabulary, so the short everyday
 * phrases this app uses will fare far better than 48% suggests. It is the
 * ranking that carries over, not the absolute number. Even so, `base` will
 * mis-hear a learner sometimes, and that shows up as a score they did not earn.
 */
import type { SpeechBounds } from './pitch';

export const ASR_MODEL = 'Xenova/whisper-base';

/** Whisper's language code for Norwegian Bokmål. */
/**
 * How hard ONNX Runtime is allowed to rewrite the graph before running it.
 *
 * This is not a tuning knob, it is the fix for an outright failure. At the
 * default (`all`), whisper-base's q8 build refuses to load in a browser:
 *
 *   Can't create a session. qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits
 *   Missing required scale: model.decoder.embed_tokens.weight_merged_0_scale
 *
 * The same build loads and transcribes perfectly under Node, which is where
 * every earlier measurement of it was taken, so recognition shipped completely
 * broken in browsers and nothing in this repository could have caught it — the
 * unit tests stub the worker and the accuracy benchmark runs under Node on
 * purpose. It took running the real worker in a real engine.
 *
 * The failing transform is a QDQ (quantize-dequantize) rewrite that lives in
 * the extended optimization level. Stopping at `basic` skips it, and measured
 * in Chromium it is also the faster of the two options that work:
 *
 *   q8, graph 'basic'      loads in 8.1 s, 2.30x real time   <- this
 *   q8, graph 'disabled'   loads in 7.6 s, 2.69x real time
 *   q8, graph 'all'        does not load at all
 */
export const ASR_GRAPH_OPTIMIZATION = 'basic';

/**
 * Weight precisions to try, in order, keeping the first that loads.
 *
 * q8 works everywhere it has been measured once the graph level above is set,
 * and is by far the smaller download. fp32 is kept behind it as insurance: the
 * loader failure above could plausibly hit an engine that cannot be tested from
 * here — Chrome on Android and Safari on iOS above all — and a single pinned
 * precision would turn that into an app that silently does nothing.
 *
 * Two entries, not four. A longer chain sounds safer and is not: each failed
 * attempt is a whole model download, and walking q8/int8/uint8/fp32 took over
 * ten minutes before giving up, which is indistinguishable from broken.
 */
export const ASR_DTYPES = ['q8', 'fp32'] as const;

/** The precision tried first; the rest are insurance. */
export const ASR_DTYPE = ASR_DTYPES[0];

/**
 * Where the model actually runs.
 *
 * This is the difference between an app that feels instant and one that feels
 * broken, and for a long time it was left at the default. ONNX Runtime's WASM
 * backend was measured at 2.3x real time in Chromium — a three-second phrase
 * taking seven seconds to come back — and on GitHub Pages it is worse still,
 * because WASM threads need SharedArrayBuffer, which needs COOP/COEP response
 * headers, which Pages cannot set. So the hosted app was running the whole
 * model on ONE thread. The dev server does set those headers, which is why
 * this felt fine while it was being built and slow once it was deployed.
 *
 * WebGPU sidesteps all of that by not being on the CPU at all.
 */
export type AsrDevice = 'webgpu' | 'wasm';

export interface AsrBackend {
    device: AsrDevice;
    dtype: string;
}

/**
 * What to try, in order.
 *
 * q4f16 is picked for WebGPU on size as much as speed: 4-bit weights with
 * 16-bit compute come to 79 MB against the 73 MB already being downloaded, so
 * the faster path costs a learner nothing extra to fetch. Plain fp16 would be
 * 139 MB, which is not worth it for a model this small.
 *
 * The WASM entry is unchanged and is what everything falls back to. There is
 * exactly one WebGPU attempt before that fallback, because every failed
 * attempt is a whole model download.
 */
export const ASR_WEBGPU_BACKEND: AsrBackend = { device: 'webgpu', dtype: 'q4f16' };

export const ASR_WASM_BACKENDS: readonly AsrBackend[] = ASR_DTYPES.map(dtype => ({
    device: 'wasm' as const,
    dtype,
}));

const BACKEND_KEY = 'npa-asr-backend-v1';

/**
 * The backend that worked last time.
 *
 * Without this, a browser that advertises WebGPU but cannot actually run this
 * model pays for the failed download once per session, forever. Remembering
 * costs one localStorage entry and turns that into a one-off.
 */
export function rememberBackend(backend: AsrBackend): void {
    try {
        window.localStorage.setItem(BACKEND_KEY, JSON.stringify(backend));
    } catch {
        // Private browsing. The cost is retrying the probe next time.
    }
}

export function preferredBackend(): AsrBackend | null {
    try {
        const raw = window.localStorage.getItem(BACKEND_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<AsrBackend>;
        if (parsed?.device !== 'webgpu' && parsed?.device !== 'wasm') return null;
        return typeof parsed.dtype === 'string' ? { device: parsed.device, dtype: parsed.dtype } : null;
    } catch {
        return null;
    }
}

export function forgetBackend(): void {
    try {
        window.localStorage.removeItem(BACKEND_KEY);
    } catch {
        // Nothing to forget it from.
    }
}

export const ASR_LANGUAGE = 'no';

/**
 * Where one word sits in the recording.
 *
 * Whisper can report these, and they cost about 0.3 s on top of a 2 s
 * transcription. They are what makes per-word melody feedback possible at all:
 * without them there is no way to say which stretch of the pitch contour
 * belongs to which word, and the melody chart can only ever talk about a whole
 * utterance at once.
 *
 * They are estimates, derived from the model's own attention rather than from
 * measuring the signal, and they drift — most visibly at the start of a clip.
 * Everything downstream treats them as approximate.
 */
export interface WordTiming {
    word: string;
    /** Seconds from the start of the recording. */
    start: number;
    end: number;
}

export interface Recognition {
    text: string;
    /** Per-word spans. Empty if the model declined to produce them. */
    words: WordTiming[];
    /**
     * Where speech was actually found in the recording.
     *
     * Filled in by the recorder rather than the model — it is measured from the
     * signal, which is exactly why it is worth having next to the model's
     * output: comparing the two is how we tell "you said it wrong" apart from
     * "I did not hear you properly". Undefined when nothing measured it.
     */
    speech?: SpeechBounds | null;
}

/** Overrides for the benchmark harness; production uses the constants above. */
export interface ModelChoice {
    model?: string;
    dtype?: string;
    /** ONNX graph optimization level, for narrowing down loader failures. */
    graph?: string;
    /** Force a backend, for the benchmark. Production probes for itself. */
    device?: AsrDevice;
    /** The backend that worked last time, tried first. */
    prefer?: AsrBackend | null;
    /** WASM threads, for measuring what cross-origin isolation is worth. */
    threads?: number;
}

export type AsrRequest =
    | ({ type: 'load' } & ModelChoice)
    | { type: 'transcribe'; id: number; audio: Float32Array };

export type AsrResponse =
    | { type: 'progress'; ratio: number }
    | { type: 'ready'; dtype: string; device: AsrDevice }
    | { type: 'failed'; message: string }
    | { type: 'result'; id: number; text: string; words: WordTiming[] }
    | { type: 'error'; id: number; message: string };

export type AsrState = 'idle' | 'loading' | 'ready' | 'failed';

export interface AsrStatus {
    state: AsrState;
    /** Download progress, 0 to 1, while `state` is 'loading'. */
    progress: number;
    error?: string;
    /** Which weight precision the browser accepted, once it is loaded. */
    dtype?: string;
    /** Where it is running: the GPU, or WASM on the CPU. */
    device?: AsrDevice;
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
    load(choice?: ModelChoice): void;
    /** Transcribe 16 kHz mono samples. Rejects if the model failed to load. */
    transcribe(audio: Float32Array): Promise<Recognition>;
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
    const pending = new Map<
        number,
        { resolve: (result: Recognition) => void; reject: (e: Error) => void }
    >();

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
                    // Remember what worked, so a browser that advertises a GPU
                    // it cannot use pays for that discovery once rather than
                    // once a session.
                    rememberBackend({ device: message.device, dtype: message.dtype });
                    publish({
                        state: 'ready',
                        progress: 1,
                        dtype: message.dtype,
                        device: message.device,
                    });
                    break;
                case 'failed':
                    publish({ state: 'failed', progress: 0, error: message.message });
                    // Nothing queued can succeed once loading has failed.
                    pending.forEach(p => p.reject(new Error(message.message)));
                    pending.clear();
                    break;
                case 'result':
                    pending.get(message.id)?.resolve({ text: message.text, words: message.words });
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
        load(choice) {
            if (current.state === 'ready' || current.state === 'loading') return;
            publish({ state: 'loading', progress: 0 });
            ensureWorker().postMessage({
                type: 'load',
                prefer: preferredBackend(),
                ...choice,
            } satisfies AsrRequest);
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
            return new Promise<Recognition>((resolve, reject) => {
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
