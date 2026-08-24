import { useCallback, useEffect, useRef, useState } from 'react';
import { speakNorwegian, stopSpeaking } from '../utils/audioPlayback';

/**
 * Speaks a phrase while reporting which word is currently being said, so the
 * UI can follow along. The Web Speech API reports boundaries as a character
 * offset into the utterance text, which we map back to a word index.
 */
export function useSpokenPhrase() {
    const [speakingIndex, setSpeakingIndex] = useState(-1);
    const [speaking, setSpeaking] = useState(false);
    // Online voices are fetched from a server, so there is a real gap between
    // asking for speech and hearing it. Surfaced so the button can say so.
    const [preparing, setPreparing] = useState(false);
    const runIdRef = useRef(0);

    // Silence the voice if the hook goes away mid-phrase. No need to touch the
    // run id here: any pending speak() resolves into setState calls that React
    // simply ignores once unmounted, and the id guard still covers the case it
    // exists for — starting a new phrase while one is already playing.
    useEffect(() => stopSpeaking, []);

    const speak = useCallback(async (phrase: string, options: { voiceURI?: string; rate?: number } = {}) => {
        const runId = ++runIdRef.current;

        // Character offset at which each word starts, so a boundary event can
        // be resolved to a word without re-scanning the string every time.
        const starts: number[] = [];
        let cursor = 0;
        for (const word of phrase.split(' ')) {
            starts.push(cursor);
            cursor += word.length + 1;
        }

        setSpeaking(true);
        setPreparing(true);
        setSpeakingIndex(-1);

        await speakNorwegian(phrase, {
            ...options,
            onStart: () => {
                if (runIdRef.current === runId) setPreparing(false);
            },
            onBoundary: charIndex => {
                if (runIdRef.current !== runId) return;
                // The last word whose start is at or before this offset.
                let index = 0;
                for (let i = 0; i < starts.length; i++) {
                    if (starts[i] <= charIndex) index = i;
                    else break;
                }
                setSpeakingIndex(index);
            },
        });

        if (runIdRef.current !== runId) return;
        setSpeaking(false);
        setPreparing(false);
        setSpeakingIndex(-1);
    }, []);

    const stop = useCallback(() => {
        runIdRef.current++;
        stopSpeaking();
        setSpeaking(false);
        setPreparing(false);
        setSpeakingIndex(-1);
    }, []);

    return { speak, stop, speaking, preparing, speakingIndex };
}
