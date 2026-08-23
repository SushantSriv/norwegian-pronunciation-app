import { describe, expect, it } from 'vitest';
import { countSyllables, pitchAccentFor, targetContour } from '../tonelag';

describe('countSyllables', () => {
    it('counts one nucleus per syllable', () => {
        expect(countSyllables('hei')).toBe(1);
        expect(countSyllables('mat')).toBe(1);
        expect(countSyllables('bilen')).toBe(2);
        expect(countSyllables('kylling')).toBe(2);
        expect(countSyllables('hvordan')).toBe(2);
    });

    it('treats diphthongs as a single nucleus', () => {
        expect(countSyllables('sau')).toBe(1);
        expect(countSyllables('nei')).toBe(1);
        expect(countSyllables('øye')).toBe(2);
    });

    it('is punctuation- and case-insensitive', () => {
        expect(countSyllables('Hei!')).toBe(countSyllables('hei'));
        expect(countSyllables('')).toBe(0);
    });
});

describe('pitchAccentFor', () => {
    it('gives monosyllables accent 1 - they carry no contrast', () => {
        for (const w of ['bil', 'hus', 'mat', 'hei']) {
            expect(pitchAccentFor(w).accent).toBe('ACCENT_1');
        }
    });

    it('keeps accent 1 when a monosyllabic stem takes a definite ending', () => {
        expect(pitchAccentFor('bilen').accent).toBe('ACCENT_1');
        expect(pitchAccentFor('huset').accent).toBe('ACCENT_1');
        expect(pitchAccentFor('boka').accent).toBe('ACCENT_1');
    });

    it('handles orthographic consonant doubling in definite forms', () => {
        expect(pitchAccentFor('vannet').accent).toBe('ACCENT_1');
    });

    it('defaults other polysyllables to accent 2', () => {
        for (const w of ['kylling', 'jobber', 'snakker', 'hyggelig']) {
            expect(pitchAccentFor(w).accent).toBe('ACCENT_2');
        }
    });

    it('distinguishes the classic minimal pairs', () => {
        expect(pitchAccentFor('bønder').accent).toBe('ACCENT_1');
        expect(pitchAccentFor('bønner').accent).toBe('ACCENT_2');
    });

    it('reports whether an answer was curated or merely derived', () => {
        expect(pitchAccentFor('bønder').source).toBe('curated');
        expect(pitchAccentFor('kylling').source).toBe('rule');
    });

    it('returns NONE for empty input rather than guessing', () => {
        expect(pitchAccentFor('   ').accent).toBe('NONE');
    });
});

describe('targetContour', () => {
    it('spans the whole word and stays ordered in time', () => {
        for (const accent of ['ACCENT_1', 'ACCENT_2'] as const) {
            const c = targetContour(accent);
            expect(c[0].t).toBe(0);
            expect(c[c.length - 1].t).toBe(1);
            for (let i = 1; i < c.length; i++) expect(c[i].t).toBeGreaterThan(c[i - 1].t);
        }
    });

    it('gives accent 1 a single rise and accent 2 a fall before its rise', () => {
        const one = targetContour('ACCENT_1').map(p => p.semitones);
        const two = targetContour('ACCENT_2').map(p => p.semitones);
        expect(one[one.length - 1]).toBeGreaterThan(one[0]);
        expect(Math.min(...two)).toBeLessThan(two[0]);
        expect(two[two.length - 1]).toBeGreaterThan(two[0]);
    });

    it('has no contour for NONE', () => {
        expect(targetContour('NONE')).toEqual([]);
    });
});
