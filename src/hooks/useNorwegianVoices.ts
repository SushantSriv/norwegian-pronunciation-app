import { useCallback, useEffect, useState } from 'react';
import { norwegianVoices } from '../utils/audioPlayback';

const VOICE_KEY = 'npa-voice-v1';

/**
 * Available Norwegian speech-synthesis voices plus the learner's choice.
 *
 * Which voices exist is entirely down to the OS and browser. Many machines ship
 * only one older local Norwegian voice; Edge and Chrome additionally expose much
 * better-sounding cloud voices while online.
 */
export function useNorwegianVoices() {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [voiceURI, setVoiceURI] = useState<string | null>(() => {
        try {
            return window.localStorage.getItem(VOICE_KEY);
        } catch {
            return null;
        }
    });

    useEffect(() => {
        let cancelled = false;
        norwegianVoices().then(list => {
            if (!cancelled) setVoices(list);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const chooseVoice = useCallback((uri: string) => {
        setVoiceURI(uri);
        try {
            window.localStorage.setItem(VOICE_KEY, uri);
        } catch {
            // Storage unavailable — the choice just will not persist.
        }
    }, []);

    // Fall back to the best-ranked voice when nothing is stored, or when a
    // previously chosen voice is no longer installed.
    const activeVoiceURI =
        voiceURI && voices.some(v => v.voiceURI === voiceURI) ? voiceURI : (voices[0]?.voiceURI ?? undefined);

    return { voices, activeVoiceURI, chooseVoice };
}
