import { describe, expect, it } from 'vitest';
import { alignWords, levenshtein, phonemeSimilarity } from '../scoring';
import { wordToIPA } from '../norwegianG2P';
import { tokenizeIPA } from '../ipaTokenizer';
import { getPhonemeHint } from '../pronunciationHints';
import sentenceData from '../../data/sentences.json';

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

describe('G2P / hints contract', () => {
    // The practice UI explains each phoneme it shows. If the G2P emits a symbol
    // the hint map does not know, the learner sees "(no explanation)" instead.
    it('every phoneme produced from the whole corpus has a hint', () => {
        const pools = (sentenceData as { levels: Record<string, string[]> }).levels;
        const unexplained = new Set<string>();

        for (const items of Object.values(pools)) {
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
