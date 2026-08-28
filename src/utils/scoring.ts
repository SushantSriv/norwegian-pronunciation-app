/**
 * Client-side port of backend/scoring.py.
 *
 * The GitHub Pages build has no Python backend, so alignment and phoneme
 * scoring run in the browser. Keep this behaviourally in sync with
 * backend/scoring.py — backend/tests/test_scoring.py and the Vitest suite
 * cover the same cases on both sides.
 */

import { wordToIPA } from './norwegianG2P';

export type ChunkKind = 'equal' | 'substitute' | 'delete' | 'insert';

export interface AlignmentChunk {
    kind: ChunkKind;
    refIdx: number | null;
    hypIdx: number | null;
}

/**
 * Needleman-Wunsch word alignment. Unlike naively zipping the two word
 * lists, this re-syncs after a dropped or extra word instead of cascading
 * every later index out of alignment.
 */
export function alignWords(refWords: string[], hypWords: string[]): AlignmentChunk[] {
    const n = refWords.length;
    const m = hypWords.length;

    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = 1; i <= n; i++) dp[i][0] = i;
    for (let j = 1; j <= m; j++) dp[0][j] = j;

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const subCost = refWords[i - 1] === hypWords[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j - 1] + subCost, // match / substitute
                dp[i - 1][j] + 1, // deletion (ref word missing from hyp)
                dp[i][j - 1] + 1 // insertion (extra hyp word)
            );
        }
    }

    const chunks: AlignmentChunk[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
        const subCost = i > 0 && j > 0 && refWords[i - 1] === hypWords[j - 1] ? 0 : 1;
        if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + subCost) {
            chunks.push({
                kind: subCost === 0 ? 'equal' : 'substitute',
                refIdx: i - 1,
                hypIdx: j - 1,
            });
            i--;
            j--;
        } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
            chunks.push({ kind: 'delete', refIdx: i - 1, hypIdx: null });
            i--;
        } else {
            chunks.push({ kind: 'insert', refIdx: null, hypIdx: j - 1 });
            j--;
        }
    }

    return chunks.reverse();
}

export function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    const n = a.length;
    const m = b.length;
    if (n === 0) return m;
    if (m === 0) return n;

    let prev = Array.from({ length: m + 1 }, (_, k) => k);
    for (let i = 1; i <= n; i++) {
        const curr = new Array<number>(m + 1);
        curr[0] = i;
        for (let j = 1; j <= m; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = curr;
    }
    return prev[m];
}

/**
 * Normalized similarity between two IPA strings, in [0, 1]. Used as a proxy
 * for how close a mispronounced word sounded to the target, rather than
 * marking it flatly wrong.
 */
export function phonemeSimilarity(expectedIpa: string, heardIpa: string): number {
    if (!expectedIpa && !heardIpa) return 1;
    const longest = Math.max(expectedIpa.length, heardIpa.length, 1);
    return Math.max(0, 1 - levenshtein(expectedIpa, heardIpa) / longest);
}

// ---------------------------------------------------------------------------
// Attempt scoring — mirrors what the FastAPI /upload-audio/ endpoint returned,
// so the static build and the optional backend agree on what a score means.
// ---------------------------------------------------------------------------


export type WordStatus = 'equal' | 'substitute' | 'delete';

export interface WordScore {
    word: string;
    index: number;
    status: WordStatus;
    /** Phoneme similarity in [0, 1]; 1 for a clean match. */
    score: number;
    expectedIpa: string | null;
    heardIpa: string | null;
}

export interface AttemptScore {
    expected: string;
    heard: string;
    /** Composite pronunciation score, 0-100. */
    score: number;
    wordScores: WordScore[];
    insertions: number;
}

/** Penalty applied to the composite score for each spurious extra word. */
const INSERTION_PENALTY = 3;

// ---------------------------------------------------------------------------
// Reconciling how a speech model writes Norwegian with how the corpus does
//
// A learner can say exactly the right thing and still be marked wrong, because
// the transcript spells it differently from the phrase. Neither of these is the
// learner's mistake, and both are common enough to cost a life.
// ---------------------------------------------------------------------------

/**
 * Norwegian number words and the digits a speech model writes instead.
 *
 * Whisper transcribes "fem" as "5" and "tolv" as "12" — it is transcribing, not
 * dictating — while the corpus spells them out. Nothing in the corpus contains a
 * digit, so mapping words to digits only ever brings the two sides together.
 */
const NUMBER_WORDS: Record<string, string> = {
    null: '0', en: '1', ein: '1', ett: '1', to: '2', tre: '3', fire: '4',
    fem: '5', seks: '6', sju: '7', syv: '7', åtte: '8', ni: '9', ti: '10',
    elleve: '11', tolv: '12', tretten: '13', fjorten: '14', femten: '15',
    seksten: '16', sytten: '17', atten: '18', nitten: '19', tjue: '20',
    tretti: '30', førti: '40', femti: '50', seksti: '60', sytti: '70',
    åtti: '80', nitti: '90', hundre: '100', tusen: '1000',
};

