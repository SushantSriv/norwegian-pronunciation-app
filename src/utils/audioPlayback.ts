/**
 * Speech synthesis for reference pronunciation.
 *
 * The important subtlety: speechSynthesis.getVoices() returns an EMPTY array on
 * the first synchronous call in Chrome/Edge — the list is populated
 * asynchronously and announced via the `voiceschanged` event. Selecting a voice
 * synchronously therefore silently fails, and the browser reads Norwegian text
 * with the default (usually English) voice, which sounds nothing like Norwegian.
 * Everything here goes through the awaited `loadVoices()`.
 */

const NORWEGIAN_LANG = /^(nb|nn|no)\b/i;
/**
 * Swedish and Danish sit far closer to Norwegian phonology than the English
 * voice a machine otherwise falls back to — same vowel-inventory family, same
 * prosodic shape. Offered only when no Norwegian voice is installed.
 */
const NEIGHBOUR_LANG = /^(sv|da)\b/i;

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
    if (voicesPromise) return voicesPromise;

    voicesPromise = new Promise(resolve => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            resolve([]);
            return;
        }

        const existing = window.speechSynthesis.getVoices();
        if (existing.length) {
            resolve(existing);
            return;
        }

        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve(window.speechSynthesis.getVoices());
        };

        window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
        // Some browsers never fire voiceschanged; do not hang forever.
        window.setTimeout(finish, 2000);
    });

    return voicesPromise;
}

/**
 * Rank Norwegian voices best-first. Neural/cloud voices (Edge "Natural",
 * Google) sound dramatically better than the older local SAPI ones, so they
 * come first.
 */
function quality(voice: SpeechSynthesisVoice): number {
    const name = voice.name.toLowerCase();
    if (name.includes('natural') || name.includes('neural')) return 0;
    if (!voice.localService) return 1;
    return 2;
}

function byQuality(a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) {
    return quality(a) - quality(b) || a.name.localeCompare(b.name);
}

/** True when this voice is a neighbouring language rather than Norwegian. */
export function isNeighbourVoice(voice: SpeechSynthesisVoice): boolean {
    return !NORWEGIAN_LANG.test(voice.lang) && NEIGHBOUR_LANG.test(voice.lang);
}

/**
 * Norwegian voices best-first. If the platform ships none, fall back to the
 * Scandinavian neighbours rather than leaving the learner with an English
 * voice mangling Norwegian orthography.
 */
export async function norwegianVoices(): Promise<SpeechSynthesisVoice[]> {
    const all = await loadVoices();
    const norwegian = all.filter(v => NORWEGIAN_LANG.test(v.lang)).sort(byQuality);
    const neighbours = all.filter(isNeighbourVoice).sort(byQuality);
    return [...norwegian, ...neighbours];
}

async function pickVoice(voiceURI?: string): Promise<SpeechSynthesisVoice | undefined> {
    const candidates = await norwegianVoices();
    if (voiceURI) {
        const chosen = candidates.find(v => v.voiceURI === voiceURI);
        if (chosen) return chosen;
    }
    return candidates[0];
}

export interface SpeakOptions {
    voiceURI?: string;
    rate?: number;
}

/** Speak Norwegian text, resolving when playback finishes. */
export async function speakNorwegian(text: string, options: SpeakOptions = {}): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!text.trim()) return;

    const voice = await pickVoice(options.voiceURI);

    window.speechSynthesis.cancel();
    // Chrome drops an utterance queued in the same tick as cancel().
    await new Promise(resolve => window.setTimeout(resolve, 60));

    return new Promise<void>(resolve => {
        const utterance = new SpeechSynthesisUtterance(text);
        // Match the voice's own locale when we have one; otherwise ask for
        // Bokmål and hope the platform obliges.
        utterance.lang = voice?.lang ?? 'nb-NO';
        if (voice) utterance.voice = voice;
        utterance.rate = options.rate ?? 1;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
    });
}

export function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}
