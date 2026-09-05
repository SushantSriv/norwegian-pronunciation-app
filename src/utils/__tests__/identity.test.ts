import { beforeEach, describe, expect, it } from 'vitest';
import {
    checkNickname,
    createIdentity,
    forgetIdentity,
    loadIdentity,
    saveIdentity,
    suggestNickname,
    suggestVariant,
} from '../identity';

/** A generator that walks a fixed list, so a suggestion is reproducible. */
const sequence = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
};

beforeEach(() => window.localStorage.clear());

describe('suggested names', () => {
    it('makes a Norwegian-flavoured name with no personal information in it', () => {
        expect(suggestNickname(sequence([0, 0]))).toBe('NorskNinja');
        expect(suggestNickname(sequence([0.1, 0.15]))).toBe('FjordFox');
    });

    it('only ever suggests names the app would accept', () => {
        for (let i = 0; i < 200; i++) {
            const suggestion = suggestNickname();
            expect(checkNickname(suggestion).ok, suggestion).toBe(true);
        }
    });

    it('offers a numbered variant when a name is taken', () => {
        const variant = suggestVariant('FjordFox', sequence([0.5]));
        expect(variant).toMatch(/^FjordFox\d{2}$/);
        expect(checkNickname(variant).ok).toBe(true);
    });

    it('does not stack numbers up on a name that already has some', () => {
        expect(suggestVariant('FjordFox42', sequence([0.5]))).toMatch(/^FjordFox\d{2}$/);
    });
});

describe('checkNickname', () => {
    it('accepts an ordinary nickname', () => {
        expect(checkNickname('NorskNinja')).toEqual({ ok: true, value: 'NorskNinja', message: '' });
    });

    it('accepts Norwegian letters', () => {
        expect(checkNickname('Blåbær').ok).toBe(true);
        expect(checkNickname('Kjærlig Ørn').ok).toBe(true);
    });

    it('trims and collapses whitespace rather than refusing over it', () => {
        expect(checkNickname('  Fjord   Fox  ').value).toBe('Fjord Fox');
    });

    it('refuses an empty or near-empty name', () => {
        for (const bad of ['', '   ', 'ab']) {
            const result = checkNickname(bad);
            expect(result.ok, bad).toBe(false);
            expect(result.message).not.toBe('');
        }
    });

    it('refuses a name too long to sit in a table', () => {
        expect(checkNickname('x'.repeat(21)).ok).toBe(false);
        expect(checkNickname('x'.repeat(20)).ok).toBe(true);
    });

    it('refuses links and markup', () => {
        expect(checkNickname('http://a.example').ok).toBe(false);
        expect(checkNickname('<script>x</script>').ok).toBe(false);
        expect(checkNickname('a"b').ok).toBe(false);
    });

    it('refuses names that impersonate the app or its staff', () => {
        expect(checkNickname('admin').ok).toBe(false);
        expect(checkNickname('Moderator').ok).toBe(false);
        expect(checkNickname('Norsk uttale').ok).toBe(false);
    });

    it('strips control characters instead of storing them', () => {
        const sneaky = `Fjord${String.fromCharCode(0)}Fox`;
        expect(checkNickname(sneaky).value).toBe('FjordFox');
    });

    it('explains itself in words a learner can act on', () => {
        expect(checkNickname('ab').message).toMatch(/lengre/i);
        expect(checkNickname('x'.repeat(30)).message).toMatch(/kortere/i);
    });
});

describe('the identity itself', () => {
    it('carries a name, a public id and a private secret, and nothing else', () => {
        const identity = createIdentity('FjordFox', 1000);
        expect(Object.keys(identity).sort()).toEqual(['createdAt', 'id', 'nickname', 'secret']);
        expect(identity.nickname).toBe('FjordFox');
        expect(identity.createdAt).toBe(1000);
    });

    it('makes an id and a secret that are not each other', () => {
        const identity = createIdentity('FjordFox');
        expect(identity.id).toMatch(/^[0-9a-f]{32}$/);
        expect(identity.secret).toMatch(/^[0-9a-f]{64}$/);
        expect(identity.secret).not.toContain(identity.id);
    });

    it('does not repeat itself across learners', () => {
        const ids = new Set(Array.from({ length: 100 }, () => createIdentity('x').id));
        expect(ids.size).toBe(100);
    });

    it('survives a reload', () => {
        const identity = createIdentity('FjordFox');
        saveIdentity(identity);
        expect(loadIdentity()).toEqual(identity);
    });

    it('is nothing at all before the learner joins', () => {
        expect(loadIdentity()).toBeNull();
    });

    it('is forgotten completely when asked', () => {
        saveIdentity(createIdentity('FjordFox'));
        forgetIdentity();
        expect(loadIdentity()).toBeNull();
        expect(window.localStorage.getItem('npa-identity-v1')).toBeNull();
    });

    it('ignores a half-written record rather than trusting it', () => {
        window.localStorage.setItem('npa-identity-v1', JSON.stringify({ id: 'abc' }));
        expect(loadIdentity()).toBeNull();
        window.localStorage.setItem('npa-identity-v1', 'not json');
        expect(loadIdentity()).toBeNull();
    });

    it('keeps the name when it changes and the identity when it does not', () => {
        const identity = createIdentity('FjordFox');
        saveIdentity({ ...identity, nickname: 'FjellTale' });
        const loaded = loadIdentity();
        expect(loaded?.nickname).toBe('FjellTale');
        expect(loaded?.id).toBe(identity.id);
    });
});
