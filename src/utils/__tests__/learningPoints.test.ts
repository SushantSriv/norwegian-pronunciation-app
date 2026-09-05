import { describe, expect, it } from 'vitest';
import {
    allTimePoints,
    awardAttempt,
    awardSession,
    currentStreak,
    DAILY_CAP,
    dominantLevel,
    emptyLedger,
    improvement,
    league,
    markSent,
    MIN_IMPROVEMENT_SAMPLES,
    pendingEvents,
    PHRASE_DAILY_LIMIT,
    SESSION_DAILY_LIMIT,
    toNextLeague,
    weeklyPoints,
    weeklyHistory,
    practiceDays,
    pointsByKind,
    recentGains,
    bestGains,
    type AttemptPoints,
    type Ledger,
} from '../learningPoints';
import { MAX_POINTS } from '../leaderboardRules';
import { emptyProfile, type Profile, type WordRecord } from '../learningProfile';
import type { WordScore } from '../scoring';

const DAY = 86_400_000;
/** Monday 5 January 2026, 10:00 UTC. */
const MONDAY = Date.UTC(2026, 0, 5, 10);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const word = (over: Partial<WordScore> & { word: string }): WordScore => ({
    index: 0,
    status: 'equal',
    score: 1,
    expectedIpa: null,
    heardIpa: null,
    ...over,
});

function profileWith(words: Record<string, Partial<WordRecord>>): Profile {
    const profile = emptyProfile();
    for (const [key, record] of Object.entries(words)) {
        profile.words[key] = {
            scores: [],
            melody: { right: 0, wrong: 0 },
            lastSeen: MONDAY,
            box: 0,
            ...record,
        };
    }
    return profile;
}

/** Deterministic ids, so nothing in a test depends on randomness. */
function ids() {
    let n = 0;
    return () => `evt${String(++n).padStart(8, '0')}`;
}

function attempt(over: Partial<AttemptPoints> = {}): AttemptPoints {
    return {
        // A plain pass: over the bar, but not by the strong margin.
        score: 60,
        threshold: 55,
        passed: true,
        counts: true,
        phrase: 'god morgen',
        wordScores: [word({ word: 'god' }), word({ word: 'morgen', index: 1 })],
        cefr: 'A1',
        profile: emptyProfile(),
        now: MONDAY,
        id: ids(),
        ...over,
    };
}

const total = (ledger: Ledger, input: Partial<AttemptPoints> = {}) =>
    awardAttempt(ledger, attempt(input)).award.total;

// ---------------------------------------------------------------------------

describe('awardAttempt — the basic shape of a score', () => {
    it('pays nothing at all for an attempt the app would not judge', () => {
        const ledger = emptyLedger();
        const result = awardAttempt(ledger, attempt({ counts: false }));
        expect(result.award.total).toBe(0);
        // Untouched, not merely equal: a mis-heard attempt leaves no trace.
        expect(result.ledger).toBe(ledger);
    });

    it('pays for a completed attempt that missed the bar', () => {
        expect(total(emptyLedger(), { passed: false, score: 40 })).toBe(5);
    });

    it('pays attempt plus clear for a pass', () => {
        expect(total(emptyLedger(), { passed: true, score: 60, threshold: 55 })).toBe(10);
    });

    it('pays more for clearing the bar with room to spare', () => {
        expect(total(emptyLedger(), { passed: true, score: 67, threshold: 55 })).toBe(15);
    });

    it('treats the strong margin as a floor, not a range', () => {
        // One point under is a clear; exactly on it is strong.
        expect(total(emptyLedger(), { score: 66.9, threshold: 55 })).toBe(10);
        expect(total(emptyLedger(), { score: 67, threshold: 55 })).toBe(15);
    });

    it('records the composite score for the improvement measure', () => {
        const { ledger } = awardAttempt(emptyLedger(), attempt({ score: 71.5 }));
        expect(ledger.samples).toEqual([{ at: MONDAY, score: 71.5 }]);
    });
});

