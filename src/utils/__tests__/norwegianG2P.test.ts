import { describe, expect, it } from 'vitest';
import { phraseToIPA, wordToIPA } from '../norwegianG2P';

describe('wordToIPA', () => {
    it('lengthens a vowel with at most one following consonant', () => {
        expect(wordToIPA('mat')).toBe('mɑːt');
        expect(wordToIPA('sol')).toBe('suːl');
        expect(wordToIPA('hus')).toBe('hʉːs');
        expect(wordToIPA('ja')).toBe('jɑː');
    });

    it('shortens a vowel before a consonant cluster', () => {
        expect(wordToIPA('takk')).toBe('tɑk');
        expect(wordToIPA('fisk')).toBe('fisk');
    });

    it('maps diphthongs', () => {
        expect(wordToIPA('hei')).toBe('hæɪ');
        expect(wordToIPA('nei')).toBe('næɪ');
    });

    it('handles the palatalized kj / sj / skj series', () => {
        expect(wordToIPA('kjøtt')).toBe('çøt');
        expect(wordToIPA('sju')).toBe('ʃʉː');
        expect(wordToIPA('skjære')).toBe('ʃæːrə');
    });

    it('fuses r + alveolar into retroflexes', () => {
        expect(wordToIPA('norsk')).toBe('nɔʂk');
        expect(wordToIPA('lørdag')).toBe('løɖɑːg');
    });

    it('reduces unstressed final syllables to schwa', () => {
        expect(wordToIPA('ikke')).toBe('ikə');
        expect(wordToIPA('huset')).toBe('hʉːsə');
        expect(wordToIPA('jobber')).toBe('jɔbər');
    });

    it('uses the irregular table for high-frequency function words', () => {
        expect(wordToIPA('jeg')).toBe('jæɪ');
        expect(wordToIPA('og')).toBe('ɔ');
        expect(wordToIPA('god')).toBe('guː');
    });

    it('is case- and punctuation-insensitive', () => {
        expect(wordToIPA('Hei!')).toBe(wordToIPA('hei'));
        expect(wordToIPA('')).toBe('');
    });
});

describe('phraseToIPA', () => {
    it('keeps word boundaries', () => {
        expect(phraseToIPA('god natt')).toBe('guː nɑt');
    });
});
