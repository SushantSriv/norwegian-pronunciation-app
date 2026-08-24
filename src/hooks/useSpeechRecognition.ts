import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal typings for the Web Speech API. It is not in TypeScript standard DOM
 * lib, and it is still vendor-prefixed in Chrome/Edge.
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

function getRecognitionCtor(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Coarse mobile check — only used to decide whether to risk a parallel recorder. */
const IS_MOBILE =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/**
 * Obtain microphone permission without holding the device.
 *
 * On mobile we deliberately never open a recorder, because the recogniser
 * wants the microphone to itself. The side effect is that nothing ever asks
 * for permission, and a site with no microphone grant can have speech
 * recognition refused outright. Requesting a stream and releasing it straight
 * away grants the permission and leaves the microphone free.
 */
async function ensureMicPermission(): Promise<void> {
    try {
        const perms = navigator.permissions as Permissions | undefined;
        if (perms?.query) {
            const status = await perms.query({ name: 'microphone' as PermissionName });
            // Already granted: skip the request so we do not add latency.
            if (status.state === 'granted') return;
        }
    } catch {
        // Not every browser supports querying the microphone permission.
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
    } catch {
        // Denied or no device. Let recognition report the real reason.
    }
}

const FRIENDLY_ERRORS: Record<string, string> = {
    'no-speech': 'I did not catch anything — try speaking a little louder.',
    'audio-capture': 'No microphone found. Check that one is connected.',
    'not-allowed':
        'Microphone access was blocked. Allow it for this site, then tap the mic again.',
    'service-not-allowed':
        'Your browser refused the speech service. Open the site directly in Chrome (not an installed shortcut), and allow the microphone for it in site settings.',
    network: 'Speech recognition needs an internet connection.',
    aborted: '',
};

interface Options {
    lang?: string;
    onResult: (transcript: string) => void;
}

export function useSpeechRecognition({ lang = 'nb-NO', onResult }: Options) {
    const supported = getRecognitionCtor() !== null;
    const [listening, setListening] = useState(false);
    const [interim, setInterim] = useState('');
    const [error, setError] = useState<string | null>(null);
    /** Object URL of the learner's own last recording, for A/B comparison. */
    const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

    // The Web Speech API never hands back the audio it captured, so we run a
    // MediaRecorder on a parallel mic stream purely so the learner can hear
    // what they actually said next to the reference pronunciation.
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const recordingUrlRef = useRef<string | null>(null);
    /**
     * Whether we can hold a MediaRecorder open alongside SpeechRecognition.
     * Android Chrome routes recognition through the system speech service,
     * which wants the microphone to itself — a concurrent getUserMedia stream
     * makes recognition fail with a permission error. Recognition is the
     * essential feature, so on mobile we do not record by default, and we turn
     * recording off anywhere it turns out to conflict.
     */
    const canRecordRef = useRef(!IS_MOBILE);
    // Mirrored as state so the UI can explain why listen-back is unavailable.
    const [recordingAvailable, setRecordingAvailable] = useState(!IS_MOBILE);
    const wasRecordingRef = useRef(false);
    // Live analyser over the same mic stream, so the UI can render the learner's
    // voice as they speak. Exposed as a ref so the visualiser can drive its own
    // requestAnimationFrame loop without re-rendering this hook every frame.
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const stopRecorder = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        mediaRecorderRef.current = null;
        analyserRef.current = null;
        void audioContextRef.current?.close();
        audioContextRef.current = null;
    }, []);

    // Release the last object URL when the hook goes away.
    useEffect(
        () => () => {
            if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        },
        []
    );

    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    // Keep the latest callback without re-creating the recognizer each render.
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;
    // A run that ends with no final result should still release the UI.
    const gotResultRef = useRef(false);

    useEffect(() => {
        const Ctor = getRecognitionCtor();
        if (!Ctor) return;

        const recognition = new Ctor();
        recognition.lang = lang;
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            gotResultRef.current = false;
            setListening(true);
            setError(null);
            setInterim('');
        };

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
            let finalText = '';
            let interimText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const text = result[0]?.transcript ?? '';
                if (result.isFinal) finalText += text;
                else interimText += text;
            }
            if (interimText) setInterim(interimText);
            if (finalText.trim()) {
                gotResultRef.current = true;
                setInterim('');
                onResultRef.current(finalText.trim());
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
            const micProblem = event.error === 'not-allowed' || event.error === 'audio-capture';

            // If recognition was denied the microphone while we were also
            // recording, the recorder is the likely culprit. Give that up
            // rather than the core feature, and invite an immediate retry.
            if (micProblem && wasRecordingRef.current && canRecordRef.current) {
                canRecordRef.current = false;
                setRecordingAvailable(false);
                stopRecorder();
                setError('Freeing the microphone for speech recognition — tap the mic to try again.');
                setListening(false);
                return;
            }

            const message = FRIENDLY_ERRORS[event.error] ?? `Speech recognition failed (${event.error}).`;
            if (message) setError(message);
            setListening(false);
        };

        recognition.onend = () => {
            setListening(false);
            setInterim('');
            stopRecorder();
        };

        recognitionRef.current = recognition;
        return () => {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.onstart = null;
            recognition.abort();
            recognitionRef.current = null;
        };
    }, [lang, stopRecorder]);

    const start = useCallback(async () => {
        const recognition = recognitionRef.current;
        if (!recognition || listening) return;
        setError(null);

        // Capture audio first so we do not miss the opening syllable. A failure
        // here is not fatal: recognition (and therefore scoring) still works,
        // the learner just cannot play their attempt back.
        wasRecordingRef.current = false;
        try {
            if (!canRecordRef.current) throw new Error('recording disabled on this device');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];
            recorder.ondataavailable = e => {
                if (e.data.size) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                if (!chunksRef.current.length) return;
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                chunksRef.current = [];
                if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
                const url = URL.createObjectURL(blob);
                recordingUrlRef.current = url;
                setRecordingUrl(url);
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            wasRecordingRef.current = true;

            // Tap the same stream for live level data.
            const AudioCtor =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AudioCtor) {
                const context = new AudioCtor();
                const analyser = context.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.75;
                context.createMediaStreamSource(stream).connect(analyser);
                audioContextRef.current = context;
                analyserRef.current = analyser;
            }
        } catch {
            mediaRecorderRef.current = null;
            // No recorder means nothing has asked for the microphone, so make
            // sure the permission exists before the recogniser needs it.
            await ensureMicPermission();
        }

        try {
            recognition.start();
        } catch {
            // start() throws if called while already running; ignore.
        }
    }, [listening]);

    const stop = useCallback(() => {
        recognitionRef.current?.stop();
        stopRecorder();
    }, [stopRecorder]);

    return {
        supported,
        listening,
        interim,
        error,
        recordingUrl,
        recordingAvailable,
        analyserRef,
        start,
        stop,
    };
}
