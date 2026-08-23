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

const stripPunct = (w: string): string => w.replace(/[.,!?;:«»"]/g, '').toLowerCase();

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
    const heardWords = heard.split(/\s+/).filter(Boolean);

    const chunks = alignWords(expectedWords.map(stripPunct), heardWords.map(stripPunct));

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
        const expectedIpa = toIpa(refWord);
        const heardIpa = heardWord ? toIpa(heardWord) : '';
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
