/**
 * Deciding what an empty transcript actually means.
 *
 * Three quite different things end a take with no words in it, and the app has
 * to do something different about each:
 *
 *   1. NOBODY SPOKE. No audible speech in the recording either. Say so.
 *   2. THE SERVICE MISHEARD. There was speech and it came back with nothing it
 *      was willing to commit to. Ask for another go.
 *   3. THE RECORDER STARVED THE SERVICE. There was speech, clearly, and yet not
 *      one word — and that keeps happening. On iOS, which is every browser on
 *      an iPhone or iPad because Apple requires them all to use WebKit, a
 *      MediaRecorder holding the microphone and a speech service asking for it
 *      do not share: the recorder wins and recognition returns empty every
 *      single time. A learner then reads "jeg fikk ikke tak i ordene" after
 *      every attempt they will ever make, which sounds like a verdict on their
 *      pronunciation and is nothing of the sort.
 *
 * The third is the one worth acting on, and the action is to stop recording so
 * the service can hear. That costs the melody chart and listening back, and
 * buys the words — which nothing else can supply.
 *
 * Pure, and separate from the hook, because this is the rule and the hook is
 * the plumbing. It was buried in an async callback where it could only be
 * exercised through a browser, and therefore was not.
 */

export type EmptyVerdict =
    /** Nothing audible. */
    | 'stille'
    /** Audible speech, no words. Try again. */
    | 'ikke-forstatt'
    /** Audible speech, no words, and the recorder is why. Stand it down. */
    | 'opptaket-tar-mikrofonen';

export interface EmptyCase {
    /** Whether a recording was captured at all. */
    hasRecording: boolean;
    /**
     * Whether anything in it was loud enough to be speech.
     *
     * THREE-VALUED ON PURPOSE. `null` means the recording could not be
     * decoded, and that is not the same as silence: a clip this app failed to
     * read is a clip it knows nothing about. Folding the two together told
     * people who had just spoken clearly that nothing was heard, which is both
     * wrong and discouraging in the same breath.
     */
    hasSpeech: boolean | null;
    /** Whether this device has already been seen to starve the service. */
    alreadyKnown: boolean;
}

/**
 * What to make of a take that produced no transcript.
 *
 * A recording with speech in it and no words back is the tell. It is judged on
 * a single take rather than after several, deliberately: the alternative is to
 * let somebody fail two or three times first, and on a device where this
 * happens it will happen every time, so waiting only adds failures.
 *
 * Once known, it is not diagnosed again — the recorder is already standing
 * down, so an empty transcript after that means something else.
 */
export function diagnoseEmptyTranscript({
    hasRecording,
    hasSpeech,
    alreadyKnown,
}: EmptyCase): EmptyVerdict {
    // Only a measured absence of speech is silence. Not knowing is not.
    if (hasSpeech === false) return 'stille';
    if (hasRecording && !alreadyKnown) return 'opptaket-tar-mikrofonen';
    return 'ikke-forstatt';
}

export const EMPTY_MESSAGES: Record<EmptyVerdict, string> = {
    stille: 'Jeg hørte ingenting — prøv å snakke litt høyere.',
    'ikke-forstatt': 'Jeg hørte deg, men fikk ikke tak i ordene — prøv en gang til.',
    'opptaket-tar-mikrofonen':
        'På denne enheten kan ikke opptak og taletjenesten dele mikrofonen. Appen slutter å ta opp, så du får teksten — men ikke melodikurven eller avspilling. Prøv en gang til.',
};
