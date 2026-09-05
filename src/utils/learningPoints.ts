/**
 * Turning a graded attempt into learning points.
 *
 * This sits strictly downstream of the pronunciation engine. It reads what
 * scoring.ts and learningProfile.ts already decided and never writes back to
 * them: no award here can change a score, a threshold, or which phrase comes
 * next. Delete this file and the app teaches exactly as well as it did before.
 *
 * WHAT IT IS TRYING NOT TO BE is a stopwatch. The obvious points system pays
 * per attempt, and the obvious leaderboard is then a ranking of who had the
 * most spare time. Three rules keep that from happening:
 *
 *   - Clearing is measured against the bar THIS stage set for you, not against
 *     100. An A1 learner clearing an A1 bar earns what a B1 learner clearing a
 *     B1 bar earns, because both did the thing that was asked of them.
 *   - Improvement is paid on a new personal best and nothing else. You cannot
 *     farm it by getting worse on purpose and recovering, because the bar you
 *     beat is your own best ever, and beating it raises it.
 *   - Repetition decays. A phrase pays full points a few times a day, a word
 *     you have already mastered pays a token amount, and the day has a ceiling.
 *
 * Every function here is pure and takes `now` explicitly, so week boundaries,
 * streaks and caps can all be tested without a clock.
 */
import { dayKey, daysBetween, weekKey, weekStart } from './period';
import { isWordClean, nextBox, MASTERY_BOX, type Profile } from './learningProfile';
import type { WordScore } from './scoring';

// ---------------------------------------------------------------------------
// What can be earned
// ---------------------------------------------------------------------------

export type PointKind =
    /** Any attempt the app was willing to judge. */
    | 'attempt'
    /** The attempt cleared the stage's current bar. */
    | 'clear'
    /** It cleared it with room to spare. */
    | 'strong'
    /** A phrase whose words are already mastered, said correctly again. */
    | 'review'
    /** A new personal best on a word. */
    | 'improvement'
    /** A word reached the long review intervals for the first time. */
    | 'mastery'
    /** A run played to its end. */
    | 'session'
    /** A seventh consecutive day of practice. */
    | 'streak';

export interface PointLine {
    kind: PointKind;
    points: number;
    /**
     * What to show the learner, in Norwegian, complete on its own.
     *
     * Never sent anywhere: it names the word, and words are exactly what does
     * not leave the device.
     */
    detail: string;
}

export interface PointsAward {
    total: number;
    lines: PointLine[];
    /** True when a cap, rather than the performance, decided the total. */
    capped: boolean;
}

const NOTHING: PointsAward = { total: 0, lines: [], capped: false };

/** Base values, before the level factor. */
const ATTEMPT = 5;
const CLEAR = 5;
const STRONG = 10;
const REVIEW = 2;

/** Score points above the bar that make a pass a strong one. */
const STRONG_MARGIN = 12;

const IMPROVEMENT_BASE = 10;
const IMPROVEMENT_MAX = 15;
/** A new best has to beat the old one by this much to be worth paying for. */
const MIN_GAIN = 8;

const MASTERY = 15;
const MASTERY_HARD = 20;
/** Misses on a word, before mastering it, that make it a hard word. */
const HARD_MISSES = 2;

const SESSION_CLEARED = 25;
const SESSION_PARTIAL = 10;
/** Items an abandoned run must have cleared to be worth anything. */
const SESSION_MIN_CLEARED = 3;

const STREAK_BONUS = 50;
const STREAK_EVERY = 7;

// ---------------------------------------------------------------------------
// Anti-grinding
// ---------------------------------------------------------------------------

/** Times one phrase pays performance points in a day. */
export const PHRASE_DAILY_LIMIT = 3;
/** Session bonuses payable in a day. */
export const SESSION_DAILY_LIMIT = 4;
/**
 * Points payable in a day.
 *
 * A full run of ten is worth roughly 150-200, so a committed learner doing
 * three runs is nowhere near this. Someone hammering one easy phrase is.
 */
export const DAILY_CAP = 600;

// ---------------------------------------------------------------------------
// Fairness across levels
// ---------------------------------------------------------------------------

