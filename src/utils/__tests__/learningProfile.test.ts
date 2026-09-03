import { describe, expect, it } from 'vitest';
import {
    accuracy,
    drillPool,
    dueAt,
    emptyProfile,
    prioritise,
    recordAttempt,
    weaknesses,
    type Profile,
} from '../learningProfile';
import type { AttemptScore, WordScore } from '../scoring';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

function wordScore(over: Partial<WordScore> & { word: string }): WordScore {
    return {
        index: 0,
        status: 'equal',
        score: 1,
        expectedIpa: null,
        heardIpa: null,
        ...over,
    };
}

const attemptOf = (words: WordScore[]): AttemptScore => ({
    expected: words.map(w => w.word).join(' '),
    heard: '',
    score: 100,
    wordScores: words,
    insertions: 0,
});

/** Run the same attempt n times, so a skill crosses the evidence threshold. */
function repeat(profile: Profile, words: WordScore[], times: number, now = T0): Profile {
    let next = profile;
    for (let i = 0; i < times; i++) {
        next = recordAttempt(next, { score: attemptOf(words), now: now + i });
    }
    return next;
}

describe('recordAttempt', () => {
    it('keeps a score history per word', () => {
        let profile = recordAttempt(emptyProfile(), {
            score: attemptOf([wordScore({ word: 'kjøkken', status: 'substitute', score: 0.4 })]),
            now: T0,
        });
        profile = recordAttempt(profile, {
            score: attemptOf([wordScore({ word: 'Kjøkken', score: 1 })]),
            now: T0 + 1000,
        });

        expect(profile.words.kjøkken.scores).toEqual([40, 100]);
        expect(profile.words.kjøkken.lastSeen).toBe(T0 + 1000);
    });

    it('promotes a word that went well and resets one that did not', () => {
        let profile = repeat(emptyProfile(), [wordScore({ word: 'hus' })], 3);
        expect(profile.words.hus.box).toBe(3);

        profile = recordAttempt(profile, {
            score: attemptOf([wordScore({ word: 'hus', status: 'substitute', score: 0.2 })]),
            now: T0 + DAY,
        });
        // A word you just got wrong is a word to come back to soon.
        expect(profile.words.hus.box).toBe(0);
    });

    it('blames the sounds that were actually missed, and credits the rest', () => {
        // Expected /çøkən/, heard /ʃøkən/: only the first sound differs.
        const profile = recordAttempt(emptyProfile(), {
            score: attemptOf([
                wordScore({
                    word: 'kjøkken',
                    status: 'substitute',
                    score: 0.6,
                    expectedIpa: 'çøkən',
                    heardIpa: 'ʃøkən',
                }),
            ]),
            now: T0,
        });

        expect(profile.phonemes['ç']).toEqual({ right: 0, wrong: 1 });
        expect(profile.phonemes['ø']).toEqual({ right: 1, wrong: 0 });
        expect(profile.phonemes['n']).toEqual({ right: 1, wrong: 0 });
    });

    it('does not blame the phonemes of a word that was said correctly', () => {
        const profile = recordAttempt(emptyProfile(), {
            score: attemptOf([
                wordScore({ word: 'mat', expectedIpa: 'mɑːt', heardIpa: 'mɑːt' }),
            ]),
            now: T0,
        });
        expect(profile.phonemes).toEqual({});
    });

    it('tracks the two accents separately', () => {
        const profile = recordAttempt(emptyProfile(), {
            score: attemptOf([wordScore({ word: 'huset' }), wordScore({ word: 'bilen' })]),
            melody: [
                { word: 'huset', accent: 'ACCENT_2', correct: false },
                { word: 'bilen', accent: 'ACCENT_1', correct: true },
            ],
            now: T0,
        });

        expect(profile.accents.ACCENT_2).toEqual({ right: 0, wrong: 1 });
        expect(profile.accents.ACCENT_1).toEqual({ right: 1, wrong: 0 });
        expect(profile.words.huset.melody).toEqual({ right: 0, wrong: 1 });
    });
});

