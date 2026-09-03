/**
 * What the app actually costs, in a real browser.
 *
 * Everything else about the speech model was measured under Node, which shares
 * the ONNX Runtime but not the engine, not the WASM implementation, not the
 * memory limits and not the threading. A learner runs it in a browser, so the
 * numbers that matter have to come from one.
 *
 * This drives the app's own modules — the same worker, the same pitch code —
 * rather than a copy, so what it measures is what ships. It writes its results
 * to `window.__BENCH__` for scripts/bench-browser.mjs to collect, and renders
 * them so it can also just be opened on a phone.
 */
import { createAsrClient, type AsrStatus } from '../src/utils/asr';
import { contourFrom, findSpeechBounds } from '../src/utils/pitch';

export interface BenchResult {
    userAgent: string;
    /** Hardware the numbers came off, so they can be read in context. */
    cores: number | null;
    /** Seconds to fetch and initialise the speech model, cold. */
    modelLoadSeconds: number | null;
    /** Seconds to transcribe, per clip length, across the runs. */
    transcribeSeconds: number[];
    /** Transcription time as a multiple of the clip's own duration. */
    realtimeFactor: number | null;
    /** Seconds to extract a pitch contour from the same audio. */
    pitchSeconds: number[];
    /** Model load excluded: what a learner waits after speaking. */
    attemptLatencySeconds: number | null;
    /** JS heap after the runs, where the engine reports it. */
    heapMb: number | null;
    /** Runs that threw. */
    failures: string[];
    /** Whether the page can even ask for a microphone here. */
    microphone: 'available' | 'absent' | 'blocked';
    notes: string[];
}

const CLIP_SECONDS = 2;
const RATE = 16_000;
const RUNS = 3;

/**
 * A voiced-sounding buffer: a 120 Hz fundamental with formant-ish harmonics,
 * amplitude-modulated into syllables.
 *
 * The transcript is meaningless and that is fine — accuracy was measured
 * separately, against real Norwegian, by scripts/bench-asr.mjs. What this needs
 * is a signal of realistic length and spectral density so the encoder and the
 * pitch tracker both do a realistic amount of work.
 */
function syntheticSpeech(seconds = CLIP_SECONDS): Float32Array {
    const samples = Math.floor(seconds * RATE);
    const out = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const t = i / RATE;
        // Four syllables per second, with a little pitch movement.
        const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t - Math.PI / 2);
        const f0 = 120 + 25 * Math.sin(2 * Math.PI * 0.8 * t);
        out[i] =
            0.35 *
            envelope *
            (Math.sin(2 * Math.PI * f0 * t) +
                0.5 * Math.sin(4 * Math.PI * f0 * t) +
                0.3 * Math.sin(6 * Math.PI * f0 * t) +
                0.15 * Math.sin(2 * Math.PI * 2400 * t));
    }
    return out;
}

async function microphoneState(): Promise<BenchResult['microphone']> {
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return 'absent';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return 'available';
    } catch {
        return 'blocked';
    }
}

function heapMb(): number | null {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? Math.round(memory.usedJSHeapSize / 1048576) : null;
}

async function run(): Promise<BenchResult> {
    const result: BenchResult = {
        userAgent: navigator.userAgent,
        cores: navigator.hardwareConcurrency ?? null,
        modelLoadSeconds: null,
        transcribeSeconds: [],
        realtimeFactor: null,
        pitchSeconds: [],
        attemptLatencySeconds: null,
        heapMb: null,
        failures: [],
        microphone: 'absent',
        notes: [],
    };

    result.microphone = await microphoneState();
    if (result.microphone !== 'available') {
        result.notes.push(
            'Microphone was not opened, so recording itself is unmeasured; only the model and pitch paths are.'
        );
    }

    const audio = syntheticSpeech();

    // Pitch first: it is independent of the model, so it still gets measured
    // even if the model never loads.
    for (let i = 0; i < RUNS; i++) {
        const started = performance.now();
        try {
            contourFrom(audio, RATE);
            findSpeechBounds(audio, RATE);
            result.pitchSeconds.push((performance.now() - started) / 1000);
        } catch (error) {
            result.failures.push(`pitch: ${(error as Error).message}`);
        }
    }

    // Model and precision can be overridden from the query string, which is how
    // candidate builds get tried in a real engine rather than guessed at.
    const params = new URLSearchParams(location.search);
    const choice = {
        model: params.get('model') ?? undefined,
        dtype: params.get('dtype') ?? undefined,
    };
    result.notes.push(`model=${choice.model ?? 'default'} dtype=${choice.dtype ?? 'default'}`);

    const client = createAsrClient();
    let lastStatus: AsrStatus = { state: 'idle', progress: 0 };
    client.subscribe(status => {
        lastStatus = status;
    });

    const loadStarted = performance.now();
    try {
        // The first transcription includes the load; timing it separately means
        // waiting for readiness first.
        client.load(choice);
        await new Promise<void>((resolve, reject) => {
            const timer = setInterval(() => {
                if (lastStatus.state === 'ready') {
                    clearInterval(timer);
                    resolve();
                } else if (lastStatus.state === 'failed') {
                    clearInterval(timer);
                    reject(new Error(lastStatus.error ?? 'model failed to load'));
                }
            }, 100);
        });
        result.modelLoadSeconds = (performance.now() - loadStarted) / 1000;

        for (let i = 0; i < RUNS; i++) {
            const started = performance.now();
            try {
                await client.transcribe(audio);
                result.transcribeSeconds.push((performance.now() - started) / 1000);
            } catch (error) {
                result.failures.push(`transcribe: ${(error as Error).message}`);
            }
        }
    } catch (error) {
        result.failures.push(`model load: ${(error as Error).message}`);
    }

    if (result.transcribeSeconds.length) {
        // Steady state, not the first run, which pays for warm-up.
        const steady = result.transcribeSeconds.slice(1);
        const mean = (steady.length ? steady : result.transcribeSeconds).reduce((a, b) => a + b, 0) /
            (steady.length || result.transcribeSeconds.length);
        result.realtimeFactor = mean / CLIP_SECONDS;
        const pitchMean =
            result.pitchSeconds.reduce((a, b) => a + b, 0) / (result.pitchSeconds.length || 1);
        result.attemptLatencySeconds = mean + pitchMean;
    }

    result.heapMb = heapMb();
    client.dispose();
    return result;
}

const rows = document.getElementById('rows');
const status = document.getElementById('status');
const json = document.getElementById('json');

function show(label: string, value: string) {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    rows?.appendChild(div);
}

run()
    .then(result => {
        const seconds = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)} s`);
        show('Model load (cold)', seconds(result.modelLoadSeconds));
        show('Transcribe 2 s clip', seconds(result.transcribeSeconds.at(-1) ?? null));
        show('Real-time factor', result.realtimeFactor?.toFixed(2) ?? '—');
        show('Pitch analysis', seconds(result.pitchSeconds.at(-1) ?? null));
        show('Attempt latency', seconds(result.attemptLatencySeconds));
        show('JS heap', result.heapMb === null ? 'not reported' : `${result.heapMb} MB`);
        show('Microphone', result.microphone);
        show('Failures', String(result.failures.length));
        if (status) status.textContent = 'Done.';
        if (json) json.textContent = JSON.stringify(result, null, 2);
        (window as unknown as { __BENCH__: BenchResult }).__BENCH__ = result;
    })
    .catch((error: Error) => {
        if (status) status.textContent = `Failed: ${error.message}`;
        (window as unknown as { __BENCH__: unknown }).__BENCH__ = {
            failures: [error.message],
            userAgent: navigator.userAgent,
        };
    });
