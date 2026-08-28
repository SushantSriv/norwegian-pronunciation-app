import { describe, expect, it } from 'vitest';
import {
    alignWords,
    canonicalWord,
    levenshtein,
    phonemeSimilarity,
    rejoinCompounds,
    scoreAttempt,
    spokenForm,
    splitRunTogether,
} from '../scoring';
import { wordToIPA } from '../norwegianG2P';
import { tokenizeIPA } from '../ipaTokenizer';
import { getPhonemeHint } from '../pronunciationHints';
import sentenceData from '../../data/sentences.json';
import occupationData from '../../data/occupations.json';

describe('alignWords', () => {
    it('marks identical sequences equal', () => {
        expect(alignWords(['a', 'b'], ['a', 'b']).map(c => c.kind)).toEqual(['equal', 'equal']);
    });

    it('re-syncs after an inserted word instead of cascading', () => {
        // The old zip()-based comparison flagged "b" and "c" as wrong here.
        const kinds = alignWords(['a', 'b', 'c'], ['a', 'x', 'b', 'c']).map(c => c.kind);
        expect(kinds.filter(k => k === 'equal')).toHaveLength(3);
        expect(kinds).toContain('insert');
    });

    it('re-syncs after a deleted word', () => {
        const chunks = alignWords(['a', 'b', 'c'], ['a', 'c']);
        expect(chunks.filter(c => c.kind === 'equal')).toHaveLength(2);
        const deleted = chunks.find(c => c.kind === 'delete');
        expect(deleted?.refIdx).toBe(1);
    });

    it('reports substitutions with both indices', () => {
        const sub = alignWords(['a', 'b'], ['a', 'z']).find(c => c.kind === 'substitute');
        expect(sub).toMatchObject({ refIdx: 1, hypIdx: 1 });
    });

    it('handles empty input on either side', () => {
        expect(alignWords([], []).length).toBe(0);
        expect(alignWords(['a'], []).map(c => c.kind)).toEqual(['delete']);
        expect(alignWords([], ['a']).map(c => c.kind)).toEqual(['insert']);
    });
});

describe('phonemeSimilarity', () => {
    it('scores identical transcriptions 1', () => {
        expect(phonemeSimilarity('mɑːt', 'mɑːt')).toBe(1);
    });

    it('scores a near-miss above a total miss', () => {
        const near = phonemeSimilarity(wordToIPA('mat'), wordToIPA('matt'));
        const far = phonemeSimilarity(wordToIPA('mat'), wordToIPA('bil'));
        expect(near).toBeGreaterThan(far);
        expect(near).toBeLessThan(1);
    });

    it('stays within [0, 1]', () => {
        for (const [a, b] of [['', ''], ['a', ''], ['', 'b'], ['abc', 'xyz']]) {
            const s = phonemeSimilarity(a, b);
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThanOrEqual(1);
        }
    });

    it('agrees with raw edit distance', () => {
        expect(levenshtein('kitten', 'sitting')).toBe(3);
    });
});

describe('reconciling how a speech model writes Norwegian', () => {
    it('treats a digit and its Norwegian word as the same answer', () => {
        // Whisper transcribes rather than dictates, so "fem" comes back as "5".
        expect(canonicalWord('fem')).toBe(canonicalWord('5'));
        expect(canonicalWord('Tolv,')).toBe(canonicalWord('12'));
        expect(canonicalWord('sju')).toBe(canonicalWord('syv'));
    });

    it('leaves ordinary words alone apart from case and punctuation', () => {
        expect(canonicalWord('Hei!')).toBe('hei');
        expect(canonicalWord('«god»')).toBe('god');
        expect(canonicalWord('kaffe')).toBe('kaffe');
    });

    it('gives a digit back its pronunciation', () => {
        // Every character of "5" is stripped as punctuation by the G2P, so
        // without this a learner who said "fem" perfectly scores zero on it.
        expect(spokenForm('5')).toBe('fem');
        expect(spokenForm('7')).toBe('sju');
        expect(spokenForm('kaffe')).toBe('kaffe');
    });

    it('scores a spelled-out number said correctly as correct', () => {
        const graded = scoreAttempt('jeg har tolv bøker', 'jeg har 12 bøker');
        expect(graded.score).toBe(100);
        expect(graded.wordScores.every(w => w.status === 'equal')).toBe(true);
    });

    it('rejoins a compound the transcript wrote apart', () => {
        expect(rejoinCompounds(['skiftetøy'], ['skifte', 'tøy'])).toEqual(['skiftetøy']);
        // Untouched when the join is not a word the phrase asked for.
        expect(rejoinCompounds(['skiftetøy'], ['god', 'morgen'])).toEqual(['god', 'morgen']);
    });

    it('splits a compound the transcript ran together', () => {
        expect(splitRunTogether(['god', 'morgen'], ['godmorgen'])).toEqual(['god', 'morgen']);
        expect(splitRunTogether(['god', 'morgen'], ['god', 'morgen'])).toEqual(['god', 'morgen']);
    });

    it('does not charge a learner for the transcript’s spelling of a compound', () => {
        // The occupation tracks ARE compounds, so getting this wrong would
        // penalise exactly the vocabulary the app is best at teaching.
        const apart = scoreAttempt('jeg henter skiftetøy', 'jeg henter skifte tøy');
        expect(apart.score).toBe(100);
        expect(apart.insertions).toBe(0);

        const together = scoreAttempt('god morgen', 'godmorgen');
        expect(together.score).toBe(100);
    });

    it('still marks a genuinely wrong word wrong', () => {
        const graded = scoreAttempt('jeg henter skiftetøy', 'jeg henter kaffe');
        expect(graded.score).toBeLessThan(80);
        expect(graded.wordScores.some(w => w.status === 'substitute')).toBe(true);
    });
});

describe('G2P / hints contract', () => {
    // The practice UI explains each phoneme it shows. If the G2P emits a symbol
    // the hint map does not know, the learner sees "(no explanation)" instead.
    it('every phoneme produced from the whole corpus has a hint', () => {
        // Both corpora: the practice pool draws from sentences.json for the
        // general stages and occupations.json for the occupation ones, and
        // this only ever checked the first of those.
        const pools = [
            ...Object.values((sentenceData as { levels: Record<string, string[]> }).levels),
            ...Object.values(occupationData as Record<string, string[]>),
        ];
        const unexplained = new Set<string>();

        for (const items of pools) {
            for (const item of items) {
                for (const word of item.split(/\s+/)) {
                    for (const symbol of tokenizeIPA(wordToIPA(word))) {
                        if (!getPhonemeHint(symbol)) unexplained.add(symbol);
                    }
                }
            }
        }

        expect([...unexplained]).toEqual([]);
    });
});