describe('awardAttempt — improvement', () => {
    it('pays for a new personal best on a word', () => {
        const ledger = { ...emptyLedger(), bests: { god: 60 } };
        const { award } = awardAttempt(
            ledger,
            attempt({ wordScores: [word({ word: 'god', status: 'substitute', score: 0.75 })] })
        );
        const line = award.lines.find(entry => entry.kind === 'improvement');
        expect(line?.points).toBe(11);
    });

    it('pays nothing for a gain too small to be more than noise', () => {
        const ledger = { ...emptyLedger(), bests: { god: 70 } };
        const { award } = awardAttempt(
            ledger,
            attempt({ wordScores: [word({ word: 'god', status: 'substitute', score: 0.75 })] })
        );
        expect(award.lines.some(entry => entry.kind === 'improvement')).toBe(false);
    });

    it('pays nothing the first time a word is seen', () => {
        const { award } = awardAttempt(
            emptyLedger(),
            attempt({ wordScores: [word({ word: 'god', status: 'substitute', score: 0.9 })] })
        );
        expect(award.lines.some(entry => entry.kind === 'improvement')).toBe(false);
    });

    it('cannot be farmed by getting worse and recovering', () => {
        // The bar is the best ever reached, so falling back and climbing to the
        // same place again is worth nothing the second time.
        let ledger = emptyLedger();
        const say = (score: number, at: number) => {
            const result = awardAttempt(
                ledger,
                attempt({
                    now: at,
                    phrase: `god ${at}`,
                    wordScores: [word({ word: 'god', status: 'substitute', score })],
                })
            );
            ledger = result.ledger;
            return result.award.lines.find(entry => entry.kind === 'improvement')?.points ?? 0;
        };

        expect(say(0.5, MONDAY)).toBe(0); // first sighting sets the bar
        expect(say(0.9, MONDAY + 1000)).toBeGreaterThan(0); // a real gain
        expect(say(0.5, MONDAY + 2000)).toBe(0); // a deliberate dip
        expect(say(0.9, MONDAY + 3000)).toBe(0); // and back: not paid twice
    });

    it('raises the bar it just paid out on', () => {
        const { ledger } = awardAttempt(
            { ...emptyLedger(), bests: { god: 60 } },
            attempt({ wordScores: [word({ word: 'god', status: 'substitute', score: 0.8 })] })
        );
        expect(ledger.bests.god).toBe(80);
    });
});

describe('awardAttempt — mastery', () => {
    const climbing = profileWith({ ord: { box: 2, scores: [90, 95, 92] } });

    it('pays when a word reaches the long review intervals', () => {
        const { award } = awardAttempt(
            emptyLedger(),
            attempt({ profile: climbing, wordScores: [word({ word: 'ord' })] })
        );
        expect(award.lines.find(entry => entry.kind === 'mastery')?.points).toBe(15);
    });

    it('pays more for a word this learner kept missing', () => {
        const struggled = profileWith({ ord: { box: 2, scores: [40, 55, 90] } });
        const { award } = awardAttempt(
            emptyLedger(),
            attempt({ profile: struggled, wordScores: [word({ word: 'ord' })] })
        );
        expect(award.lines.find(entry => entry.kind === 'mastery')?.points).toBe(20);
    });

    it('pays once and never again', () => {
        const first = awardAttempt(
            emptyLedger(),
            attempt({ profile: climbing, wordScores: [word({ word: 'ord' })] })
        );
        expect(first.ledger.mastered).toContain('ord');

        const again = awardAttempt(
            first.ledger,
            attempt({
                now: MONDAY + DAY,
                profile: climbing,
                wordScores: [word({ word: 'ord' })],
            })
        );
        expect(again.award.lines.some(entry => entry.kind === 'mastery')).toBe(false);
    });

    it('does not pay for a word that fell back down the boxes', () => {
        const { award } = awardAttempt(
            emptyLedger(),
            attempt({
                profile: climbing,
                wordScores: [word({ word: 'ord', status: 'substitute', score: 0.4 })],
            })
        );
        expect(award.lines.some(entry => entry.kind === 'mastery')).toBe(false);
    });
});

