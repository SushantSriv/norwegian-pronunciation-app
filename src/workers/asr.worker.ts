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
import { ASR_LANGUAGE, ASR_MODEL, type AsrRequest, type AsrResponse } from '../utils/asr';

// The model is fetched from the Hugging Face CDN, not from our own origin;
// looking locally first would just add a failing request per file.
env.allowLocalModels = false;

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

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
    if (loading) return loading;

    loading = pipeline('automatic-speech-recognition', ASR_MODEL, {
        // 8-bit weights. Quantization is not free — it costs `tiny` 14 points
        // of word error rate — but it is a quarter of the download, and the
        // answer to that cost was a bigger model rather than heavier weights.
        dtype: 'q8',
        progress_callback: reportProgress,
    })
        .then(instance => {
            post({ type: 'ready' });
            return instance;
        })
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

self.onmessage = async (event: MessageEvent<AsrRequest>) => {
    const message = event.data;

    if (message.type === 'load') {
        // Failure has already been reported through the 'failed' message.
        await load().catch(() => undefined);
        return;
    }

    try {
        const transcriber = await load();
        const output = await transcriber(message.audio, {
            language: ASR_LANGUAGE,
            task: 'transcribe',
        });
        // The pipeline returns one result for a single clip, but its type
        // allows a batch.
        const text = Array.isArray(output) ? (output[0]?.text ?? '') : output.text;
        post({ type: 'result', id: message.id, text });
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