/** The first spelling listed wins, so "7" reads back as "sju" rather than "syv". */
const DIGIT_WORDS: Record<string, string> = Object.entries(NUMBER_WORDS).reduce(
    (out, [word, digits]) => (digits in out ? out : { ...out, [digits]: word }),
    {} as Record<string, string>
);

/** The form two words are compared in: punctuation gone, numbers as digits. */
export const canonicalWord = (word: string): string => {
    const bare = word
        .toLowerCase()
        .replace(/[.,!?;:«»"'’“”\-–—()]/g, '')
        .replace(/é/g, 'e');
    return NUMBER_WORDS[bare] ?? bare;
};

/**
 * What a token would have sounded like, for the phoneme comparison.
 *
 * "5" has no pronunciation the G2P can derive — every character is stripped as
 * punctuation — so a learner who said "fem" perfectly would score zero on it.
 */
export const spokenForm = (word: string): string => DIGIT_WORDS[word.trim()] ?? word;

/**
 * Rejoin compound members the transcript wrote apart.
 *
 * Norwegian writes compounds as one word and speech models are unreliable about
 * it: "skiftetøy" comes back as "skifte tøy" perhaps as often as not. Word
 * alignment then sees one expected word against two heard ones and charges the
 * learner a substitution plus an insertion for a phrase they said correctly.
 * That matters more here than in most apps, since the compounds ARE the
 * exercise in the occupation tracks.
 *
 * Only joins where the result is a word actually being asked for, so it can
 * never invent a match that was not already in the phrase.
 */
export function rejoinCompounds(expected: string[], heard: string[]): string[] {
    const wanted = new Set(expected.map(canonicalWord));
    const out: string[] = [];

    for (let i = 0; i < heard.length; i++) {
        const pair = heard[i] + heard[i + 1];
        if (i + 1 < heard.length && wanted.has(canonicalWord(pair))) {
            out.push(pair);
            i++;
            continue;
        }
        out.push(heard[i]);
    }
    return out;
}

/**
 * And the reverse: a compound the transcript ran together that the phrase
 * spells apart. Rarer, but the same unfairness.
 */
export function splitRunTogether(expected: string[], heard: string[]): string[] {
    const canonicalExpected = expected.map(canonicalWord);
    const out: string[] = [];

    for (const word of heard) {
        const bare = canonicalWord(word);
        let split: string[] | null = null;
        for (let i = 0; i + 1 < canonicalExpected.length && !split; i++) {
            if (canonicalExpected[i] + canonicalExpected[i + 1] === bare) {
                split = [expected[i], expected[i + 1]];
            }
        }
        if (split) out.push(...split);
        else out.push(word);
    }
    return out;
}

/**
 * How a word is turned into IPA. Injected so the module stays pure and
 * testable: the app passes a resolver backed by the NB Uttale lexicon for the
 * chosen dialect, while tests and the fallback path use the rule engine.
 */
export type IpaResolver = (word: string) => string;

export function scoreAttempt(
    expected: string,
    heard: string,
    toIpa: IpaResolver = wordToIPA
): AttemptScore {
    const expectedWords = expected.split(/\s+/).filter(Boolean);
    // Reconcile the two spellings of the same utterance before aligning, so a
    // learner is never charged for the transcript's choices.
    const heardWords = splitRunTogether(
        expectedWords,
        rejoinCompounds(expectedWords, heard.split(/\s+/).filter(Boolean))
    );

    const chunks = alignWords(
        expectedWords.map(canonicalWord),
        heardWords.map(canonicalWord)
    );

    const wordScores: WordScore[] = [];
    let weightedTotal = 0;
    let insertions = 0;

    for (const chunk of chunks) {
        if (chunk.kind === 'insert') {
            insertions++;
            continue;
        }

        const refIdx = chunk.refIdx as number;
        const refWord = expectedWords[refIdx];

        if (chunk.kind === 'equal') {
            wordScores.push({
                word: refWord,
                index: refIdx,
                status: 'equal',
                score: 1,
                expectedIpa: null,
                heardIpa: null,
            });
            weightedTotal += 1;
            continue;
        }

        const heardWord = chunk.hypIdx !== null ? heardWords[chunk.hypIdx] : '';
        const expectedIpa = toIpa(spokenForm(refWord));
        const heardIpa = heardWord ? toIpa(spokenForm(heardWord)) : '';
        const similarity = heardWord ? phonemeSimilarity(expectedIpa, heardIpa) : 0;

        wordScores.push({
            word: refWord,
            index: refIdx,
            status: chunk.kind,
            score: Math.round(similarity * 1000) / 1000,
            expectedIpa,
            heardIpa: heardIpa || null,
        });
        weightedTotal += similarity;
    }

    const refCount = Math.max(expectedWords.length, 1);
    const raw = (weightedTotal / refCount) * 100 - insertions * INSERTION_PENALTY;

    return {
        expected,
        heard,
        score: Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10,
        wordScores,
        insertions,
    };
}
