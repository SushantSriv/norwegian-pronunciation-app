/**
 * Speech synthesis for reference pronunciation.
 *
 * Two browser quirks drive the design here:
 *
 * 1. `speechSynthesis.getVoices()` returns an EMPTY array on the first
 *    synchronous call in Chrome/Edge — the list is populated asynchronously and
 *    announced via `voiceschanged`. Selecting a voice synchronously silently
 *    fails, and Norwegian then gets read by the default English voice.
 *
 * 2. The list keeps GROWING. Edge registers local SAPI voices first and its
 *    much better-sounding online neural voices arrive a moment later. So we
 *    never cache a snapshot — we keep listening and always read fresh.
 */

const NORWEGIAN_LANG = /^(nb|nn|no)\b/i;
/**
 * Swedish and Danish sit far closer to Norwegian phonology than the English
 * voice a machine otherwise falls back to — same vowel-inventory family, same
 * prosodic shape. Offered only when no Norwegian voice is installed.
 */
const NEIGHBOUR_LANG = /^(sv|da)\b/i;

const hasSynthesis = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

type VoiceListener = (voices: SpeechSynthesisVoice[]) => void;
const listeners = new Set<VoiceListener>();
let attached = false;

function currentVoices(): SpeechSynthesisVoice[] {
    return hasSynthesis() ? window.speechSynthesis.getVoices() : [];
}

function attachVoicesListener() {
    if (attached || !hasSynthesis()) return;
    attached = true;
    // Deliberately NOT `once` — late-arriving neural voices fire this again.
    window.speechSynthesis.addEventListener('voiceschanged', () => {
        const voices = currentVoices();
        for (const listener of [...listeners]) listener(voices);
    });
}

/**
 * Subscribe to the voice list. Fires immediately with whatever is known now,
 * then again whenever the browser registers more. Returns an unsubscribe fn.
 */
export function subscribeToVoices(listener: VoiceListener): () => void {
    attachVoicesListener();
    listeners.add(listener);
    listener(currentVoices());

    // Safety net for browsers that never fire the event.
    const timers = [
        window.setTimeout(() => listener(currentVoices()), 300),
        window.setTimeout(() => listener(currentVoices()), 1500),
    ];

    return () => {
        listeners.delete(listener);
        timers.forEach(window.clearTimeout);
    };
}

/** Resolves once the browser has registered at least one voice (or we give up). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!hasSynthesis()) return Promise.resolve([]);

    const existing = currentVoices();
    if (existing.length) return Promise.resolve(existing);

    attachVoicesListener();
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            listeners.delete(finish);
            resolve(currentVoices());
        };
        listeners.add(finish);
        window.setTimeout(finish, 2000);
    });
}

/**
 * Rank voices best-first. Neural/cloud voices (Edge "Natural", Google) sound
 * dramatically better than the older local SAPI ones, so they come first.
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

/** Filter and rank a raw voice list. Exported so the hook can reuse it live. */
export function rankNorwegianVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
    const norwegian = all.filter(v => NORWEGIAN_LANG.test(v.lang)).sort(byQuality);
    const neighbours = all.filter(isNeighbourVoice).sort(byQuality);
    return [...norwegian, ...neighbours];
}

/**
 * Norwegian voices best-first. If the platform ships none, fall back to the
 * Scandinavian neighbours rather than leaving the learner with an English
 * voice mangling Norwegian orthography.
 */
export async function norwegianVoices(): Promise<SpeechSynthesisVoice[]> {
    return rankNorwegianVoices(await loadVoices());
}

function pickFrom(
    candidates: SpeechSynthesisVoice[],
    voiceURI?: string
): SpeechSynthesisVoice | undefined {
    if (voiceURI) {
        const chosen = candidates.find(v => v.voiceURI === voiceURI);
        if (chosen) return chosen;
    }
    return candidates[0];
}

export interface SpeakOptions {
    voiceURI?: string;
    rate?: number;
    /**
     * Fired as each word begins, with its character offset into the text. Lets
     * the UI follow along with the speech.
     */
    onBoundary?: (charIndex: number) => void;
}

function buildUtterance(text: string, voice: SpeechSynthesisVoice | undefined, options: SpeakOptions) {
    const utterance = new SpeechSynthesisUtterance(text);
    // Match the voice's own locale when we have one; otherwise ask for Bokmål,
    // which is often enough for a platform to pick the right voice by itself.
    utterance.lang = voice?.lang ?? 'nb-NO';
    try {
        if (voice) utterance.voice = voice;
    } catch {
        // Assigning a voice the engine rejects throws. Falling back to the
        // lang hint alone still speaks; failing here would speak nothing.
    }
    utterance.rate = options.rate ?? 1;
    utterance.pitch = 1;

    if (options.onBoundary) {
        utterance.onboundary = event => {
            // Some voices report only 'word'; others leave name empty.
            if (!event.name || event.name === 'word') options.onBoundary?.(event.charIndex);
        };
    }
    return utterance;
}

/**
 * Speak Norwegian text, resolving when playback finishes.
 *
 * CRITICAL: speak() is called SYNCHRONOUSLY. Mobile browsers only allow
 * speech synthesis to begin inside the user-gesture task that triggered it, so
 * awaiting anything first (voice lookup, a timer) silently blocks playback on
 * Android and iOS. Voices are read from the already-warmed cache instead.
 */
export function speakNorwegian(text: string, options: SpeakOptions = {}): Promise<void> {
    if (!hasSynthesis() || !text.trim()) return Promise.resolve();

    const synth = window.speechSynthesis;
    const voice = pickFrom(rankNorwegianVoices(currentVoices()), options.voiceURI);

    synth.cancel();
    const utterance = buildUtterance(text, voice, options);

    const finished = new Promise<void>(resolve => {
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
    });

    synth.speak(utterance);

    // Chrome occasionally drops an utterance queued in the same tick as
    // cancel(). If nothing started shortly after, queue it once more — this
    // runs outside the gesture but by then speech is already unlocked.
    window.setTimeout(() => {
        if (!synth.speaking && !synth.pending) {
            try {
                synth.speak(utterance);
            } catch {
                // Nothing more we can do.
            }
        }
    }, 250);

    return finished;
}

export function stopSpeaking() {
    if (hasSynthesis()) window.speechSynthesis.cancel();
}

/**
 * Ask the browser to start populating its voice list as early as possible, so
 * the first "Hear it" is not the thing that triggers the async fetch.
 */
export function warmUpVoices() {
    if (!hasSynthesis()) return;
    attachVoicesListener();
    void currentVoices();
}