describe('accuracy', () => {
    it('says nothing until there is enough evidence', () => {
        expect(accuracy({ right: 1, wrong: 1 })).toBeNull();
        expect(accuracy({ right: 2, wrong: 1 })).toBeCloseTo(2 / 3, 6);
        expect(accuracy(undefined)).toBeNull();
    });
});

describe('spaced repetition', () => {
    it('pushes a well-remembered word further out each time', () => {
        const profile = repeat(emptyProfile(), [wordScore({ word: 'hus' })], 2);
        const record = profile.words.hus;
        expect(dueAt(record) - record.lastSeen).toBe(3 * DAY);
    });

    it('brings a failed word back immediately', () => {
        const profile = recordAttempt(emptyProfile(), {
            score: attemptOf([wordScore({ word: 'hus', status: 'substitute', score: 0.1 })]),
            now: T0,
        });
        expect(dueAt(profile.words.hus)).toBe(T0);
    });

    it('puts never-seen phrases first, then the most overdue', () => {
        let profile = emptyProfile();
        // Mastered a week ago: not due for a while.
        profile = repeat(profile, [wordScore({ word: 'hus' })], 4, T0);
        // Failed a week ago: overdue by a week.
        profile = recordAttempt(profile, {
            score: attemptOf([wordScore({ word: 'bil', status: 'substitute', score: 0.2 })]),
            now: T0,
        });

        const order = prioritise(profile, ['hus', 'bil', 'kaffe'], T0 + 7 * DAY);
        expect(order[0]).toBe('kaffe');
        expect(order[1]).toBe('bil');
        expect(order[2]).toBe('hus');
    });
});

describe('weaknesses', () => {
    it('reports only skills with enough attempts behind them', () => {
        const profile = emptyProfile();
        profile.phonemes['ø'] = { right: 1, wrong: 1 };
        profile.phonemes['ç'] = { right: 2, wrong: 6 };
        // Two attempts says nothing; naming it would send someone off to drill
        // a problem they may not have.
        expect(weaknesses(profile).map(w => w.key)).toEqual(['ç']);
    });

    it('does not call a skill weak when it is going well', () => {
        const profile = emptyProfile();
        profile.phonemes['s'] = { right: 19, wrong: 1 };
        expect(weaknesses(profile)).toEqual([]);
    });

    it('ranks the worst first', () => {
        const profile = emptyProfile();
        profile.phonemes['ø'] = { right: 5, wrong: 5 };
        profile.phonemes['ç'] = { right: 1, wrong: 9 };
        profile.accents.ACCENT_2 = { right: 4, wrong: 6 };
        expect(weaknesses(profile).map(w => w.key)).toEqual(['ç', 'ACCENT_2', 'ø']);
    });
});

describe('drillPool', () => {
    const toIpa = (word: string) => ({ kjøkken: 'çøkən', mat: 'mɑːt', kjøre: 'çøːrə' })[word] ?? '';
    const accentFor = (word: string) =>
        (({ huset: 'ACCENT_2', mat: 'ACCENT_1' }) as Record<string, 'ACCENT_1' | 'ACCENT_2'>)[
            word
        ] ?? 'ACCENT_1';

    it('picks phrases containing the troublesome sound', () => {
        const pool = ['kjøkken', 'mat', 'jeg skal kjøre'];
        const drill = drillPool(
            { kind: 'phoneme', key: 'ç', accuracy: 0.3, attempts: 10 },
            pool,
            toIpa,
            accentFor
        );
        expect(drill).toEqual(['kjøkken', 'jeg skal kjøre']);
    });

    it('picks phrases carrying the troublesome accent', () => {
        const drill = drillPool(
            { kind: 'accent', key: 'ACCENT_2', accuracy: 0.4, attempts: 10 },
            ['huset', 'mat'],
            toIpa,
            accentFor
        );
        expect(drill).toEqual(['huset']);
    });
});