describe('anti-grinding', () => {
    it('stops paying for a phrase said too many times in one day', () => {
        let ledger = emptyLedger();
        const earned: number[] = [];
        for (let i = 0; i < PHRASE_DAILY_LIMIT + 2; i++) {
            const result = awardAttempt(ledger, attempt({ now: MONDAY + i * 60_000 }));
            ledger = result.ledger;
            earned.push(result.award.total);
        }
        expect(earned.slice(0, PHRASE_DAILY_LIMIT)).toEqual([10, 10, 10]);
        expect(earned.slice(PHRASE_DAILY_LIMIT)).toEqual([0, 0]);
    });

    it('lets the same phrase pay again the next day', () => {
        let ledger = emptyLedger();
        for (let i = 0; i < PHRASE_DAILY_LIMIT; i++) {
            ledger = awardAttempt(ledger, attempt({ now: MONDAY + i * 60_000 })).ledger;
        }
        expect(total(ledger, { now: MONDAY + DAY })).toBeGreaterThan(0);
    });

    it('pays a token amount for a phrase whose words are all mastered', () => {
        const mastered = profileWith({ god: { box: 4 }, morgen: { box: 5 } });
        expect(total(emptyLedger(), { profile: mastered, score: 95 })).toBe(2);
    });

    it('pays nothing for a mastered phrase that was not even said right', () => {
        const mastered = profileWith({ god: { box: 4 }, morgen: { box: 5 } });
        expect(total(emptyLedger(), { profile: mastered, passed: false, score: 30 })).toBe(0);
    });

    it('caps the day, however the points were come by', () => {
        const nearlyDone: Ledger = {
            ...emptyLedger(),
            today: { day: '2026-01-05', points: DAILY_CAP - 6, sessions: 0, phrases: {} },
        };
        const { award, ledger } = awardAttempt(nearlyDone, attempt({ score: 90 }));
        expect(award.total).toBe(6);
        expect(award.capped).toBe(true);
        expect(ledger.today.points).toBe(DAILY_CAP);

        // And nothing at all once it is reached.
        expect(total(ledger, { phrase: 'noe annet', now: MONDAY + 60_000 })).toBe(0);
    });

    it('cannot be beaten by repeating one easy phrase all day', () => {
        let ledger = emptyLedger();
        for (let i = 0; i < 500; i++) {
            ledger = awardAttempt(ledger, attempt({ now: MONDAY + i * 30_000, score: 95 })).ledger;
        }
        // Three payable attempts at 15, and that is the day.
        expect(allTimePoints(ledger)).toBe(45);
    });
});

describe('fairness between levels', () => {
    it('pays an A1 learner clearing an A1 bar what a B1 learner gets for a B1 bar', () => {
        const a1 = total(emptyLedger(), { cefr: 'A1', threshold: 55, score: 60 });
        const b1 = total(emptyLedger(), { cefr: 'B1', threshold: 63, score: 68 });
        expect(b1 - a1).toBeLessThanOrEqual(1);
        expect(b1).toBeGreaterThanOrEqual(a1);
    });

    it('never lets the level factor be worth more than a tenth', () => {
        const a1 = total(emptyLedger(), { cefr: 'A1', score: 90, threshold: 55 });
        const b2 = total(emptyLedger(), { cefr: 'B2', score: 90, threshold: 55 });
        expect(b2).toBeLessThanOrEqual(Math.ceil(a1 * 1.1));
    });

    it('values a big A1 improvement at least as highly as a smaller B1 one', () => {
        const gain = (from: number, to: number, cefr: string) =>
            awardAttempt(
                { ...emptyLedger(), bests: { ord: from } },
                attempt({
                    cefr,
                    wordScores: [word({ word: 'ord', status: 'substitute', score: to / 100 })],
                })
            ).award.lines.find(entry => entry.kind === 'improvement')?.points ?? 0;

        // 50 → 90 at A1 against 70 → 95 at B1: the A1 learner moved further.
        expect(gain(50, 90, 'A1')).toBeGreaterThanOrEqual(gain(70, 95, 'B1'));
        expect(gain(50, 90, 'A1')).toBeGreaterThan(0);
    });

    it('gives occupation stages a level without a CEFR rung', () => {
        const { ledger } = awardAttempt(emptyLedger(), attempt({ cefr: 'Healthcare' }));
        expect(ledger.events.every(event => event.cefr === undefined)).toBe(true);
        expect(allTimePoints(ledger)).toBeGreaterThan(0);
    });
});

