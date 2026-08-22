import { useCallback, useEffect, useState } from 'react';
import { rankNorwegianVoices, subscribeToVoices, warmUpVoices } from '../utils/audioPlayback';

const VOICE_KEY = 'npa-voice-v1';
const RATE_KEY = 'npa-rate-v1';

export const RATE_OPTIONS = [
    { value: 0.65, label: 'Slow' },
    { value: 0.85, label: 'Relaxed' },
    { value: 1, label: 'Normal' },
    { value: 1.15, label: 'Brisk' },
] as const;

function readStored(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function store(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage unavailable — the choice just will not persist.
    }
}

/**
 * Available Norwegian speech-synthesis voices plus the learner's preferences.
 *
 * The list is live: Edge registers its local voices first and the far better
 * online neural voices a moment later, so this stays subscribed rather than
 * reading once at mount.
 */
export function useNorwegianVoices() {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [voiceURI, setVoiceURI] = useState<string | null>(() => readStored(VOICE_KEY));
    const [rate, setRateState] = useState<number>(() => {
        const stored = Number(readStored(RATE_KEY));
        return RATE_OPTIONS.some(o => o.value === stored) ? stored : 1;
    });

    useEffect(() => {
        warmUpVoices();
        return subscribeToVoices(all => {
            const ranked = rankNorwegianVoices(all);
            // Only re-render when the set actually changed, since the browser
            // can fire voiceschanged repeatedly with identical contents.
            setVoices(prev => {
                const same =
                    prev.length === ranked.length &&
                    prev.every((v, i) => v.voiceURI === ranked[i].voiceURI);
                return same ? prev : ranked;
            });
        });
    }, []);

    const chooseVoice = useCallback((uri: string) => {
        setVoiceURI(uri);
        store(VOICE_KEY, uri);
    }, []);

    const setRate = useCallback((next: number) => {
        setRateState(next);
        store(RATE_KEY, String(next));
    }, []);

    // Fall back to the best-ranked voice when nothing is stored, or when a
    // previously chosen voice is no longer installed.
    const activeVoiceURI =
        voiceURI && voices.some(v => v.voiceURI === voiceURI)
            ? voiceURI
            : (voices[0]?.voiceURI ?? undefined);

    return { voices, activeVoiceURI, chooseVoice, rate, setRate };
}
