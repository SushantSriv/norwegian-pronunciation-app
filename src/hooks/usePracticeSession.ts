import { useCallback, useMemo, useState } from 'react';
import { scoreAttempt, type AttemptScore, type IpaResolver } from '../utils/scoring';
import type { Recognition, WordTiming } from '../utils/asr';
import { judgeAttempt, type AttemptVerdict } from '../utils/attemptVerdict';
import { drillPool, prioritise, weaknesses, type Profile } from '../utils/learningProfile';
import type { PitchAccent } from '../data/tonelag';
import { poolForStage, type Stage } from '../data/stages';
import rawSentenceData from '../data/sentences.json';
import occupationData from '../data/occupations.json';

const LEVELS = (rawSentenceData as { levels: Record<string, string[]> }).levels;
const OCCUPATIONS = occupationData as Record<string, string[]>;

/** Items you must clear to finish a run. */
export const ITEMS_TO_WIN = 10;
/** Failed attempts allowed before the run ends. */
export const MAX_STRIKES = 3;
/** How much the pass bar rises per item cleared. */
export const THRESHOLD_STEP = 3;

export type Outcome = 'completed' | 'out-of-lives';

export interface Attempt extends AttemptScore {
    /** The bar this attempt had to beat. */
    threshold: number;
    passed: boolean;
    /**
     * Where each heard word sat in the recording, when the model reported it.
     * Carried through so the melody of individual words can be looked at
     * against the same pitch contour the chart already draws.
     */
    words: WordTiming[];
    /** Whether the recognition can be trusted as pronunciation feedback. */
    verdict: AttemptVerdict;
}

interface SessionState {
    stage: Stage;
    queue: string[];
    cursor: number;
    cleared: number;
    strikes: number;
    /** Consecutive clears; resets on any miss. */
    streak: number;
    bestStreak: number;
    attempts: Attempt[];
    outcome: Outcome | null;
}

const BEST_KEY = 'npa-best-v2';