describe('streaks', () => {
    const practise = (ledger: Ledger, day: number) =>
        awardAttempt(ledger, attempt({ now: MONDAY + day * DAY, phrase: `phrase ${day}` }));

    it('pays a bonus on the seventh consecutive day', () => {
        let ledger = emptyLedger();
        const bonuses: number[] = [];
        for (let day = 0; day < 7; day++) {
            const result = practise(ledger, day);
            ledger = result.ledger;
            bonuses.push(result.award.lines.find(entry => entry.kind === 'streak')?.points ?? 0);
        }
        expect(bonuses).toEqual([0, 0, 0, 0, 0, 0, 50]);
        expect(ledger.streak.length).toBe(7);
    });

    it('pays it again every seventh day, not every day after', () => {
        let ledger = emptyLedger();
        for (let day = 0; day < 14; day++) ledger = practise(ledger, day).ledger;
        expect(ledger.events.filter(event => event.kind === 'streak')).toHaveLength(2);
    });

    it('starts over after a missed day', () => {
        let ledger = emptyLedger();
        for (let day = 0; day < 5; day++) ledger = practise(ledger, day).ledger;
        ledger = practise(ledger, 7).ledger;
        expect(ledger.streak.length).toBe(1);
    });

    it('advances once a day, not once an attempt', () => {
        let ledger = practise(emptyLedger(), 0).ledger;
        ledger = awardAttempt(ledger, attempt({ now: MONDAY + 60_000, phrase: 'noe annet' })).ledger;
        expect(ledger.streak.length).toBe(1);
    });

    it('keeps yesterday’s streak alive until midnight tonight', () => {
        const ledger = practise(emptyLedger(), 0).ledger;
        expect(currentStreak(ledger, MONDAY + DAY)).toBe(1);
        expect(currentStreak(ledger, MONDAY + 2 * DAY)).toBe(0);
    });
});

describe('awardSession', () => {
    const run = (over: Parameters<typeof awardSession>[1]) => awardSession(emptyLedger(), over);

    it('pays for a stage cleared', () => {
        expect(run({ completed: true, cleared: 10, cefr: 'A1', now: MONDAY }).award.total).toBe(25);
    });

    it('pays less for a run that ran out of lives', () => {
        expect(run({ completed: false, cleared: 6, cefr: 'A1', now: MONDAY }).award.total).toBe(10);
    });

    it('pays nothing for a run abandoned immediately', () => {
        expect(run({ completed: false, cleared: 1, cefr: 'A1', now: MONDAY }).award.total).toBe(0);
    });

    it('does not pay the same amount at B2 as a way of levelling up faster', () => {
        expect(run({ completed: true, cleared: 10, cefr: 'B2', now: MONDAY }).award.total).toBe(25);
    });

    it('stops paying after enough runs in one day', () => {
        let ledger = emptyLedger();
        const earned: number[] = [];
        for (let i = 0; i < SESSION_DAILY_LIMIT + 1; i++) {
            const result = awardSession(ledger, {
                completed: true,
                cleared: 10,
                cefr: 'A1',
                now: MONDAY + i * 600_000,
            });
            ledger = result.ledger;
            earned.push(result.award.total);
        }
        expect(earned).toEqual([25, 25, 25, 25, 0]);
    });
});

describe('weekly and all-time totals', () => {
    const build = (): Ledger => {
        let ledger = emptyLedger();
        // Last week, this week, and one right on the boundary.
        for (const at of [MONDAY - 3 * DAY, MONDAY, MONDAY + 2 * DAY]) {
            ledger = awardAttempt(ledger, attempt({ now: at, phrase: `phrase ${at}` })).ledger;
        }
        return ledger;
    };

    it('counts only the current week towards the weekly total', () => {
        const ledger = build();
        expect(weeklyPoints(ledger, MONDAY)).toBe(20);
    });

    it('resets on Monday without deleting anything', () => {
        const ledger = build();
        const before = weeklyPoints(ledger, MONDAY - 3 * DAY);
        expect(before).toBe(10);
        // A week later the weekly total is empty and the history is intact.
        expect(weeklyPoints(ledger, MONDAY + 7 * DAY)).toBe(0);
        // Two lines an attempt, three attempts, none of them thrown away.
        expect(ledger.events).toHaveLength(6);
        expect(allTimePoints(ledger)).toBe(30);
    });

    it('counts the last second of Sunday in the old week', () => {
        const sunday = Date.UTC(2026, 0, 11, 23, 59, 59);
        const ledger = awardAttempt(emptyLedger(), attempt({ now: sunday })).ledger;
        expect(weeklyPoints(ledger, MONDAY)).toBe(10);
        expect(weeklyPoints(ledger, Date.UTC(2026, 0, 12))).toBe(0);
    });

    it('keeps the all-time total when old events are pruned away', () => {
        let ledger = awardAttempt(emptyLedger(), attempt({ now: MONDAY })).ledger;
        const lifetime = allTimePoints(ledger);
        ledger = awardAttempt(
            ledger,
            attempt({ now: MONDAY + 200 * DAY, phrase: 'much later' })
        ).ledger;
        expect(ledger.events.some(event => event.at === MONDAY)).toBe(false);
        expect(allTimePoints(ledger)).toBeGreaterThan(lifetime);
    });

    it('is zero for a learner who has done nothing', () => {
        expect(allTimePoints(emptyLedger())).toBe(0);
        expect(weeklyPoints(emptyLedger(), MONDAY)).toBe(0);
    });
});

