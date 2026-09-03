/**
 * Melody, word by word, across a whole phrase.
 *
 * Until now the melody chart could only talk about one word at a time, because
 * there was no way to say which stretch of the pitch contour belonged to which
 * word. A learner practising "jeg kjøpte en ny bil i går" was told their melody
 * scored 61 and left to work out where.
 *
 * Whisper's per-word timestamps close that gap, and everything else here is
 * already built: `alignWords` decides which heard word answers which expected
 * one, the contour is already normalised to semitones against the speaker's own
 * median, `scoreMelody` and `classifyAccent` judge a contour against an accent,
 * and the lexicon knows which accent each word takes. This module is the wiring
 * between them, not new machinery.
 *
 * A caution the UI has to respect: the word spans come from the model's
 * attention rather than from measuring the signal, and they drift — most
 * visibly at the start of a clip. A word whose span lands in the wrong place
 * gets judged on the wrong audio, so the verdicts are advice, not verdicts.
 */
import { countSyllables, type PitchAccent } from '../data/tonelag';
import { targetContour } from '../data/tonelag';
import type { WordTiming } from './asr';
import { adviseMelody, type MelodyAdvice } from './melodyAdvice';
import { classifyAccent, sampleContour, scoreMelody, type AccentVerdict } from './melodyScore';
import type { PitchContour, PitchPoint } from './pitch';
import { canonicalWord, alignWords } from './scoring';
import { resample } from './dtw';

/** How a word's melody came out. */
export type WordMelodyStatus =
    /** Tracked the expected accent. */
    | 'good'
    /** Recognisably the right shape, but loose. */
    | 'close'
    /** The wrong accent, or nothing like the target. */
    | 'wrong'
    /** One syllable, so there is no tonal contrast to get right. */
    | 'no-contrast'
    /** The word was not heard at all. */
    | 'not-heard'
    /** Heard, but with too little voiced sound to read a melody from. */
    | 'unmeasurable';

export interface WordMelody {
    /** Position in the expected phrase. */
    index: number;
    word: string;
    /** The accent this word takes. */
    expected: PitchAccent;
    status: WordMelodyStatus;
    /** 0-100 against the expected accent, where one could be measured. */
    score: number | null;
    /** Which accent the delivery actually fits. */
    produced: AccentVerdict | null;
    advice: MelodyAdvice | null;
    /** Where the word sat in the recording. */
    span: { start: number; end: number } | null;
    /** The learner's own contour over that span, for drawing. */
    points: PitchPoint[];
}

/** Points to resample both contours to before comparing shapes. */
const SHAPE_RESOLUTION = 32;

/** Voiced frames below which there is no melody to read. */
const MIN_VOICED = 8;

const GOOD_SCORE = 65;
const CLOSE_SCORE = 30;

/**
 * Merge adjacent heard words whose join is a word the phrase asked for.
 *
 * The same reconciliation `scoreAttempt` does, carried onto the timings so the
 * two agree: when Whisper writes "skiftetøy" as "skifte tøy", scoring treats it
 * as one word and so must the melody, or the spans stop lining up with the
 * words being judged.
 */
export function mergeCompoundTimings(expected: string[], heard: WordTiming[]): WordTiming[] {
    const wanted = new Set(expected.map(canonicalWord));
    const out: WordTiming[] = [];

    for (let i = 0; i < heard.length; i++) {
        const next = heard[i + 1];
        if (next && wanted.has(canonicalWord(heard[i].word + next.word))) {
            out.push({
                word: heard[i].word + next.word,
                start: heard[i].start,
                end: next.end,
            });
            i++;
            continue;
        }
        out.push(heard[i]);
    }
    return out;
}

/** The contour points falling inside a word's span. */
export function sliceContour(contour: PitchContour, start: number, end: number): PitchPoint[] {
    return contour.points.filter(point => point.time >= start && point.time <= end);
}

export interface PhraseMelodyInput {
    /** The phrase the learner was asked to say. */
    expected: string;
    /** Heard words with their spans, from the speech model. */
    words: WordTiming[];
    contour: PitchContour;
    /** Which accent a word takes — normally backed by the NB Uttale lexicon. */
    accentFor: (word: string) => PitchAccent;
}

/**
 * Judge each word of the phrase separately, so the learner is told WHERE the
 * melody went wrong rather than only that it did.
 *
 * Returns one entry per expected word, in order, always — a word that was not
 * heard still gets a row, because its absence is itself the feedback.
 */
export function analysePhraseMelody(input: PhraseMelodyInput): WordMelody[] {
    const expectedWords = input.expected.split(/\s+/).filter(Boolean);
    if (!expectedWords.length) return [];

    const timings = mergeCompoundTimings(expectedWords, input.words);
    const chunks = alignWords(
        expectedWords.map(canonicalWord),
        timings.map(timing => canonicalWord(timing.word))
    );

    /** Which heard word answered each expected one. */
    const heardFor = new Map<number, WordTiming>();
    for (const chunk of chunks) {
        if (chunk.refIdx === null || chunk.hypIdx === null) continue;
        heardFor.set(chunk.refIdx, timings[chunk.hypIdx]);
    }

    return expectedWords.map((word, index) =>
        judgeWord(word, index, heardFor.get(index), input)
    );
}

function judgeWord(
    word: string,
    index: number,
    timing: WordTiming | undefined,
    input: PhraseMelodyInput
): WordMelody {
    const expected = input.accentFor(word);

    const base: WordMelody = {
        index,
        word,
        expected,
        status: 'not-heard',
        score: null,
        produced: null,
        advice: null,
        span: null,
        points: [],
    };

    // A monosyllable carries no tonal contrast at all, so there is nothing to
    // get right or wrong. Marking it would be inventing feedback.
    if (countSyllables(word) <= 1 || expected === 'NONE') {
        return { ...base, status: 'no-contrast' };
    }

    if (!timing) return base;

    const points = sliceContour(input.contour, timing.start, timing.end);
    const span = { start: timing.start, end: timing.end };
    const voiced = points.filter(point => point.semitones !== null);
    if (voiced.length < MIN_VOICED) {
        return { ...base, status: 'unmeasurable', span, points };
    }

    const wordContour: PitchContour = { ...input.contour, points };
    const scored = scoreMelody(wordContour, expected);
    const produced = classifyAccent(wordContour);
    if (!scored) return { ...base, status: 'unmeasurable', span, points };

    const user = resample(
        voiced.map(point => point.semitones as number),
        SHAPE_RESOLUTION
    );
    const target = sampleContour(targetContour(expected), SHAPE_RESOLUTION);
    const advice = adviseMelody(user, target, produced, expected);

    const status: WordMelodyStatus =
        advice.issue === 'wrong-accent' || scored.score < CLOSE_SCORE
            ? 'wrong'
            : scored.score >= GOOD_SCORE
              ? 'good'
              : 'close';

    return { index, word, expected, status, score: scored.score, produced, advice, span, points };
}

/** The words worth showing the learner first: the ones that went wrong. */
export function problemWords(melody: WordMelody[]): WordMelody[] {
    const rank: Record<WordMelodyStatus, number> = {
        wrong: 0,
        close: 1,
        'not-heard': 2,
        unmeasurable: 3,
        good: 4,
        'no-contrast': 5,
    };
    return melody
        .filter(entry => entry.status === 'wrong' || entry.status === 'close')
        .sort((a, b) => rank[a.status] - rank[b.status] || (a.score ?? 0) - (b.score ?? 0));
}