function shuffle<T>(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function readBests(): Record<string, number> {
    try {
        return JSON.parse(window.localStorage.getItem(BEST_KEY) ?? '{}');
    } catch {
        // Private browsing / disabled storage / corrupt JSON.
        return {};
    }
}

function writeBest(stageId: string, cleared: number) {
    try {
        const bests = readBests();
        if ((bests[stageId] ?? 0) >= cleared) return;
        window.localStorage.setItem(BEST_KEY, JSON.stringify({ ...bests, [stageId]: cleared }));
    } catch {
        // Storage unavailable — the run just will not be remembered.
    }
}

/**
 * @param toIpa How words become IPA for scoring. Defaults to the rule engine;
 * the app supplies a resolver backed by the NB Uttale lexicon.
 */
/** Every phrase the app knows, for drills that are not tied to one stage. */
function everyPhrase(): string[] {
    return [...Object.values(LEVELS).flat(), ...Object.values(OCCUPATIONS).flat()];
}

export function usePracticeSession(
    toIpa?: IpaResolver,
    profile?: Profile,
    accentFor?: (word: string) => PitchAccent
) {
    const [session, setSession] = useState<SessionState | null>(null);
    const [bests, setBests] = useState<Record<string, number>>(readBests);
    /** The most recent graded attempt, shown as feedback before moving on. */
    const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);

    const begin = useCallback((stage: Stage) => {
        // The weakness drill has no corpus of its own: it is assembled now,
        // from whatever exercises the thing the learner is currently worst at.
        const weakness = profile ? weaknesses(profile)[0] : undefined;
        const pool =
            stage.track === 'weakness' && weakness && toIpa && accentFor
                ? drillPool(weakness, everyPhrase(), toIpa, accentFor)
                : poolForStage(stage, LEVELS, OCCUPATIONS);
        if (!pool.length) return;
        // A run needs ITEMS_TO_WIN passes plus room for up to MAX_STRIKES
        // misses, so draw enough that we never run dry mid-run.
        const needed = ITEMS_TO_WIN + MAX_STRIKES;
        // Shuffle first so a run is never the same twice, then let the
        // learner's own record pull the phrases they are due to revisit to the
        // front. Without a profile this is just the shuffle it always was.
        const shuffled = shuffle(pool);
        const ordered = profile ? prioritise(profile, shuffled) : shuffled;
        const queue = ordered.slice(0, Math.max(needed, Math.min(pool.length, needed)));
        setLastAttempt(null);
        setSession({ stage, queue, cursor: 0, cleared: 0, strikes: 0, streak: 0, bestStreak: 0, attempts: [], outcome: null });
    }, [profile, toIpa, accentFor]);

    const quit = useCallback(() => {
        setSession(null);
        setLastAttempt(null);
    }, []);

    const threshold = session
        ? session.stage.baseThreshold + session.cleared * THRESHOLD_STEP
        : 0;

    const currentItem = session ? (session.queue[session.cursor] ?? session.queue[0]) : '';

    /**
     * Grade what the recognizer heard against the current item.
     *
     * Takes either the full recognition or just its text; the plain string form
     * is what the tests and any caller without word timings use.
     */
    const submit = useCallback(
        (heard: string | Recognition) => {
            if (!session || session.outcome) return;

            const recognition: Recognition =
                typeof heard === 'string' ? { text: heard, words: [] } : heard;

            const graded = scoreAttempt(currentItem, recognition.text, toIpa);
            const bar = session.stage.baseThreshold + session.cleared * THRESHOLD_STEP;
            const passed = graded.score >= bar;
            const verdict = judgeAttempt({
                heard: recognition.text,
                passed,
                speech: recognition.speech,
                words: recognition.words,
            });
            const attempt: Attempt = {
                ...graded,
                threshold: bar,
                passed,
                words: recognition.words,
                verdict,
            };

            setLastAttempt(attempt);

            // An attempt we cannot vouch for costs nothing and is offered
            // again. Charging a life for the model's mistake is how a learner
            // is taught to distrust the feedback.
            if (!verdict.counts) {
                setSession({ ...session, attempts: session.attempts });
                return;
            }

            const cleared = session.cleared + (passed ? 1 : 0);
            const strikes = session.strikes + (passed ? 0 : 1);
            const streak = passed ? session.streak + 1 : 0;
            const bestStreak = Math.max(session.bestStreak, streak);

            let outcome: Outcome | null = null;
            if (cleared >= ITEMS_TO_WIN) outcome = 'completed';
            else if (strikes >= MAX_STRIKES) outcome = 'out-of-lives';

            // Side effects stay out of the state updater, which React may
            // invoke more than once per commit.
            if (outcome) {
                writeBest(session.stage.id, cleared);
                setBests(readBests());
            }

            setSession({
                ...session,
                cleared,
                strikes,
                streak,
                bestStreak,
                attempts: [...session.attempts, attempt],
                outcome,
                // Advance regardless of pass/fail so a stubborn item cannot
                // trap the learner on a loop.
                cursor: (session.cursor + 1) % session.queue.length,
            });
        },
        [session, currentItem, toIpa]
    );

    /** Dismiss the feedback card and move to the next item. */
    const next = useCallback(() => setLastAttempt(null), []);

    const summary = useMemo(() => {
        if (!session?.attempts.length) return null;
        const { attempts } = session;
        const avgScore = attempts.reduce((s, a) => s + a.score, 0) / attempts.length;
        const missed = new Map<string, number>();
        for (const attempt of attempts) {
            for (const word of attempt.wordScores) {
                if (word.status === 'equal') continue;
                missed.set(word.word, (missed.get(word.word) ?? 0) + 1);
            }
        }
        return {
            avgScore,
            attempts: attempts.length,
            cleared: session.cleared,
            bestStreak: session.bestStreak,
            missedWords: [...missed.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([word, count]) => ({ word, count })),
        };
    }, [session]);

    return {
        session,
        stage: session?.stage ?? null,
        currentItem,
        threshold,
        cleared: session?.cleared ?? 0,
        strikes: session?.strikes ?? 0,
        streak: session?.streak ?? 0,
        outcome: session?.outcome ?? null,
        lastAttempt,
        summary,
        bests,
        begin,
        submit,
        next,
        quit,
    };
}
