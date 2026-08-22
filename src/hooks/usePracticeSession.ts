import { useCallback, useMemo, useState } from 'react';
import { scoreAttempt, type AttemptScore } from '../utils/scoring';
import { poolForStage, type Stage } from '../data/stages';
import rawSentenceData from '../data/sentences.json';

const LEVELS = (rawSentenceData as { levels: Record<string, string[]> }).levels;

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
}

interface SessionState {
    stage: Stage;
    queue: string[];
    cursor: number;
    cleared: number;
    strikes: number;
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

export function usePracticeSession() {
    const [session, setSession] = useState<SessionState | null>(null);
    const [bests, setBests] = useState<Record<string, number>>(readBests);
    /** The most recent graded attempt, shown as feedback before moving on. */
    const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);

    const begin = useCallback((stage: Stage) => {
        const pool = poolForStage(stage, LEVELS);
        // A run needs ITEMS_TO_WIN passes plus room for up to MAX_STRIKES
        // misses, so draw enough that we never run dry mid-run.
        const needed = ITEMS_TO_WIN + MAX_STRIKES;
        const queue = shuffle(pool).slice(0, Math.max(needed, Math.min(pool.length, needed)));
        setLastAttempt(null);
        setSession({ stage, queue, cursor: 0, cleared: 0, strikes: 0, attempts: [], outcome: null });
    }, []);

    const quit = useCallback(() => {
        setSession(null);
        setLastAttempt(null);
    }, []);

    const threshold = session
        ? session.stage.baseThreshold + session.cleared * THRESHOLD_STEP
        : 0;

    const currentItem = session ? (session.queue[session.cursor] ?? session.queue[0]) : '';

    /** Grade what the recognizer heard against the current item. */
    const submit = useCallback(
        (heard: string) => {
            if (!session || session.outcome) return;

            const graded = scoreAttempt(currentItem, heard);
            const bar = session.stage.baseThreshold + session.cleared * THRESHOLD_STEP;
            const passed = graded.score >= bar;
            const attempt: Attempt = { ...graded, threshold: bar, passed };

            const cleared = session.cleared + (passed ? 1 : 0);
            const strikes = session.strikes + (passed ? 0 : 1);

            let outcome: Outcome | null = null;
            if (cleared >= ITEMS_TO_WIN) outcome = 'completed';
            else if (strikes >= MAX_STRIKES) outcome = 'out-of-lives';

            // Side effects stay out of the state updater, which React may
            // invoke more than once per commit.
            if (outcome) {
                writeBest(session.stage.id, cleared);
                setBests(readBests());
            }

            setLastAttempt(attempt);
            setSession({
                ...session,
                cleared,
                strikes,
                attempts: [...session.attempts, attempt],
                outcome,
                // Advance regardless of pass/fail so a stubborn item cannot
                // trap the learner on a loop.
                cursor: (session.cursor + 1) % session.queue.length,
            });
        },
        [session, currentItem]
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