/**
 * How much harder a level is, as a factor on performance points.
 *
 * Deliberately a narrow band. The real levelling has already happened: each
 * stage sets its own pass bar (55 at A1, 66 at B2) and the bar climbs as a run
 * goes on, so a B2 learner is being asked for more before any of this applies.
 * Multiplying on top of that as well would make the leaderboard a ranking of
 * Norwegian rather than of learning, which is the thing it must not be.
 *
 * Ten per cent acknowledges the harder vocabulary without letting it decide.
 */
const LEVEL_FACTOR: Record<string, number> = {
    A1: 1,
    'A1+': 1.02,
    A2: 1.05,
    B1: 1.08,
    B2: 1.1,
};

/** Occupation and adaptive stages sit mid-band: hard words, no CEFR rung. */
const DEFAULT_FACTOR = 1.05;

export const levelFactor = (cefr: string): number => LEVEL_FACTOR[cefr] ?? DEFAULT_FACTOR;

/** The levels a board can be filtered by — the ones the general track uses. */
export const CEFR_LEVELS = ['A1', 'A1+', 'A2', 'B1', 'B2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const isCefrLevel = (value: string): value is CefrLevel =>
    (CEFR_LEVELS as readonly string[]).includes(value);

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

export interface PointEvent {
    id: string;
    kind: PointKind;
    points: number;
    /** Epoch milliseconds. */
    at: number;
    /** CEFR level it was earned at, where the stage has one. */
    cefr?: CefrLevel;
    /** Whether a leaderboard server has accepted it. */
    sent?: boolean;
}

/** One attempt's composite score, kept only to measure improvement. */
export interface ScoreSample {
    at: number;
    score: number;
}

export interface Ledger {
    version: 1;
    /** Recent events, for the weekly board and for syncing. */
    events: PointEvent[];
    /** All-time total, kept separately so pruning events loses no history. */
    lifetime: number;
    /** Composite scores, for the most-improved measure. */
    samples: ScoreSample[];
    /** Best score ever reached on each word, 0-100. */
    bests: Record<string, number>;
    /** Words that have already been paid a mastery bonus. */
    mastered: string[];
    streak: { day: string; length: number };
    /** Today's counters, reset when the UTC day turns over. */
    today: { day: string; points: number; sessions: number; phrases: Record<string, number> };
    /**
     * The words this learner has beaten their own best on, most recent last.
     *
     * Kept for the learner to look at — "you got 'kjokken' from 52 to 91" is the
     * single most encouraging thing this app can say, and it is the one thing a
     * points total cannot express. Local only: the word never goes in an event,
     * so it can never reach a server.
     */
    gains: PersonalBest[];
}

/** One word, and how far it moved. */
export interface PersonalBest {
    word: string;
    /** The old personal best, 0-100. */
    from: number;
    /** The new one. */
    to: number;
    at: number;
}

export const emptyLedger = (): Ledger => ({
    version: 1,
    events: [],
    lifetime: 0,
    samples: [],
    bests: {},
    mastered: [],
    streak: { day: '', length: 0 },
    today: { day: '', points: 0, sessions: 0, phrases: {} },
    gains: [],
});

/** Personal bests kept for review. Enough to show a list, not a diary. */
const GAINS_KEPT = 40;

/** Events are kept this long; the lifetime total carries the rest. */
const EVENT_RETENTION_DAYS = 90;
/** Scores are kept long enough to span the improvement comparison. */
const SAMPLE_RETENTION_DAYS = 28;

const DAY_MS = 86_400_000;

const newId = (): string => {
    const bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const rollDay = (ledger: Ledger, day: string): Ledger['today'] =>
    ledger.today.day === day ? ledger.today : { day, points: 0, sessions: 0, phrases: {} };

/** Trim a set of lines to whatever is left of the day's budget. */
function applyCap(lines: PointLine[], spent: number): PointsAward {
    const budget = Math.max(0, DAILY_CAP - spent);
    const kept: PointLine[] = [];
    let total = 0;
    let capped = false;

    for (const line of lines) {
        if (line.points <= 0) continue;
        const room = budget - total;
        if (room <= 0) {
            capped = true;
            break;
        }
        if (line.points > room) {
            kept.push({ ...line, points: room });
            total += room;
            capped = true;
            break;
        }
        kept.push(line);
        total += line.points;
    }

    return { total, lines: kept, capped };
}

// ---------------------------------------------------------------------------
// An attempt
// ---------------------------------------------------------------------------

export interface AttemptPoints {
    /** Composite pronunciation score, 0-100. */
    score: number;
    /** The bar this attempt had to beat. */
    threshold: number;
    passed: boolean;
    /**
     * Whether the app was willing to judge it. An attempt the recogniser was
     * not confident about costs no life, and it earns nothing either.
     */
    counts: boolean;
    /** The phrase, used only as the anti-grinding key. Never leaves the device. */
    phrase: string;
    wordScores: WordScore[];
    /** The stage's level, when it has a CEFR one. */
    cefr: string;
    /** The learner's record BEFORE this attempt is folded into it. */
    profile: Profile;
    now: number;
    /** Injectable for tests. */
    id?: () => string;
}

/**
 * Points for one attempt, and the ledger that results.
 *
 * Returns the ledger unchanged when there is nothing to pay, so a caller can
 * compare identities to know whether anything happened.
 */
export function awardAttempt(
    ledger: Ledger,
    input: AttemptPoints
): { ledger: Ledger; award: PointsAward } {
    if (!input.counts) return { ledger, award: NOTHING };

    const mint = input.id ?? newId;
    const now = input.now;
    const day = dayKey(now);
    const today = rollDay(ledger, day);
    const cefr = isCefrLevel(input.cefr) ? input.cefr : undefined;
    const factor = levelFactor(input.cefr);
    const scale = (base: number) => Math.round(base * factor);

    const lines: PointLine[] = [];

    // ── The day's streak ───────────────────────────────────────────────
    // Advanced by the first judged attempt of the day, whether or not it was
    // any good: showing up is the habit being rewarded.
    let streak = ledger.streak;
    if (streak.day !== day) {
        const consecutive = streak.day ? daysBetween(streak.day, day) === 1 : false;
        streak = { day, length: consecutive ? streak.length + 1 : 1 };
        if (streak.length % STREAK_EVERY === 0) {
            lines.push({
                kind: 'streak',
                points: STREAK_BONUS,
                detail: `${streak.length} dager på rad`,
            });
        }
    }

    // ── Performance ────────────────────────────────────────────────────
    const phraseKey = input.phrase.trim().toLowerCase();
    const saidToday = today.phrases[phraseKey] ?? 0;
    const words = input.wordScores.map(word => word.word.toLowerCase());
    const allMastered =
        words.length > 0 &&
        words.every(word => (input.profile.words[word]?.box ?? 0) >= MASTERY_BOX);

    if (saidToday >= PHRASE_DAILY_LIMIT) {
        // Said enough times today. Practise it as much as you like; it stops
        // being worth points long before it stops being worth doing.
    } else if (allMastered) {
        if (input.passed) {
            lines.push({
                kind: 'review',
                points: scale(REVIEW),
                detail: 'Repetisjon av en mestret frase',
            });
        }
    } else {
        lines.push({ kind: 'attempt', points: scale(ATTEMPT), detail: 'Fullført forsøk' });
        if (input.passed) {
            const strong = input.score >= input.threshold + STRONG_MARGIN;
            lines.push(
                strong
                    ? { kind: 'strong', points: scale(STRONG), detail: 'Sterk uttale' }
                    : { kind: 'clear', points: scale(CLEAR), detail: 'Klarte kravet' }
            );
        }
    }

    // ── Improvement, against your own best ever on the word ────────────
    const bests = { ...ledger.bests };
    let bestGain = 0;
    let improvedWord = '';
    let improvedFrom = 0;
    let improvedTo = 0;

    for (const word of input.wordScores) {
        const key = word.word.toLowerCase();
        const value = Math.round(word.score * 100);
        const previous = bests[key];
        if (previous !== undefined && value - previous >= MIN_GAIN && value - previous > bestGain) {
            bestGain = value - previous;
            improvedWord = word.word;
            improvedFrom = previous;
            improvedTo = value;
        }
        if (previous === undefined || value > previous) bests[key] = value;
    }

    if (bestGain > 0) {
        lines.push({
            kind: 'improvement',
            points: Math.min(
                IMPROVEMENT_MAX,
                IMPROVEMENT_BASE + Math.floor((bestGain - MIN_GAIN) / 6)
            ),
            detail: `Ny personlig rekord på «${improvedWord}»`,
        });
    }

    // ── Mastery, once per word, ever ───────────────────────────────────
    const mastered = new Set(ledger.mastered);
    for (const word of input.wordScores) {
        const key = word.word.toLowerCase();
        if (mastered.has(key)) continue;
        const record = input.profile.words[key];
        const box = record?.box ?? 0;
        if (box >= MASTERY_BOX) continue;
        if (nextBox(box, isWordClean(word)) < MASTERY_BOX) continue;

        // A word is hard if it was hard for THIS learner — if they missed it on
        // the way here. Which words those are differs at A1 and at B1, and that
        // is exactly the point.
        const misses = (record?.scores ?? []).filter(score => score < 80).length;
        mastered.add(key);
        lines.push({
            kind: 'mastery',
            points: misses >= HARD_MISSES ? MASTERY_HARD : MASTERY,
            detail: `Mestret «${word.word}»`,
        });
    }

    const award = applyCap(lines, today.points);

    // Only remember the gain if it was actually paid. A gain trimmed away by
    // the daily cap has not been credited, and showing it would be a lie about
    // what the day was worth.
    const paidImprovement = award.lines.some(line => line.kind === 'improvement');
    const gains =
        bestGain > 0 && paidImprovement
            ? [...ledger.gains, { word: improvedWord, from: improvedFrom, to: improvedTo, at: now }].slice(
                  -GAINS_KEPT
              )
            : ledger.gains;

    const events: PointEvent[] = award.lines.map(line => ({
        id: mint(),
        kind: line.kind,
        points: line.points,
        at: now,
        ...(cefr ? { cefr } : {}),
    }));

    return {
        ledger: prune(
            {
                ...ledger,
                events: [...ledger.events, ...events],
                lifetime: ledger.lifetime + award.total,
                samples: [...ledger.samples, { at: now, score: input.score }],
                bests,
                mastered: [...mastered],
                streak,
                gains,
                today: {
                    ...today,
                    points: today.points + award.total,
                    phrases: { ...today.phrases, [phraseKey]: saidToday + 1 },
                },
            },
            now
        ),
        award,
    };
}

// ---------------------------------------------------------------------------
// A finished run
// ---------------------------------------------------------------------------

export interface SessionPoints {
    /** Whether the run was played out or ended on lives. */
    completed: boolean;
    cleared: number;
    cefr: string;
    now: number;
    id?: () => string;
}

export function awardSession(
    ledger: Ledger,
    input: SessionPoints
): { ledger: Ledger; award: PointsAward } {
    const day = dayKey(input.now);
    const today = rollDay(ledger, day);
    if (today.sessions >= SESSION_DAILY_LIMIT) return { ledger, award: NOTHING };

    const points = input.completed
        ? SESSION_CLEARED
        : input.cleared >= SESSION_MIN_CLEARED
          ? SESSION_PARTIAL
          : 0;
    if (points === 0) return { ledger, award: NOTHING };

    // No level factor here. Finishing what you started is the same achievement
    // whatever the vocabulary was.
    const award = applyCap(
        [
            {
                kind: 'session',
                points,
                detail: input.completed ? 'Fullført nivå' : 'Fullført økt',
            },
        ],
        today.points
    );
    if (award.total === 0) return { ledger, award };

    const cefr = isCefrLevel(input.cefr) ? input.cefr : undefined;
    const mint = input.id ?? newId;

    return {
        ledger: prune(
            {
                ...ledger,
                events: [
                    ...ledger.events,
                    {
                        id: mint(),
                        kind: 'session',
                        points: award.total,
                        at: input.now,
                        ...(cefr ? { cefr } : {}),
                    },
                ],
                lifetime: ledger.lifetime + award.total,
                today: {
                    ...today,
                    points: today.points + award.total,
                    sessions: today.sessions + 1,
                },
            },
            input.now
        ),
        award,
    };
}

/** Drop what is too old to be needed, so the ledger cannot grow without end. */
function prune(ledger: Ledger, now: number): Ledger {
    const eventFloor = now - EVENT_RETENTION_DAYS * DAY_MS;
    const sampleFloor = now - SAMPLE_RETENTION_DAYS * DAY_MS;
    return {
        ...ledger,
        events: ledger.events.filter(event => event.at >= eventFloor),
        samples: ledger.samples.filter(sample => sample.at >= sampleFloor),
    };
}

// ---------------------------------------------------------------------------
// Reading the ledger
// ---------------------------------------------------------------------------

export const allTimePoints = (ledger: Ledger): number => ledger.lifetime;

export function weeklyPoints(ledger: Ledger, now: number): number {
    const week = weekKey(now);
    return ledger.events
        .filter(event => weekKey(event.at) === week)
        .reduce((sum, event) => sum + event.points, 0);
}

/** The streak as of now — yesterday's streak survives until midnight tonight. */
export function currentStreak(ledger: Ledger, now: number): number {
    if (!ledger.streak.day) return 0;
    return daysBetween(ledger.streak.day, dayKey(now)) <= 1 ? ledger.streak.length : 0;
}

/** Points not yet told to a leaderboard server. */
export const pendingEvents = (ledger: Ledger): PointEvent[] =>
    ledger.events.filter(event => !event.sent);

export function markSent(ledger: Ledger, ids: readonly string[]): Ledger {
    const accepted = new Set(ids);
    if (!accepted.size) return ledger;
    return {
        ...ledger,
        events: ledger.events.map(event =>
            accepted.has(event.id) ? { ...event, sent: true } : event
        ),
    };
}

/**
 * Which level this learner is practising at.
 *
 * The level carrying the most points, so an occasional excursion up or down
 * does not reclassify anyone. Null until they have practised a levelled stage
 * at all — the occupation tracks have no CEFR rung to report.
 */
export function dominantLevel(ledger: Ledger): CefrLevel | null {
    const byLevel = new Map<CefrLevel, number>();
    for (const event of ledger.events) {
        if (!event.cefr) continue;
        byLevel.set(event.cefr, (byLevel.get(event.cefr) ?? 0) + event.points);
    }

    let best: CefrLevel | null = null;
    let bestPoints = 0;
    // Walked in level order, so a tie resolves upwards to the harder level.
    for (const level of CEFR_LEVELS) {
        const points = byLevel.get(level) ?? 0;
        if (points > 0 && points >= bestPoints) {
            best = level;
            bestPoints = points;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// Looking back
//
// A weekly total on its own says nothing — 320 is only good or bad next to the
// weeks around it. These turn the ledger into the shapes a learner can read at
// a glance: which days they showed up, how the weeks compare, and where the
// points actually came from.
// ---------------------------------------------------------------------------

export interface WeekTotal {
    key: string;
    /** Monday 00:00 UTC. */
    start: number;
    points: number;
    /** True for the week containing `now`. */
    current: boolean;
}

/**
 * The last `weeks` weeks, oldest first, including empty ones.
 *
 * Empty weeks are kept deliberately: a gap is information, and a chart that
 * silently closes it up tells the learner they were more consistent than they
 * were.
 */
export function weeklyHistory(ledger: Ledger, now: number, weeks = 8): WeekTotal[] {
    const thisWeek = weekStart(now);
    const totals = new Map<string, number>();
    for (const event of ledger.events) {
        const key = weekKey(event.at);
        totals.set(key, (totals.get(key) ?? 0) + event.points);
    }

    const out: WeekTotal[] = [];
    for (let back = weeks - 1; back >= 0; back--) {
        const start = thisWeek - back * 7 * DAY_MS;
        const key = weekKey(start);
        out.push({ key, start, points: totals.get(key) ?? 0, current: back === 0 });
    }
    return out;
}

export interface DayTotal {
    key: string;
    at: number;
    points: number;
    practised: boolean;
    today: boolean;
}

/** The last `days` days, oldest first — the streak, as something you can see. */
export function practiceDays(ledger: Ledger, now: number, days = 14): DayTotal[] {
    const totals = new Map<string, number>();
    for (const event of ledger.events) {
        const key = dayKey(event.at);
        totals.set(key, (totals.get(key) ?? 0) + event.points);
    }

    const startOfToday = Math.floor(now / DAY_MS) * DAY_MS;
    const out: DayTotal[] = [];
    for (let back = days - 1; back >= 0; back--) {
        const at = startOfToday - back * DAY_MS;
        const key = dayKey(at);
        const points = totals.get(key) ?? 0;
        out.push({ key, at, points, practised: points > 0, today: back === 0 });
    }
    return out;
}

/**
 * Where the points came from, over events at or after `since`.
 *
 * The interesting question is not how many points but which KIND — a week made
 * of improvement and mastery is a different week from one made of attempts,
 * even at the same total, and only one of them is worth repeating.
 */
export function pointsByKind(ledger: Ledger, since = 0): { kind: PointKind; points: number }[] {
    const totals = new Map<PointKind, number>();
    for (const event of ledger.events) {
        if (event.at < since) continue;
        totals.set(event.kind, (totals.get(event.kind) ?? 0) + event.points);
    }
    return [...totals.entries()]
        .map(([kind, points]) => ({ kind, points }))
        .sort((a, b) => b.points - a.points);
}

/** The most recent personal bests, newest first. */
export const recentGains = (ledger: Ledger, limit = 6): PersonalBest[] =>
    [...ledger.gains].reverse().slice(0, limit);

/** The biggest personal bests ever recorded, largest jump first. */
export const bestGains = (ledger: Ledger, limit = 6): PersonalBest[] =>
    [...ledger.gains].sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, limit);

/** Words carried to mastery. */
export const masteredCount = (ledger: Ledger): number => ledger.mastered.length;

// ---------------------------------------------------------------------------
// Improvement
// ---------------------------------------------------------------------------

/** Attempts needed in each week before an improvement figure means anything. */
export const MIN_IMPROVEMENT_SAMPLES = 10;
/** Movement smaller than this is noise, not learning. */
export const MIN_IMPROVEMENT_DELTA = 2;

export interface Improvement {
    /** Change in median composite score, this week against last. */
    delta: number;
    /** Attempts behind the current week's median. */
    samples: number;
    /** Attempts behind the baseline. */
    baseline: number;
}

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * How much better this learner is than they were last week.
 *
 * Medians rather than means, over whole weeks, with a floor on how many
 * attempts each side must have. A percentage-change board computed from three
 * attempts is a lottery — someone who happened to mumble twice last Tuesday
 * wins it — so this returns null until there is enough to say, and the UI says
 * so rather than inventing a number.
 */
export function improvement(ledger: Ledger, now: number): Improvement | null {
    const thisWeek = weekStart(now);
    const lastWeek = thisWeek - 7 * DAY_MS;

    const current = ledger.samples.filter(sample => sample.at >= thisWeek).map(s => s.score);
    const before = ledger.samples
        .filter(sample => sample.at >= lastWeek && sample.at < thisWeek)
        .map(sample => sample.score);

    if (current.length < MIN_IMPROVEMENT_SAMPLES || before.length < MIN_IMPROVEMENT_SAMPLES) {
        return null;
    }

    return {
        delta: Math.round((median(current) - median(before)) * 10) / 10,
        samples: current.length,
        baseline: before.length,
    };
}

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

export const LEAGUES = [
    { name: 'Bronze', from: 0, icon: '🥉' },
    { name: 'Silver', from: 1_000, icon: '🥈' },
    { name: 'Gold', from: 5_000, icon: '🥇' },
    { name: 'Diamond', from: 15_000, icon: '💎' },
] as const;

export type League = (typeof LEAGUES)[number];

/**
 * The learner's league, from their all-time points.
 *
 * Deliberately a badge and not a competition. Splitting people into cohorts
 * they are promoted and relegated between needs a population to split, and
 * there is not one yet; server/README.md says what that would take.
 */
export function league(allTime: number): League {
    let current: League = LEAGUES[0];
    for (const candidate of LEAGUES) if (allTime >= candidate.from) current = candidate;
    return current;
}

/** Points still needed for the next league, or null at the top. */
export function toNextLeague(allTime: number): { league: League; points: number } | null {
    const next = LEAGUES.find(candidate => allTime < candidate.from);
    return next ? { league: next, points: next.from - allTime } : null;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'npa-community-v1';

export function loadLedger(): Ledger {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyLedger();
        const parsed = JSON.parse(raw) as Ledger;
        if (parsed?.version !== 1) return emptyLedger();
        return { ...emptyLedger(), ...parsed };
    } catch {
        return emptyLedger();
    }
}

export function saveLedger(ledger: Ledger): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
    } catch {
        // Storage unavailable; the session still counts, it just is not kept.
    }
}
