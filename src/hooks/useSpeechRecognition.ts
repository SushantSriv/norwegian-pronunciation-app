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

const FRIENDLY_ERRORS: Record<string, string> = {
    'no-speech': 'I did not catch anything — try speaking a little louder.',
    'audio-capture': 'No microphone found. Check that one is connected.',
    'not-allowed': 'Microphone access was blocked. Enable it in your browser settings.',
    'service-not-allowed': 'Speech recognition was blocked by your browser.',
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
            const message = FRIENDLY_ERRORS[event.error] ?? `Speech recognition failed (${event.error}).`;
            if (message) setError(message);
            setListening(false);
        };

        recognition.onend = () => {
            setListening(false);
            setInterim('');
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
    }, [lang]);

    const start = useCallback(() => {
        const recognition = recognitionRef.current;
        if (!recognition || listening) return;
        setError(null);
        try {
            recognition.start();
        } catch {
            // start() throws if called while already running; ignore.
        }
    }, [listening]);

    const stop = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    return { supported, listening, interim, error, start, stop };
}
