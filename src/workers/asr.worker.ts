/// <reference lib="webworker" />
/**
 * The speech model, off the main thread.
 *
 * ONNX Runtime's WASM backend is synchronous once inference starts, so running
 * this on the main thread would lock the page — no animation, no button, no
 * way to cancel — for the second or two a transcription takes, and for the
 * whole of the first model load. Everything about the model therefore lives in
 * here, and the page only ever sees messages.
 */
import {
    pipeline,
    env,
    type AutomaticSpeechRecognitionPipeline,
    type ProgressInfo,
} from '@huggingface/transformers';
import {
    ASR_GRAPH_OPTIMIZATION,
    ASR_LANGUAGE,
    ASR_MODEL,
    ASR_WASM_BACKENDS,
    ASR_WEBGPU_BACKEND,
    type AsrBackend,
    type AsrRequest,
    type AsrResponse,
    type ModelChoice,
    type WordTiming,
} from '../utils/asr';

// The model is fetched from the Hugging Face CDN, not from our own origin;
// looking locally first would just add a failing request per file.
env.allowLocalModels = false;

/**
 * How many threads the WASM backend may use.
 *
 * ONNX Runtime needs SharedArrayBuffer for threads, and SharedArrayBuffer needs
 * the page to be cross-origin isolated. GitHub Pages cannot send the headers
 * that do that, so the hosted app gets one thread whatever we ask for — but
 * asking is free, and a self-hosted copy that CAN set the headers should not
 * have to patch this file to benefit.
 */
const wasmThreads = () => {
    if (typeof self.crossOriginIsolated !== 'undefined' && !self.crossOriginIsolated) return 1;
    // Leave a core for the page: a locked-up UI feels slower than a slow model.
    return Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
};

if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = wasmThreads();

/**
 * Whether this browser can actually run the model on its GPU.
 *
 * Asked properly rather than by feature-detecting `navigator.gpu`, because the
 * object exists in browsers where requesting an adapter then fails — a machine
 * with no supported GPU, a blocklisted driver, a headless run. Downloading a
 * WebGPU build for one of those wastes 79 MB.
 */
async function hasWebGPU(): Promise<boolean> {
    try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        if (!gpu) return false;
        return Boolean(await gpu.requestAdapter());
    } catch {
        return false;
    }
}

const post = (message: AsrResponse) => self.postMessage(message);

/**
 * Bytes seen per file, so the several files that make up the model can be
 * reported as one number. A learner does not care that an encoder and a decoder
 * and a tokenizer are arriving separately.
 */
const files = new Map<string, { loaded: number; total: number }>();

function reportProgress(info: ProgressInfo) {
    if (info.status !== 'progress') return;
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });

    let loaded = 0;
    let total = 0;
    for (const size of files.values()) {
        loaded += size.loaded;
        total += size.total;
    }
    if (total > 0) post({ type: 'progress', ratio: Math.min(1, loaded / total) });
}

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/**
 * Load the model, trying each precision until one works.
 *
 * A precision that loads under Node can fail in a browser (see ASR_DTYPES), so
 * pinning one risks an app where recognition never starts. Each attempt is a
 * fresh fetch, but only of the weights — everything already in the browser
 * cache is reused, so a fallback costs a download rather than a restart.
 */
async function attemptLoad(
    model: string,
    backends: readonly AsrBackend[],
    graph?: string
): Promise<AutomaticSpeechRecognitionPipeline> {
    let last: unknown;

    for (const backend of backends) {
        files.clear();
        try {
            const instance = await pipeline('automatic-speech-recognition', model, {
                device: backend.device,
                dtype: backend.dtype as 'q8',
                progress_callback: reportProgress,
                // Skipping the extended optimizations is what makes the
                // quantized build loadable at all; see ASR_GRAPH_OPTIMIZATION.
                // It applies to the WASM sessions; WebGPU ignores it.
                session_options: {
                    graphOptimizationLevel: graph ?? ASR_GRAPH_OPTIMIZATION,
                },
            } as Parameters<typeof pipeline>[2]);

            post({ type: 'ready', dtype: backend.dtype, device: backend.device });
            // Told the page it is ready BEFORE warming up, so the microphone
            // button unlocks immediately. A learner who takes two seconds to
            // press it gets a warm model for free; one who is faster waits
            // exactly as long as they would have waited anyway.
            await warmUp(instance);
            return instance;
        } catch (error) {
            last = error;
        }
    }

    throw last instanceof Error ? last : new Error('no usable model build');
}