describe('improvement', () => {
    /** n attempts scoring `score`, spread through the week starting at `from`. */
    const week = (from: number, score: number, n: number) =>
        Array.from({ length: n }, (_, i) => ({ at: from + i * 3600_000, score }));

    const lastWeek = Date.UTC(2025, 11, 29); // the Monday before MONDAY
    const thisWeek = Date.UTC(2026, 0, 5);

    it('is null until there is enough on both sides to compare', () => {
        const ledger: Ledger = {
            ...emptyLedger(),
            samples: [...week(lastWeek, 60, 3), ...week(thisWeek, 90, 3)],
        };
        expect(improvement(ledger, MONDAY)).toBeNull();
    });

    it('is null for a learner with no history to improve on', () => {
        const ledger: Ledger = { ...emptyLedger(), samples: week(thisWeek, 90, 40) };
        expect(improvement(ledger, MONDAY)).toBeNull();
    });

    it('measures the change in median score across the week boundary', () => {
        const ledger: Ledger = {
            ...emptyLedger(),
            samples: [
                ...week(lastWeek, 60, MIN_IMPROVEMENT_SAMPLES),
                ...week(thisWeek, 75, MIN_IMPROVEMENT_SAMPLES),
            ],
        };
        expect(improvement(ledger, MONDAY)).toEqual({
            delta: 15,
            samples: MIN_IMPROVEMENT_SAMPLES,
            baseline: MIN_IMPROVEMENT_SAMPLES,
        });
    });

    it('is not moved by one wild attempt either way', () => {
        const ledger: Ledger = {
            ...emptyLedger(),
            samples: [
                ...week(lastWeek, 70, 20),
                ...week(thisWeek, 70, 19),
                { at: thisWeek + 20 * 3600_000, score: 0 },
            ],
        };
        // A median shrugs a single zero off; a mean would report a collapse.
        expect(improvement(ledger, MONDAY)?.delta).toBe(0);
    });

    it('reports a fall as readily as a rise', () => {
        const ledger: Ledger = {
            ...emptyLedger(),
            samples: [...week(lastWeek, 80, 12), ...week(thisWeek, 72, 12)],
        };
        expect(improvement(ledger, MONDAY)?.delta).toBe(-8);
    });
});

describe('level, league and sync bookkeeping', () => {
    it('reports the level carrying the most points', () => {
        let ledger = emptyLedger();
        for (let i = 0; i < 3; i++) {
            ledger = awardAttempt(
                ledger,
                attempt({ cefr: 'A2', phrase: `a2 ${i}`, now: MONDAY + i * 1000 })
            ).ledger;
        }
        ledger = awardAttempt(ledger, attempt({ cefr: 'B1', phrase: 'b1' })).ledger;
        expect(dominantLevel(ledger)).toBe('A2');
    });

    it('has no level to report before any levelled practice', () => {
        expect(dominantLevel(emptyLedger())).toBeNull();
        const occupational = awardAttempt(emptyLedger(), attempt({ cefr: 'Cleaning' })).ledger;
        expect(dominantLevel(occupational)).toBeNull();
    });

    it('breaks a level tie upwards, towards the harder one', () => {
        let ledger = awardAttempt(emptyLedger(), attempt({ cefr: 'A1', phrase: 'one' })).ledger;
        ledger = awardAttempt(ledger, attempt({ cefr: 'B2', phrase: 'two' })).ledger;
        expect(dominantLevel(ledger)).toBe('B2');
    });

    it('places a learner in a league and says what the next one costs', () => {
        expect(league(0).name).toBe('Bronze');
        expect(league(999).name).toBe('Bronze');
        expect(league(1_000).name).toBe('Silver');
        expect(league(20_000).name).toBe('Diamond');
        expect(toNextLeague(900)).toEqual({ league: expect.objectContaining({ name: 'Silver' }), points: 100 });
        expect(toNextLeague(20_000)).toBeNull();
    });

    it('tracks which events a server has taken', () => {
        const { ledger } = awardAttempt(emptyLedger(), attempt());
        expect(pendingEvents(ledger)).toHaveLength(2);

        const sent = markSent(ledger, [pendingEvents(ledger)[0].id]);
        expect(pendingEvents(sent)).toHaveLength(1);
        // Rejected events stay pending rather than being lost.
        expect(markSent(sent, []).events).toBe(sent.events);
    });
});

