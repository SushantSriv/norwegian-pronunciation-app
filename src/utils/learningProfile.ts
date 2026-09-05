/**
 * What this learner, specifically, finds hard.
 *
 * Everything else in the app judges one attempt. This remembers across them, so
 * the app can stop being a test and start being training: which sounds keep
 * going wrong, which accent is not landing, which words are slipping away.
 *
 * PRIVACY. This is the whole of it — a JSON blob in this browser's
 * localStorage. No account, no sync, no server, no analytics. Recordings are
 * never stored at all, only the scores derived from them, and clearing site
 * data is a complete erase. That is not a policy bolted on; there is nowhere
 * for the data to go, because nothing here can send it anywhere.
 */
import { tokenizeIPA } from './ipaTokenizer';
import type { AttemptScore, WordScore } from './scoring';
import type { PitchAccent } from '../data/tonelag';

const STORAGE_KEY = 'npa-profile-v1';

/** Attempts kept per word. Enough to see a trend, not enough to grow forever. */
const HISTORY = 8;

/** Leitner boxes, in days. A word climbs on success and drops to 0 on failure. */
const REVIEW_DAYS = [0, 1, 3, 7, 16, 35];

const DAY_MS = 86_400_000;

export interface SkillRecord {
    right: number;
    wrong: number;
}

export interface WordRecord {
    /** Composite scores, oldest first. */
    scores: number[];
    /** Melody verdicts for this word, when its accent was judged. */
    melody: SkillRecord;
    /** Epoch milliseconds of the last attempt. */
    lastSeen: number;
    /** Leitner box: higher means it is being remembered and shown less often. */
    box: number;
}

export interface Profile {
    version: 1;
    words: Record<string, WordRecord>;
    /** Accuracy per IPA symbol, keyed by the symbol itself. */
    phonemes: Record<string, SkillRecord>;
    /** Accuracy per pitch accent. */
    accents: Record<string, SkillRecord>;
    /** Words that only resolved by compound decomposition. */
    compounds: SkillRecord;
}

export const emptyProfile = (): Profile => ({
    version: 1,
    words: {},
    phonemes: {},
    accents: {},
    compounds: { right: 0, wrong: 0 },
});

const bump = (record: SkillRecord | undefined, right: boolean): SkillRecord => ({
    right: (record?.right ?? 0) + (right ? 1 : 0),
    wrong: (record?.wrong ?? 0) + (right ? 0 : 1),
});

/** Share correct, or null when there is not enough evidence to say. */
export function accuracy(record: SkillRecord | undefined, minimum = 3): number | null {
    if (!record) return null;
    const total = record.right + record.wrong;
    return total >= minimum ? record.right / total : null;
}

// ---------------------------------------------------------------------------
// Recording an attempt
// ---------------------------------------------------------------------------

/** A word counts as clean above this; below it the phonemes get blamed. */
const WORD_PASS = 0.8;

/**
 * Whether one word came out cleanly.
 *
 * Exported because the points engine has to agree with this exactly — it pays a
 * mastery bonus at the moment a word climbs into the long review intervals, and
 * two definitions of "clean" would put that moment in two different places.
 */
export const isWordClean = (word: WordScore): boolean =>
    word.status === 'equal' || word.score >= WORD_PASS;

/** Where a word's Leitner box goes after one attempt. */
export const nextBox = (box: number, clean: boolean): number =>
    clean ? Math.min(REVIEW_DAYS.length - 1, box + 1) : 0;

/**
 * The box at which a word counts as learned rather than merely survived.
 *
 * Box 3 is the seven-day interval: three clean attempts spread over days, not
 * three in a row in one sitting.
 */
export const MASTERY_BOX = 3;

/**
 * Which sounds went wrong in one word.
 *
 * The expected and heard IPA are compared symbol by symbol rather than as
 * strings, so a learner who substitutes one vowel is marked down on that vowel
 * and not on the consonants around it. A symbol the learner produced correctly
 * still counts as evidence — otherwise the profile only ever accumulates
 * failures and every sound looks equally bad.
 */
function creditPhonemes(profile: Profile, word: WordScore): void {
    if (!word.expectedIpa) return;
    const expected = tokenizeIPA(word.expectedIpa);
    const heard = word.heardIpa ? tokenizeIPA(word.heardIpa) : [];
    const heardCounts = new Map<string, number>();
    for (const symbol of heard) heardCounts.set(symbol, (heardCounts.get(symbol) ?? 0) + 1);

    for (const symbol of expected) {
        const remaining = heardCounts.get(symbol) ?? 0;
        const produced = remaining > 0;
        if (produced) heardCounts.set(symbol, remaining - 1);
        profile.phonemes[symbol] = bump(profile.phonemes[symbol], produced);
    }
}

export interface MelodyOutcome {
    word: string;
    accent: PitchAccent;
    /** Whether the learner produced the accent the word takes. */
    correct: boolean;
}

export interface AttemptRecord {
    score: AttemptScore;
    /** Per-word melody verdicts, where any were measured. */
    melody?: MelodyOutcome[];
    /** Words whose pronunciation came from compound decomposition. */
    compoundWords?: string[];
    /** Injectable for tests. */
    now?: number;
}

/**
 * Fold one attempt into the profile, returning a new one.
 *
 * Pure, so the reducer can be tested without a browser and so React state
 * updates stay predictable.
 */