/**
 * One throwaway inference, so the learner does not pay for the first one.
 *
 * Both backends do real work the first time they run a graph — WebGPU compiles
 * shaders, WASM allocates and specialises kernels — and it lands on whatever
 * attempt happens to be first. That is the attempt where someone has just
 * spoken and is waiting, which is the worst possible moment for it.
 */
async function warmUp(transcriber: AutomaticSpeechRecognitionPipeline): Promise<void> {
    try {
        await transcriber(new Float32Array(16_000), {
            language: ASR_LANGUAGE,
            task: 'transcribe',
            return_timestamps: false,
        });
    } catch {
        // Best effort. A model that cannot transcribe silence will report the
        // real problem on the first real attempt.
    }
}

/** The backends to try, best first, given what this browser can do. */
async function chooseBackends(choice: ModelChoice): Promise<AsrBackend[]> {
    // The benchmark pins one; production probes.
    if (choice.dtype) return [{ device: choice.device ?? 'wasm', dtype: choice.dtype }];

    const wasm = [...ASR_WASM_BACKENDS];
    if (choice.prefer?.device === 'wasm') return wasm;

    const gpu = await hasWebGPU();
    if (!gpu) return wasm;
    return [choice.prefer?.device === 'webgpu' ? choice.prefer : ASR_WEBGPU_BACKEND, ...wasm];
}

function load(choice: ModelChoice = {}): Promise<AutomaticSpeechRecognitionPipeline> {
    if (loading) return loading;

    // The benchmark pins a thread count to measure what isolation is worth.
    if (choice.threads && env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = choice.threads;
    }

    loading = chooseBackends(choice)
        .then(backends => attemptLoad(choice.model ?? ASR_MODEL, backends, choice.graph))
        .catch((error: unknown) => {
            loading = null;
            post({
                type: 'failed',
                message:
                    error instanceof Error
                        ? `The speech model could not be loaded (${error.message}).`
                        : 'The speech model could not be loaded.',
            });
            throw error;
        });

    return loading;
}

/**
 * Pull the per-word spans out of a pipeline result.
 *
 * Defensive because `return_timestamps` is best-effort: a chunk can come back
 * with a null start or end when the model could not place it, and one bad span
 * must not cost the whole attempt its melody feedback.
 */
function wordTimings(result: unknown): WordTiming[] {
    const chunks = (result as { chunks?: { text?: string; timestamp?: [number, number] }[] })
        ?.chunks;
    if (!Array.isArray(chunks)) return [];

    const out: WordTiming[] = [];
    for (const chunk of chunks) {
        const word = chunk.text?.trim();
        const [start, end] = chunk.timestamp ?? [];
        if (!word || typeof start !== 'number' || typeof end !== 'number') continue;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        out.push({ word, start, end });
    }
    return out;
}

self.onmessage = async (event: MessageEvent<AsrRequest>) => {
    const message = event.data;

    if (message.type === 'load') {
        // Failure has already been reported through the 'failed' message.
        await load(message).catch(() => undefined);
        return;
    }

    try {
        const transcriber = await load();
        const output = await transcriber(message.audio, {
            language: ASR_LANGUAGE,
            task: 'transcribe',
            // Per-word spans, so the melody of each word can be looked at
            // separately. Whisper derives these from its own cross-attention,
            // which is why they cost so little on top of the decode it is
            // doing anyway.
            return_timestamps: 'word',
        });
        // The pipeline returns one result for a single clip, but its type
        // allows a batch.
        const result = Array.isArray(output) ? output[0] : output;
        post({
            type: 'result',
            id: message.id,
            text: result?.text ?? '',
            words: wordTimings(result),
        });
    } catch (error) {
        post({
            type: 'error',
            id: message.id,
            message:
                error instanceof Error
                    ? `Could not transcribe that recording (${error.message}).`
                    : 'Could not transcribe that recording.',
        });
    }
};