describe('the ceilings the server enforces', () => {
    it('is never exceeded by anything the engine can produce', () => {
        let ledger = emptyLedger();
        const profiles = [
            emptyProfile(),
            profileWith({ ord: { box: 2, scores: [10, 20, 30] } }),
            profileWith({ ord: { box: 4 } }),
        ];

        // Every level, every outcome, over a fortnight of consecutive days.
        for (let day = 0; day < 14; day++) {
            for (const cefr of ['A1', 'A1+', 'A2', 'B1', 'B2', 'Healthcare']) {
                for (const passed of [true, false]) {
                    const result = awardAttempt(ledger, {
                        ...attempt(),
                        now: MONDAY + day * DAY + Math.random() * 3600_000,
                        cefr,
                        passed,
                        score: passed ? 100 : 10,
                        threshold: 55,
                        phrase: `${cefr}-${passed}-${day}`,
                        profile: profiles[day % profiles.length],
                        wordScores: [word({ word: 'ord', status: 'substitute', score: 0.99 })],
                    });
                    ledger = result.ledger;
                }
            }
            ledger = awardSession(ledger, {
                completed: true,
                cleared: 10,
                cefr: 'B2',
                now: MONDAY + day * DAY,
            }).ledger;
        }

        expect(ledger.events.length).toBeGreaterThan(20);
        for (const event of ledger.events) {
            expect(event.points).toBeGreaterThan(0);
            expect(event.points).toBeLessThanOrEqual(MAX_POINTS[event.kind]);
        }
    });

    it('never lets a day exceed the cap the server also applies', () => {
        let ledger = emptyLedger();
        for (let i = 0; i < 300; i++) {
            ledger = awardAttempt(
                ledger,
                attempt({ now: MONDAY + i * 1000, phrase: `phrase ${i}`, score: 95 })
            ).ledger;
        }
        expect(ledger.today.points).toBeLessThanOrEqual(DAILY_CAP);
        expect(allTimePoints(ledger)).toBeLessThanOrEqual(DAILY_CAP);
    });
});

// ---------------------------------------------------------------------------
// Looking back
// ---------------------------------------------------------------------------

