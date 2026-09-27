/**
 * What recognition hands the rest of the app.
 *
 * Transcription is the browser's own speech service and nothing else. The app
 * used to carry a quantized Whisper checkpoint as well, and offered the choice
 * between them; that is gone. A small model mis-hears people, and a
 * pronunciation app that marks a correct attempt wrong is not protecting
 * anybody — it teaches them to distrust the score, which is the end of its
 * usefulness. Carrying 73 MB and a WASM runtime to do a worse job than a
 * built-in API could not be justified.
 *
 * WHAT WENT WITH IT, so nobody goes looking: per-word melody. The service
 * reports no word timings, so there is no way to say which stretch of the pitch
 * contour belongs to which word. Whole-word melody, which is measured from the
 * recording rather than from the transcript, is unaffected and still the point
 * of the app.
 *
 * WHAT DID NOT GO: everything after the transcript. Alignment, phoneme scoring,
 * G2P, pitch detection and melody all still run in this page, on audio that
 * this app recorded itself.
 */
import type { SpeechBounds } from './pitch';

export interface Recognition {
    text: string;
    /**
     * Where speech was actually found in the recording.
     *
     * Measured from the signal by this app, not reported by the service, which
     * is exactly why it is worth having: comparing the two is how we tell "you
     * said it wrong" apart from "I did not hear you properly". Undefined when
     * nothing measured it — on a device where the speech service takes the
     * microphone exclusively, there is no recording to measure.
     */
    speech?: SpeechBounds | null;
}

/** Collapse the whitespace a service may hand back. */
export function cleanTranscript(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Whether this browser can do any of it.
 *
 * Two things are needed now rather than three: a microphone to record with, and
 * a speech service to transcribe with. WebAssembly and web workers used to be
 * on this list because the model needed them; nothing here does any more.
 *
 * Firefox has never shipped the speech service — it is behind a disabled flag —
 * so this is false there, and the app says so plainly rather than pretending.
 */
export function recognitionSupported(): boolean {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    if (typeof window === 'undefined') return false;
    const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition);
}

// ---------------------------------------------------------------------------
// How long to listen for
// ---------------------------------------------------------------------------

/**
 * When a take ends.
 *
 * A practice phrase and an exam answer are different shapes of speech and need
 * different rules. Three seconds of silence means "finished" for someone saying
 * "god morgen" and means "thinking" for someone a minute into describing their
 * working week — so the limits are a profile the caller picks, not constants
 * the recorder assumes.
 */
export interface ListenProfile {
    /** Silence after speech that ends the take. */
    silenceMs: number;
    /** Give up if nothing has been said by now. */
    noSpeechMs: number;
    /** Hard ceiling, so a stuck take cannot grow without bound. */
    maxMs: number;
    /** Whether the speech service should keep listening across pauses. */
    continuous: boolean;
}

/** One phrase, ending when the learner does. */
export const PHRASE: ListenProfile = {
    silenceMs: 1_200,
    noSpeechMs: 6_000,
    maxMs: 15_000,
    continuous: false,
};

/**
 * A spoken answer of up to three minutes.
 *
 * Four seconds of silence rather than one: the pause where somebody works out
 * how to say the next thing is part of the answer, and cutting it off is both
 * wrong and the single most discouraging thing a rehearsal tool could do. The
 * ceiling is above the longest task in the real exam, so it only ever catches a
 * take nobody ended.
 */
export const MONOLOGUE: ListenProfile = {
    silenceMs: 4_000,
    noSpeechMs: 20_000,
    maxMs: 180_000,
    continuous: true,
};
