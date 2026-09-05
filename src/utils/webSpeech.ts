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
    signal?: AbortSignal;
}

/**
 * Errors that mean the service and our recorder are fighting over the
 * microphone rather than that the learner did anything wrong.
 */
const MIC_CONFLICT = new Set(['not-allowed', 'audio-capture', 'service-not-allowed']);

/**
 * Listen once and resolve with what was heard.
 *
 * Resolves rather than rejects on failure: a failure here is not an error the
 * learner should see, it is a signal to use the local model instead.
 */
export function listenOnce(options: WebSpeechOptions = {}): Promise<WebSpeechOutcome> {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return Promise.resolve({ text: null, error: 'unavailable' });

    return new Promise<WebSpeechOutcome>(resolve => {
        const recognition = new Ctor();
        recognition.lang = options.lang ?? 'nb-NO';
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        let settled = false;
        let final = '';

        const finish = (outcome: WebSpeechOutcome) => {
            if (settled) return;
            settled = true;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            resolve(outcome);
        };

        recognition.onresult = event => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const text = result[0]?.transcript ?? '';
                if (result.isFinal) final += text;
                else interim += text;
            }
            if (interim) options.onInterim?.(interim);
        };

        recognition.onerror = event => {
            finish({
                text: null,
                conflict: MIC_CONFLICT.has(event.error),
                error: event.error,
            });
        };

        recognition.onend = () => finish({ text: final.trim() || null });

        options.signal?.addEventListener('abort', () => {
            try {
                recognition.abort();
            } catch {
                // Already finished.
            }
            finish({ text: null, error: 'aborted' });
        });

        try {
            recognition.start();
        } catch {
            // start() throws if one is already running.
            finish({ text: null, error: 'already-running' });
        }
    });
}

// ---------------------------------------------------------------------------
// Whether to use it at all
// ---------------------------------------------------------------------------

const CHOICE_KEY = 'npa-cloud-speech-v1';
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
        // Storage unavailable; the choice just will not persist.
    }
};

/**
 * Whether the learner has agreed to the faster path.
 *
 * Defaults to OFF. Sending someone's voice to Google, Microsoft or Apple is not
 * a performance setting to opt out of afterwards — the app's whole privacy
 * claim is that recordings stay on the device, and that has to remain true
 * until the person says otherwise.
 */
export const cloudSpeechAllowed = (): boolean => read(CHOICE_KEY) === 'yes';

export const setCloudSpeechAllowed = (allowed: boolean): void =>
    write(CHOICE_KEY, allowed ? 'yes' : 'no');

/** Whether the learner has ever been asked. */
export const cloudSpeechDecided = (): boolean => read(CHOICE_KEY) !== null;

/**
 * Whether this device has proved the service will not share the microphone.
 *
 * Android Chrome routes recognition through the system speech service, which
 * takes the microphone exclusively, so our recorder fails — and without the
 * recording there is no pitch contour and no melody chart. Melody is what this
 * app is for, so the fast path stands down rather than the recorder, and the
 * answer is remembered so the cost is one attempt per device rather than one
 * per phrase.
 */
export const cloudTakesMicrophone = (): boolean => read(CONFLICT_KEY) === '1';

export const rememberCloudTakesMicrophone = (): void => write(CONFLICT_KEY, '1');

/** Everything that has to be true before the fast path is worth trying. */
export function shouldUseCloudSpeech(): boolean {
    return (
        webSpeechAvailable() &&
        cloudSpeechAllowed() &&
        !cloudTakesMicrophone() &&
        (typeof navigator === 'undefined' || navigator.onLine !== false)
    );
}