describe('personal bests, kept for the learner', () => {
    it('records the word and how far it moved', () => {
        const { ledger } = awardAttempt(
            { ...emptyLedger(), bests: { kjøkken: 52 } },
            attempt({ wordScores: [word({ word: 'Kjøkken', status: 'substitute', score: 0.91 })] })
        );
        // Matched case-insensitively, but shown back the way it was written.
        expect(ledger.gains).toEqual([{ word: 'Kjøkken', from: 52, to: 91, at: MONDAY }]);
    });

    it('records nothing when no personal best was beaten', () => {
        const { ledger } = awardAttempt(emptyLedger(), attempt());
        expect(ledger.gains).toEqual([]);
    });

    it('does not claim a gain the daily cap refused to pay for', () => {
        const spent: Ledger = {
            ...emptyLedger(),
            bests: { ord: 40 },
            today: { day: '2026-01-05', points: DAILY_CAP, sessions: 0, phrases: {} },
        };
        const { ledger, award } = awardAttempt(
            spent,
            attempt({ wordScores: [word({ word: 'ord', status: 'substitute', score: 0.95 })] })
        );
        expect(award.total).toBe(0);
        expect(ledger.gains).toEqual([]);
    });

    it('keeps a bounded history, newest last', () => {
        let ledger = emptyLedger();
        for (let i = 0; i < 60; i++) {
            ledger = { ...ledger, bests: { ...ledger.bests, ord: 10 } };
            ledger = awardAttempt(
                ledger,
                attempt({
                    now: MONDAY + i * 60_000,
                    phrase: `phrase ${i}`,
                    wordScores: [word({ word: 'ord', status: 'substitute', score: 0.5 })],
                })
            ).ledger;
        }
        expect(ledger.gains.length).toBeLessThanOrEqual(40);
        expect(ledger.gains.at(-1)?.at).toBeGreaterThan(ledger.gains[0].at);
    });

    it('orders recent gains newest first and best gains by size', () => {
        const ledger: Ledger = {
            ...emptyLedger(),
            gains: [
                { word: 'liten', from: 80, to: 90, at: MONDAY },
                { word: 'stor', from: 20, to: 95, at: MONDAY + 1000 },
            ],
        };
        expect(recentGains(ledger).map(g => g.word)).toEqual(['stor', 'liten']);
        expect(bestGains(ledger).map(g => g.word)).toEqual(['stor', 'liten']);
        expect(recentGains(ledger, 1)).toHaveLength(1);
    });
});

describe('weeklyHistory', () => {
    it('returns the requested number of weeks, oldest first, ending on now', () => {
        const history = weeklyHistory(emptyLedger(), MONDAY, 4);
        expect(history).toHaveLength(4);
        expect(history.at(-1)?.current).toBe(true);
        expect(history.filter(w => w.current)).toHaveLength(1);
        expect(history[0].start).toBeLessThan(history[1].start);
    });

    it('keeps empty weeks rather than closing the gap', () => {
        let ledger = awardAttempt(emptyLedger(), attempt({ now: MONDAY })).ledger;
        ledger = awardAttempt(ledger, attempt({ now: MONDAY - 21 * DAY, phrase: 'older' })).ledger;

        const history = weeklyHistory(ledger, MONDAY, 4);
        expect(history.map(w => w.points)).toEqual([10, 0, 0, 10]);
    });

    it('attributes each event to the week it happened in', () => {
        const ledger = awardAttempt(emptyLedger(), attempt({ now: MONDAY - 7 * DAY })).ledger;
        const history = weeklyHistory(ledger, MONDAY, 2);
        expect(history[0].points).toBe(10);
        expect(history[1].points).toBe(0);
    });
});

describe('practiceDays', () => {
    it('marks the days that were practised and the day that is today', () => {
        let ledger = awardAttempt(emptyLedger(), attempt({ now: MONDAY })).ledger;
        ledger = awardAttempt(ledger, attempt({ now: MONDAY - 2 * DAY, phrase: 'two days ago' })).ledger;

        const days = practiceDays(ledger, MONDAY, 4);
        expect(days).toHaveLength(4);
        expect(days.map(d => d.practised)).toEqual([false, true, false, true]);
        expect(days.at(-1)?.today).toBe(true);
    });

    it('is all quiet for a learner who has never practised', () => {
        expect(practiceDays(emptyLedger(), MONDAY, 7).every(d => !d.practised)).toBe(true);
    });
});

describe('pointsByKind', () => {
    it('splits a week into what earned it, largest first', () => {
        const ledger = awardAttempt(
            { ...emptyLedger(), bests: { ord: 40 } },
            attempt({
                score: 90,
                wordScores: [word({ word: 'ord', status: 'substitute', score: 0.95 })],
            })
        ).ledger;

        const split = pointsByKind(ledger);
        expect(split.map(s => s.kind).sort()).toEqual(['attempt', 'improvement', 'strong']);
        // Sorted by points, so the biggest contribution reads first.
        expect(split[0].points).toBeGreaterThanOrEqual(split[1].points);
        expect(split.reduce((sum, s) => sum + s.points, 0)).toBe(allTimePoints(ledger));
    });

    it('honours the cutoff', () => {
        const ledger = awardAttempt(emptyLedger(), attempt({ now: MONDAY - 3 * DAY })).ledger;
        expect(pointsByKind(ledger, MONDAY)).toEqual([]);
        expect(pointsByKind(ledger, MONDAY - 4 * DAY).length).toBeGreaterThan(0);
    });
});
