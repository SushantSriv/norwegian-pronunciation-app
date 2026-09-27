/**
 * Past rehearsals, on this device only.
 *
 * WHAT IS KEPT: the date, the level, and the handful of counts the summary
 * showed — seconds spoken, words, pauses, the longest pause. Nothing else.
 *
 * WHAT IS NOT KEPT, deliberately: no audio, ever. Not the recording, not a
 * fingerprint of it, not a trimmed clip. And not the transcripts either — the
 * value of a history is "am I pausing less than I was", which the counts answer,
 * and a stored transcript of somebody describing their own family is a far
 * larger thing to leave lying in a browser than that question is worth.
 *
 * Nothing here is ever sent anywhere. The rehearsal has no leaderboard and no
 * sync: a mode whose whole point is that it does not grade you has nothing to
 * rank, and comparing exam rehearsals between learners would be exactly the
 * comparison this mode refuses to make.
 */
import type { Nivaa } from '../data/muntlig/oppgaver';

const KEY = 'npa-muntlig-historikk-v1';
/** More than this is a year of rehearsals; older ones tell you nothing new. */
const KEEP = 40;

export interface ExamRun {
    /** ISO date-time, so a run can be shown in the learner's own locale. */
    at: string;
    nivaa: Nivaa;
    /** How long the whole session ran. */
    elapsedMs: number;
    /** Seconds of audible speech across the assessed tasks, or null. */
    speaking: number | null;
    /** Words across the assessed tasks. */
    tokens: number;
    /** Pauses at or over the reporting threshold, or null when unmeasured. */
    pauses: number | null;
    /** The longest of them in seconds, or null. */
    longestPause: number | null;
    /** How many lettered tasks the app could not run. */
    skipped: number;
}

const isRun = (value: unknown): value is ExamRun => {
    if (!value || typeof value !== 'object') return false;
    const run = value as Partial<ExamRun>;
    return typeof run.at === 'string' && typeof run.nivaa === 'string';
};

export function readHistory(): ExamRun[] {
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isRun) : [];
    } catch {
        // Unreadable or unavailable storage is an empty history, not an error
        // a learner should have to see.
        return [];
    }
}

/** Newest first, capped. Returns the list as it now stands. */
export function remember(run: ExamRun): ExamRun[] {
    const kept = [run, ...readHistory()].slice(0, KEEP);
    try {
        window.localStorage.setItem(KEY, JSON.stringify(kept));
    } catch {
        // Storage full or blocked; the run just will not persist.
    }
    return kept;
}

export function forgetHistory(): void {
    try {
        window.localStorage.removeItem(KEY);
    } catch {
        // Nothing to do.
    }
}

/**
 * The previous run at the same level, for comparison.
 *
 * Same level only, because the levels are different exams — three tasks against
 * four, a conversation slot of five to seven minutes against two to three — and
 * a pause count from one says nothing about the other.
 *
 * @param history Newest first, as `readHistory` returns it.
 */
export function previousAt(history: ExamRun[], nivaa: Nivaa, skip = 1): ExamRun | null {
    const atLevel = history.filter(run => run.nivaa === nivaa);
    return atLevel[skip] ?? null;
}
