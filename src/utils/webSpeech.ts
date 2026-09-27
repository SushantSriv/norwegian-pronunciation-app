/**
 * The browser's own speech recognition, as an optional fast path.
 *
 * This app moved recognition on-device for good reasons — Firefox and iOS were
 * locked out, nothing worked offline, and the learner's audio went to a vendor.
 * But local whisper-base is measurably slower and less accurate than the
 * browser service it replaced, and a learner feels both. So the service is back
 * as a fast path where it exists, with the local model behind it.
 *
 * Three things about it are not negotiable and are handled by the caller rather
 * than here:
 *
 *   1. It sends audio to Google, Microsoft or Apple. That has to be visible to
 *      the learner and refusable, not buried.
 *   2. On Android Chrome it takes the microphone exclusively, so a parallel
 *      recorder fails — and without the recording there is no pitch contour and
 *      no melody chart, which is the thing this app is for. Losing recognition
 *      speed is a smaller loss than losing melody, so that case falls back.
 *   3. It reports no word timings, so per-word melody is unavailable on this
 *      path. The whole-utterance chart still works.
 */

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}
interface SpeechRecognitionResult {
    readonly length: number;
    isFinal: boolean;
    [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
    readonly length: number;
    [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
    error: string;
}
interface SpeechRecognitionLike extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((e: SpeechRecognitionEventLike) => void) | null;
    onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** True when the browser exposes a recognition service at all. */
export const webSpeechAvailable = (): boolean => speechRecognitionCtor() !== null;

export interface WebSpeechOutcome {
    /** What was heard, or null if the service produced nothing. */
    text: string | null;
    /**
     * Set when the service failed in a way that means we should not keep using
     * it — chiefly a microphone it will not share.
     */
    conflict?: boolean;
    error?: string;
}

export interface WebSpeechOptions {
    lang?: string;
    /** Called with partial text as it arrives, which the local path cannot do. */
    onInterim?: (text: string) => void;
    /**
     * Keep listening across pauses, for a monologue rather than a phrase.
     *
     * A phrase ends when the learner stops talking, so the default is to stop
     * with them. Somebody answering an exam question stops to think, and a
     * recogniser that took the first pause for the end would cut them off
     * mid-answer.
     */
    continuous?: boolean;
    /** Called with the text so far each time a chunk is finalised. */
    onFinal?: (text: string) => void;
    signal?: AbortSignal;
}

/** A listening session that the caller ends, rather than the speaker. */
export interface WebSpeechSession {
    /** What was heard, once it has finished. */
    done: Promise<WebSpeechOutcome>;
    /** Ask it to finish and hand over what it has. */
    stop(): void;
}

/**
 * Errors that mean the service and our recorder are fighting over the
 * microphone rather than that the learner did anything wrong.
 */
const MIC_CONFLICT = new Set(['not-allowed', 'audio-capture', 'service-not-allowed']);

/**
 * Start listening. The caller decides when it ends.
 *
 * Resolves rather than rejects on failure: a failure here is not an error the
 * learner should see, it is something the caller has to cope with.
 *
 * THE RESTART IS NOT OPTIONAL for long answers. Even with continuous set, the
 * browser service ends a session on its own after a stretch of silence -- and
 * somebody two sentences into a two-minute exam answer, pausing to think, is
 * exactly that stretch of silence. So while the session is open and the caller
 * has not stopped it, an end nobody asked for starts it again, keeping the text
 * accumulated so far.
 */
export function listen(options: WebSpeechOptions = {}): WebSpeechSession {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
        return { done: Promise.resolve({ text: null, error: 'unavailable' }), stop: () => {} };
    }

    let settled = false;
    let stopped = false;
    let final = '';
    let recognition: SpeechRecognitionLike | null = null;
    let resolveDone: (outcome: WebSpeechOutcome) => void = () => {};

    const done = new Promise<WebSpeechOutcome>(resolve => {
        resolveDone = resolve;
    });

    const finish = (outcome: WebSpeechOutcome) => {
        if (settled) return;
        settled = true;
        stopped = true;
        if (recognition) {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
        }
        resolveDone(outcome);
    };

    const begin = () => {
        const instance = new Ctor();
        recognition = instance;
        instance.lang = options.lang ?? 'nb-NO';
        instance.continuous = options.continuous ?? false;
        instance.interimResults = true;
        instance.maxAlternatives = 1;

        instance.onresult = event => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const text = result[0]?.transcript ?? '';
                if (result.isFinal) {
                    final += text;
                    options.onFinal?.(final.trim());
                } else {
                    interim += text;
                }
            }
            if (interim) options.onInterim?.(interim);
        };

        instance.onerror = event => {
            // A silence timeout is not a failure when we mean to keep going:
            // onend will restart us. Anything else ends the session.
            if (options.continuous && !stopped && event.error === 'no-speech') return;
            finish({
                text: final.trim() || null,
                conflict: MIC_CONFLICT.has(event.error),
                error: event.error,
            });
        };

        instance.onend = () => {
            if (options.continuous && !stopped) {
                try {
                    begin();
                    return;
                } catch {
                    // Could not restart; hand over what we have.
                }
            }
            finish({ text: final.trim() || null });
        };

        instance.start();
    };

    const stop = () => {
        stopped = true;
        try {
            // stop(), not abort(): it flushes the last result rather than
            // discarding a sentence the learner has just finished saying.
            recognition?.stop();
        } catch {
            finish({ text: final.trim() || null });
        }
    };

    options.signal?.addEventListener('abort', () => {
        stopped = true;
        try {
            recognition?.abort();
        } catch {
            // Already finished.
        }
        finish({ text: final.trim() || null, error: 'aborted' });
    });

    try {
        begin();
    } catch {
        // start() throws if one is already running.
        finish({ text: null, error: 'already-running' });
    }

    return { done, stop };
}

/** Listen for one phrase, ending when the speaker does. */
export function listenOnce(options: WebSpeechOptions = {}): Promise<WebSpeechOutcome> {
    return listen(options).done;
}

// ---------------------------------------------------------------------------
// Whether to use it at all
// ---------------------------------------------------------------------------

const CONFLICT_KEY = 'npa-cloud-mic-conflict-v1';

const read = (key: string): string | null => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const write = (key: string, value: string): void => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage unavailable; the observation just will not persist.
    }
};

/**
 * Whether this device has proved the service will not share the microphone.
 *
 * Android Chrome routes recognition through the system speech service, which
 * can take the microphone exclusively, so our own recorder captures nothing —
 * and with it go the pitch contour and the melody chart.
 *
 * This used to decide something: the fast path stood down and the on-device
 * model took over, because melody is what the app is for. There is no model to
 * stand down to any more, so it is now only an observation, kept so the app can
 * explain a missing melody chart rather than leave it unexplained.
 */
export const cloudTakesMicrophone = (): boolean => read(CONFLICT_KEY) === '1';

export const rememberCloudTakesMicrophone = (): void => write(CONFLICT_KEY, '1');

/**
 * Whether recognition can work at all right now.
 *
 * The service needs both a speech API to call and a network to reach. There is
 * no longer an offline path — the on-device model was removed — so this is the
 * honest gate rather than a preference.
 */
export function speechReady(): boolean {
    return (
        webSpeechAvailable() && (typeof navigator === 'undefined' || navigator.onLine !== false)
    );
}