export function recordAttempt(profile: Profile, attempt: AttemptRecord): Profile {
    const now = attempt.now ?? Date.now();
    const next: Profile = {
        ...profile,
        words: { ...profile.words },
        phonemes: { ...profile.phonemes },
        accents: { ...profile.accents },
    };

    for (const word of attempt.score.wordScores) {
        const key = word.word.toLowerCase();
        const previous = next.words[key];
        const clean = isWordClean(word);

        next.words[key] = {
            scores: [...(previous?.scores ?? []), Math.round(word.score * 100)].slice(-HISTORY),
            melody: previous?.melody ?? { right: 0, wrong: 0 },
            lastSeen: now,
            // Climb one box for a clean attempt, fall to the bottom otherwise:
            // a word you just got wrong is a word to come back to soon.
            box: nextBox(previous?.box ?? 0, clean),
        };

        if (!clean) creditPhonemes(next, word);
    }

    for (const outcome of attempt.melody ?? []) {
        if (outcome.accent === 'NONE') continue;
        next.accents[outcome.accent] = bump(next.accents[outcome.accent], outcome.correct);

        const key = outcome.word.toLowerCase();
        const record = next.words[key];
        if (record) {
            next.words[key] = {
                ...record,
                melody: bump(record.melody, outcome.correct),
            };
        }
    }

    if (attempt.compoundWords?.length) {
        const cleanByWord = new Map(
            attempt.score.wordScores.map(word => [word.word.toLowerCase(), isWordClean(word)])
        );
        for (const word of attempt.compoundWords) {
            next.compounds = bump(next.compounds, cleanByWord.get(word.toLowerCase()) ?? false);
        }
    }

    return next;
}

// ---------------------------------------------------------------------------
// Spaced repetition
// ---------------------------------------------------------------------------

/** When a word should come round again. */
export function dueAt(record: WordRecord): number {
    return record.lastSeen + REVIEW_DAYS[Math.min(record.box, REVIEW_DAYS.length - 1)] * DAY_MS;
}

/**
 * Order a pool so the words most worth practising come first.
 *
 * Not "replay the wrong ones": a word failed once and then fixed should fade
 * out, and a word that has been right for a fortnight should come back before
 * it is gone. The ordering is, in turn — never seen, then most overdue, then
 * worst recent score.
 */
export function prioritise(profile: Profile, pool: string[], now = Date.now()): string[] {
    const rank = (phrase: string): number => {
        const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
        const records = words.map(word => profile.words[word]).filter(Boolean) as WordRecord[];
        if (!records.length) return -Infinity; // never seen: show it

        // The weakest word in the phrase decides, since that is what makes the
        // phrase worth repeating.
        const overdue = Math.max(...records.map(record => now - dueAt(record)));
        const worst = Math.min(
            ...records.map(record => record.scores.at(-1) ?? 0)
        );
        return -(overdue / DAY_MS) * 10 + worst / 10;
    };

    return [...pool].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------
// Weaknesses
// ---------------------------------------------------------------------------

export type SkillKind = 'phoneme' | 'accent' | 'compound';

export interface Weakness {
    kind: SkillKind;
    /** The IPA symbol, accent name, or 'compound'. */
    key: string;
    accuracy: number;
    attempts: number;
}

/** Enough attempts that the rate means something. */
const MIN_ATTEMPTS = 5;

/** Above this a skill is not worth calling a weakness. */
const WEAK_BELOW = 0.85;

/**
 * The learner's weakest skills, worst first.
 *
 * Only reports what it has evidence for: a sound tried twice says nothing, and
 * naming it would send someone off to drill a problem they may not have.
 */
export function weaknesses(profile: Profile): Weakness[] {
    const out: Weakness[] = [];

    const consider = (kind: SkillKind, key: string, record: SkillRecord) => {
        const attempts = record.right + record.wrong;
        if (attempts < MIN_ATTEMPTS) return;
        const rate = record.right / attempts;
        if (rate >= WEAK_BELOW) return;
        out.push({ kind, key, accuracy: rate, attempts });
    };

    for (const [symbol, record] of Object.entries(profile.phonemes)) {
        consider('phoneme', symbol, record);
    }
    for (const [accent, record] of Object.entries(profile.accents)) {
        consider('accent', accent, record);
    }
    consider('compound', 'compound', profile.compounds);

    return out.sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
}

/**
 * Phrases worth drilling for a given weakness.
 *
 * Built from the corpus and the learner's own IPA, not from hand-written
 * categories, so it stays true as the corpus grows.
 */
export function drillPool(
    weakness: Weakness,
    pool: string[],
    toIpa: (word: string) => string,
    accentFor: (word: string) => PitchAccent
): string[] {
    return pool.filter(phrase =>
        phrase
            .split(/\s+/)
            .filter(Boolean)
            .some(word => {
                if (weakness.kind === 'phoneme') {
                    return tokenizeIPA(toIpa(word)).includes(weakness.key);
                }
                if (weakness.kind === 'accent') return accentFor(word) === weakness.key;
                return false;
            })
    );
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function loadProfile(): Profile {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyProfile();
        const parsed = JSON.parse(raw) as Profile;
        // A profile from a future version is not worth guessing at.
        if (parsed?.version !== 1) return emptyProfile();
        return { ...emptyProfile(), ...parsed };
    } catch {
        // Private browsing, disabled storage, or corrupt JSON.
        return emptyProfile();
    }
}

export function saveProfile(profile: Profile): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
        // Storage unavailable; the session still works, it just will not be
        // remembered.
    }
}
