import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PronunciationResult } from '../types/Scoring';

export type Difficulty = 'Beginner' | 'Amateur' | 'Professional';

// Minimum composite pronunciation_score (0-100) needed to pass at each level.
export const THRESHOLDS: Record<Difficulty, number> = {
    Beginner: 50,
    Amateur: 70,
    Professional: 85,
};

const STORAGE_KEY = 'npa-session-v1';

interface HistoryEntry {
    pronunciationScore: number;
    wer: number;
    missedWords: string[];
}

interface PersistedState {
    userName: string;
    askedName: boolean;
    level: number;
    difficulty: Difficulty;
    history: HistoryEntry[];
}

const defaultState: PersistedState = {
    userName: '',
    askedName: false,
    level: 1,
    difficulty: 'Beginner',
    history: [],
};

function loadPersisted(): PersistedState {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState;
        return { ...defaultState, ...JSON.parse(raw) };
    } catch {
        // Private browsing / storage disabled / corrupt JSON — fall back silently.
        return defaultState;
    }
}

export function usePronunciationSession(sentencePools: Record<string, string[]>) {
    const [persisted, setPersisted] = useState<PersistedState>(loadPersisted);
    const [finished, setFinished] = useState(false);
    const [expected, setExpected] = useState('');

    const levelCount = Object.keys(sentencePools).length;

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
        } catch {
            // Storage unavailable — progress just won't survive a refresh.
        }
    }, [persisted]);

    const pickNewSentence = useCallback((pool: string[]) => {
        setExpected(pool[Math.floor(Math.random() * pool.length)]);
    }, []);

    const poolForLevel = useCallback(
        (level: number) => sentencePools[level.toString()] || sentencePools['1'],
        [sentencePools]
    );

    // Pick a sentence from the restored (or default) level on first mount.
    useEffect(() => {
        pickNewSentence(poolForLevel(persisted.level));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const confirmName = useCallback((name: string) => {
        setPersisted(s => ({ ...s, userName: name, askedName: true }));
    }, []);

    const setDifficulty = useCallback((difficulty: Difficulty) => {
        setPersisted(s => ({ ...s, difficulty }));
    }, []);

    const passed = useCallback(
        (result: PronunciationResult) => result.pronunciation_score >= THRESHOLDS[persisted.difficulty],
        [persisted.difficulty]
    );

    const recordResult = useCallback((result: PronunciationResult) => {
        const missedWords = result.word_scores.filter(w => w.status !== 'equal').map(w => w.word);
        setPersisted(s => ({
            ...s,
            history: [...s.history, { pronunciationScore: result.pronunciation_score, wer: result.wer, missedWords }],
        }));
    }, []);

    // Called after a passing attempt, once the success overlay has run its course.
    // Picks the next sentence synchronously (outside the setState updater, which
    // must stay a pure function of its input) using the level value already in
    // scope, then applies the matching state update.
    const advance = useCallback(() => {
        const nextLevel = Math.min(persisted.level + 1, levelCount);
        pickNewSentence(poolForLevel(nextLevel));
        setPersisted(s => ({ ...s, level: nextLevel }));
    }, [persisted.level, levelCount, pickNewSentence, poolForLevel]);

    const finishSession = useCallback(() => setFinished(true), []);

    const restart = useCallback(() => {
        // No need to also removeItem() here: the persistence effect above
        // re-serializes `persisted` on every change, so it will overwrite
        // storage with `defaultState` right after this setPersisted runs.
        pickNewSentence(poolForLevel(1));
        setPersisted(defaultState);
        setFinished(false);
    }, [pickNewSentence, poolForLevel]);

    const summary = useMemo(() => {
        if (!persisted.history.length) return null;
        const avgScore =
            persisted.history.reduce((s, h) => s + h.pronunciationScore, 0) / persisted.history.length;
        const missedWords = Array.from(new Set(persisted.history.flatMap(h => h.missedWords)));
        const goodCount = persisted.history.filter(h => h.missedWords.length === 0).length;
        return { avgScore, total: persisted.history.length, goodCount, missedWords };
    }, [persisted.history]);

    return {
        userName: persisted.userName,
        askedName: persisted.askedName,
        level: persisted.level,
        levelCount,
        difficulty: persisted.difficulty,
        history: persisted.history,
        expected,
        finished,
        summary,
        confirmName,
        setDifficulty,
        passed,
        recordResult,
        advance,
        finishSession,
        restart,
    };
}
