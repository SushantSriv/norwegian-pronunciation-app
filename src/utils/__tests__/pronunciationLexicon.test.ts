import { describe, expect, it, beforeAll } from 'vitest';
import {
    isDialectLoaded,
    loadDialect,
    pronunciationFor,
    stripProsody,
    toneTwin,
} from '../pronunciationLexicon';

describe('stripProsody', () => {
    it('removes stress marks and syllable dots so sources are comparable', () => {
        expect(stripProsody("'hʉː.sə")).toBe('hʉːsə');
        expect(stripProsody('"ɑːv.ˌtɑː.lə')).toBe('ɑːvtɑːlə');
    });

    it('leaves bare phoneme strings untouched', () => {
        expect(stripProsody('mɑːt')).toBe('mɑːt');
    });
});

describe('pronunciationFor (before any dialect is loaded)', () => {
    it('falls back to the rule engine rather than failing', () => {
        const p = pronunciationFor('kylling', 'east');
        expect(p.source).toBe('rule');
        expect(p.ipa.length).toBeGreaterThan(0);
    });

    it('returns NONE for empty input', () => {
        expect(pronunciationFor('  ', 'east').accent).toBe('NONE');
    });
});

describe('pronunciationFor (with the east lexicon loaded)', () => {
    beforeAll(async () => {
        await loadDialect('east');
    });

    it('loads the dialect', () => {
        expect(isDialectLoaded('east')).toBe(true);
    });

    it('uses real data for covered words', () => {
        const p = pronunciationFor('mat', 'east');
        expect(p.source).toBe('lexicon');
        expect(stripProsody(p.ipa)).toBe('mɑːt');
        expect(p.accent).toBe('ACCENT_1');
    });

    it('corrects words the heuristics got wrong', () => {
        // The syllable rules called both of these accent 1; they are accent 2.
        expect(pronunciationFor('mistet', 'east').accent).toBe('ACCENT_2');
        expect(pronunciationFor('morgen', 'east').accent).toBe('ACCENT_2');
    });

    it('separates the classic minimal pair by accent alone', () => {
        expect(pronunciationFor('bønder', 'east').accent).toBe('ACCENT_1');
        expect(pronunciationFor('bønner', 'east').accent).toBe('ACCENT_2');
    });

    it('exposes alternative senses where a word has them', () => {
        // "huset" is the noun (accent 1) and a verb form (accent 2).
        const p = pronunciationFor('huset', 'east');
        expect(p.accent).toBe('ACCENT_1');
        expect(p.alternatives.length).toBeGreaterThan(0);
        expect(p.alternatives.some(a => a.accent === 'ACCENT_2')).toBe(true);
    });

    it('still falls back for words outside the lexicon', () => {
        const p = pronunciationFor('zzzqqq', 'east');
        expect(p.source).toBe('rule');
    });
});

describe('dialect variation', () => {
    it('gives genuinely different transcriptions where dialects differ', async () => {
        await Promise.all([loadDialect('east'), loadDialect('southwest')]);
        // Retroflex /rs/ is an east/west isogloss: noʂk vs norsk.
        const east = stripProsody(pronunciationFor('norsk', 'east').ipa);
        const west = stripProsody(pronunciationFor('norsk', 'southwest').ipa);
        expect(east).not.toBe(west);
        expect(east).toContain('ʂ');
        expect(west).toContain('r');
    });
});

describe('toneTwin', () => {
    beforeAll(async () => {
        await loadDialect('east');
    });

    it('finds the other word a spelling is, when only the melody separates them', () => {
        // "huset" is the house (accent 1) and housed (accent 2). 106 words in
        // this corpus are like that, and it is the most convincing evidence a
        // learner can be shown that tonelag carries meaning.
        const huset = pronunciationFor('huset', 'east');
        const twin = toneTwin(huset);
        expect(twin).not.toBeNull();
        expect(twin!.accent).not.toBe(huset.accent);
    });

    it('says nothing for a word with only one accent', () => {
        expect(toneTwin(pronunciationFor('mat', 'east'))).toBeNull();
    });

    it('says nothing when there is no accent at all', () => {
        expect(toneTwin(pronunciationFor('  ', 'east'))).toBeNull();
    });
});
