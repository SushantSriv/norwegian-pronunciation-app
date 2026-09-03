import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    ITEMS_TO_WIN,
    MAX_STRIKES,
    THRESHOLD_STEP,
    usePracticeSession,
} from '../usePracticeSession';
import { STAGES } from '../../data/stages';

const stage = STAGES[0];
const GIBBERISH = 'zzz qqq xxx';

beforeEach(() => {
    window.localStorage.clear();
});

/** Say the current phrase perfectly, which always scores 100. */
function sayCorrectly(result: { current: ReturnType<typeof usePracticeSession> }) {
    act(() => result.current.submit(result.current.currentItem));
    act(() => result.current.next());
}

function sayWrong(result: { current: ReturnType<typeof usePracticeSession> }) {
    act(() => result.current.submit(GIBBERISH));
    act(() => result.current.next());
}

describe('usePracticeSession', () => {
    it('starts with no session until a stage is picked', () => {
        const { result } = renderHook(() => usePracticeSession());
        expect(result.current.stage).toBeNull();
        expect(result.current.currentItem).toBe('');
    });

    it('begins a run with a full queue and starting threshold', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        expect(result.current.stage?.id).toBe(stage.id);
        expect(result.current.currentItem).toBeTruthy();
        expect(result.current.threshold).toBe(stage.baseThreshold);
        expect(result.current.strikes).toBe(0);
    });

    it('raises the pass bar with each cleared item', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        expect(result.current.threshold).toBe(stage.baseThreshold);
        sayCorrectly(result);
        expect(result.current.cleared).toBe(1);
        expect(result.current.threshold).toBe(stage.baseThreshold + THRESHOLD_STEP);
        sayCorrectly(result);
        expect(result.current.threshold).toBe(stage.baseThreshold + 2 * THRESHOLD_STEP);
    });

    it('spends a life on a failed attempt without raising the bar', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        sayWrong(result);
        expect(result.current.strikes).toBe(1);
        expect(result.current.cleared).toBe(0);
        expect(result.current.threshold).toBe(stage.baseThreshold);
    });

    it('ends the run once the error budget is spent', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        for (let i = 0; i < MAX_STRIKES; i++) {
            expect(result.current.outcome).toBeNull();
            sayWrong(result);
        }

        expect(result.current.outcome).toBe('out-of-lives');
    });

    it('completes the run after clearing enough items', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        for (let i = 0; i < ITEMS_TO_WIN; i++) sayCorrectly(result);

        expect(result.current.outcome).toBe('completed');
        expect(result.current.cleared).toBe(ITEMS_TO_WIN);
    });

    it('records a graded attempt with the bar it had to beat', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        const item = result.current.currentItem;
        act(() => result.current.submit(item));

        expect(result.current.lastAttempt).toMatchObject({
            expected: item,
            passed: true,
            threshold: stage.baseThreshold,
        });
        expect(result.current.lastAttempt?.score).toBe(100);
    });

    it('summarises missed words after a run', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        sayWrong(result);
        const summary = result.current.summary;
        expect(summary?.attempts).toBe(1);
        expect(summary?.missedWords.length).toBeGreaterThan(0);
    });

    it('persists the best run per stage and surfaces it on the next mount', () => {
        const first = renderHook(() => usePracticeSession());
        act(() => first.result.current.begin(stage));
        sayCorrectly(first.result);
        for (let i = 0; i < MAX_STRIKES; i++) sayWrong(first.result);

        expect(first.result.current.outcome).toBe('out-of-lives');

        const second = renderHook(() => usePracticeSession());
        expect(second.result.current.bests[stage.id]).toBe(1);
    });

    it('quitting clears the session back to stage select', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));
        act(() => result.current.quit());

        expect(result.current.stage).toBeNull();
        expect(result.current.lastAttempt).toBeNull();
    });
});

describe('attempts the recogniser could not vouch for', () => {
    /**
     * The guarantee this protects: the speech model mis-hears people, and
     * charging a life for its mistake teaches the learner to distrust every
     * piece of feedback the app gives them.
     */
    it('costs no life, clears nothing, and offers the same item again', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));
        const item = result.current.currentItem;

        act(() =>
            result.current.submit({
                text: 'noe helt annet',
                // Two seconds of speech, a fifth of a second accounted for:
                // evidence the model dropped audio, not that the learner erred.
                speech: { start: 0, end: 2, duration: 2.5 },
                words: [{ word: 'noe', start: 0.1, end: 0.3 }],
            })
        );

        expect(result.current.lastAttempt?.verdict.outcome).toBe('uncertain');
        expect(result.current.strikes).toBe(0);
        expect(result.current.cleared).toBe(0);
        expect(result.current.currentItem).toBe(item);
    });

    it('still charges for a wrong answer the recogniser did account for', () => {
        const { result } = renderHook(() => usePracticeSession());
        act(() => result.current.begin(stage));

        act(() =>
            result.current.submit({
                text: GIBBERISH,
                speech: { start: 0, end: 1.2, duration: 1.5 },
                words: [
                    { word: 'zzz', start: 0.0, end: 0.4 },
                    { word: 'qqq', start: 0.4, end: 0.8 },
                    { word: 'xxx', start: 0.8, end: 1.2 },
                ],
            })
        );

        expect(result.current.lastAttempt?.verdict.outcome).toBe('mispronounced');
        expect(result.current.strikes).toBe(1);
    });
});
