import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePronunciationSession, THRESHOLDS } from '../usePronunciationSession';
import type { PronunciationResult } from '../../types/Scoring';

const pools = {
    '1': ['hei', 'takk'],
    '2': ['jeg liker kaffe'],
};

function makeResult(score: number): PronunciationResult {
    return {
        expected: 'hei',
        transcript: 'hei',
        wer: 0,
        pronunciation_score: score,
        substitutions: 0,
        deletions: 0,
        insertions: 0,
        word_scores: [{ word: 'hei', index: 0, status: 'equal', score: 1, expected_ipa: null, heard_ipa: null }],
        detail: '',
    };
}

beforeEach(() => {
    window.localStorage.clear();
});

describe('usePronunciationSession', () => {
    it('starts unnamed and at level 1 with no history', () => {
        const { result } = renderHook(() => usePronunciationSession(pools));
        expect(result.current.askedName).toBe(false);
        expect(result.current.level).toBe(1);
        expect(result.current.summary).toBeNull();
    });

    it('persists the confirmed name across a remount (simulated refresh)', () => {
        const { result, unmount } = renderHook(() => usePronunciationSession(pools));
        act(() => result.current.confirmName('Kari'));
        expect(result.current.askedName).toBe(true);
        unmount();

        const { result: fresh } = renderHook(() => usePronunciationSession(pools));
        expect(fresh.current.userName).toBe('Kari');
        expect(fresh.current.askedName).toBe(true);
    });

    it('advances to the next level after a single passing attempt', () => {
        const { result } = renderHook(() => usePronunciationSession(pools));
        expect(result.current.level).toBe(1);

        act(() => result.current.advance());
        expect(result.current.level).toBe(2);
    });

    it('caps advancement at the last level instead of going out of range', () => {
        const { result } = renderHook(() => usePronunciationSession(pools));
        act(() => result.current.advance()); // -> level 2 (last)
        act(() => result.current.advance()); // should stay at 2
        expect(result.current.level).toBe(2);
    });

    it('passed() compares the composite score against the active difficulty threshold', () => {
        const { result } = renderHook(() => usePronunciationSession(pools));
        act(() => result.current.setDifficulty('Professional'));

        expect(result.current.passed(makeResult(THRESHOLDS.Professional - 1))).toBe(false);
        expect(result.current.passed(makeResult(THRESHOLDS.Professional))).toBe(true);
    });

    it('recordResult accumulates history used for the end-of-session summary', () => {
        const { result } = renderHook(() => usePronunciationSession(pools));
        act(() => result.current.recordResult(makeResult(90)));
        act(() => result.current.recordResult(makeResult(60)));

        expect(result.current.summary).not.toBeNull();
        expect(result.current.summary?.total).toBe(2);
        expect(result.current.summary?.avgScore).toBe(75);
    });

    it('restart clears progress back to defaults, including in storage', () => {
        const { result } = renderHook(() => usePronunciationSession(pools));
        act(() => result.current.confirmName('Kari'));
        act(() => result.current.advance());
        act(() => result.current.restart());

        expect(result.current.userName).toBe('');
        expect(result.current.askedName).toBe(false);
        expect(result.current.level).toBe(1);

        const stored = JSON.parse(window.localStorage.getItem('npa-session-v1') ?? 'null');
        expect(stored).toMatchObject({ userName: '', askedName: false, level: 1 });
    });
});
