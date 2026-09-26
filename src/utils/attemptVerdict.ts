/**
 * Telling "you said it wrong" apart from "I did not hear you properly".
 *
 * The speech model is a small one and it mis-hears people. Presenting that as a
 * pronunciation mistake is the worst thing this app can do: the learner is told
 * they failed at something they did correctly, loses a life for it, and has no
 * way to tell the difference. Over a session that teaches them to distrust the
 * feedback, which is the end of its usefulness.
 *
 * So an attempt is judged before it is scored, and an attempt we are not
 * confident about does not count either way.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is guess from the transcript. Whether
 * "kjøkken" coming back as "hva er det" means recognition failed or the learner
 * said something else entirely is not decidable from text, and a heuristic that
 * tried would excuse real mistakes — which is worse than the problem, because
 * an app that never says you were wrong teaches nothing. The signal below is
 * evidence from the AUDIO: speech was there, and nothing came back for it.
 *
 * THERE USED TO BE A SECOND CHECK, comparing how much of the measured speech
 * the recognised words spanned. It needed per-word timings, which only the
 * on-device model produced, and that model is gone. The browser's speech
 * service returns nothing rather than a confident guess when it cannot make
 * words out, so the case that check caught mostly presents as an empty
 * transcript now — which the first branch already handles.
 */
import type { SpeechBounds } from './pitch';

export type AttemptOutcome =
    /** Nothing was said, or nothing was heard. */
    | 'no-speech'
    /** Speech was there, but the model did not account for it. */
    | 'uncertain'
    /** Heard clearly enough to trust, and it was not right. */
    | 'mispronounced'
    /** Heard clearly, and it cleared the bar. */
    | 'good';

export interface AttemptVerdict {
    outcome: AttemptOutcome;
    /** What to show the learner. Empty when the score speaks for itself. */
    message: string;
    /**
     * Whether the attempt counts towards clearing the stage or towards losing a
     * life. False means it is offered again with nothing spent.
     */
    counts: boolean;
}

/** Speech shorter than this is a cough or a click, not an attempt. */
const MIN_SPEECH_SECONDS = 0.25;

export interface AttemptEvidence {
    /** The cleaned transcript. */
    heard: string;
    /** Whether the attempt cleared the pass bar. */
    passed: boolean;
    /**
     * Where speech was found in the recording. `undefined` means no audio
     * evidence was gathered — in which case no claim about the recognition is
     * made, and the score is taken at face value.
     */
    speech?: SpeechBounds | null;
}

/**
 * Decide whether the score can be trusted as pronunciation feedback.
 *
 * With no audio evidence supplied this reduces to pass/fail, which is what the
 * scoring-only callers and the tests rely on.
 */
export function judgeAttempt(evidence: AttemptEvidence): AttemptVerdict {
    const spoke = evidence.heard.trim().length > 0;

    if (!spoke) {
        return {
            outcome: 'no-speech',
            message: 'I did not catch anything — try again a little louder.',
            counts: false,
        };
    }

    if (evidence.speech !== undefined) {
        const speech = evidence.speech;
        if (!speech || speech.end - speech.start < MIN_SPEECH_SECONDS) {
            return {
                outcome: 'no-speech',
                message: 'I did not catch anything — try again a little louder.',
                counts: false,
            };
        }

    }

    return evidence.passed
        ? { outcome: 'good', message: '', counts: true }
        : { outcome: 'mispronounced', message: '', counts: true };
}
