import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useExamSession } from '../useExamSession';
import type { Nivaa, Oppgave, PoolId } from '../../data/muntlig/oppgaver';

/**
 * Running a rehearsal.
 *
 * The one thing that must hold at runtime is that the microphone is never open
 * while the app is talking — everything else here is a transcript being carried
 * from A to B. So these tests record the order of speaking and listening and
 * assert on it, rather than checking that state fields have the expected names.
 */

/** A script of everything that happened, in the order it happened. */
type Event = { kind: 'sier'; text: string } | { kind: 'lytter'; maxMs: number };

function harness(nivaa: Nivaa = 'A2-B1', heard: Record<string, string> = {}) {
    const events: Event[] = [];
    /** Ends the take in flight, standing in for the recorder stopping. */
    let close: (() => void) | null = null;
    let takeIndex = 0;

    const speak = vi.fn(async (text: string) => {
        events.push({ kind: 'sier', text });
    });

    const listen = vi.fn((maxMs: number) => {
        events.push({ kind: 'lytter', maxMs });
        const transcript = heard[String(takeIndex++)] ?? 'jeg heter ola';
        return new Promise<{ transcript: string; recordingUrl: string | null }>(resolve => {
            close = () => resolve({ transcript, recordingUrl: null });
        });
    });

    const endTake = vi.fn(() => close?.());

    const pick = (_pool: PoolId, oppgaver: Oppgave[]): Oppgave => oppgaver[0];
    const rendered = renderHook(() =>
        useExamSession({ nivaa, pick, listen, endTake, speak })
    );

    return { ...rendered, events, endTake, listen, speak };
}

/** Let every pending microtask land, so a stale run has its chance to misfire. */
const settled = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });

describe('the microphone and the voice never overlap', () => {
    it('finishes every line before it opens the floor', async () => {
        const exam = harness();
        act(() => exam.result.current.begin());
        await waitFor(() => expect(exam.result.current.phase).toBe('klar'));

        // The opening is the examiner's: spoken, and then nothing is recorded.
        expect(exam.events).toEqual([
            { kind: 'sier', text: expect.stringContaining('Velkommen') },
        ]);

        act(() => exam.result.current.next());
        await waitFor(() => expect(exam.result.current.phase).toBe('lytter'));

        // The warm-up line was said in full, and only then did listening start.
        expect(exam.events.map(e => e.kind)).toEqual(['sier', 'sier', 'lytter']);
    });

    it('never listens on a segment the app cannot run', async () => {
        const exam = harness();
        act(() => exam.result.current.begin());

        // Walk the whole session through, ending each take as it opens.
        for (let step = 0; step < 20; step++) {
            await waitFor(() =>
                expect(['klar', 'lytter', 'ferdig']).toContain(exam.result.current.phase)
            );
            if (exam.result.current.phase === 'ferdig') break;
            if (exam.result.current.phase === 'lytter') {
                act(() => exam.result.current.finishTake());
                await waitFor(() => expect(exam.result.current.phase).toBe('klar'));
            }
            act(() => exam.result.current.next());
        }

        expect(exam.result.current.phase).toBe('ferdig');
        // The pair task has nobody to talk to, so it is read out and passed.
        const spoken = exam.events.filter(e => e.kind === 'sier').length;
        expect(spoken).toBeGreaterThan(exam.events.filter(e => e.kind === 'lytter').length);
        expect(exam.result.current.takes.map(t => t.segmentId)).not.toContain('b');
    });
});

describe('what comes back', () => {
    it('keeps each take against the segment it belongs to', async () => {
        const exam = harness('A2-B1', { '0': 'jeg kommer fra india', '1': 'jeg liker å gå tur' });
        act(() => exam.result.current.begin());
        await waitFor(() => expect(exam.result.current.phase).toBe('klar'));

        act(() => exam.result.current.next());
        await waitFor(() => expect(exam.result.current.phase).toBe('lytter'));
        act(() => exam.result.current.finishTake());
        await waitFor(() => expect(exam.result.current.takes).toHaveLength(1));

        expect(exam.result.current.takes[0]).toMatchObject({
            segmentId: 'oppvarming',
            transcript: 'jeg kommer fra india',
        });
        // Stage one measures nothing, so a take carries text and a clock and
        // no judgement of any kind.
        expect(Object.keys(exam.result.current.takes[0]).sort()).toEqual([
            'elapsedMs',
            'recordingUrl',
            'segmentId',
            'transcript',
        ]);
    });

    it('gives each take the published upper bound for its slot', async () => {
        const exam = harness();
        act(() => exam.result.current.begin());
        await waitFor(() => expect(exam.result.current.phase).toBe('klar'));
        act(() => exam.result.current.next());
        await waitFor(() => expect(exam.result.current.phase).toBe('lytter'));

        // The warm-up is one to two minutes, so the take may run two.
        expect(exam.listen).toHaveBeenCalledWith(120_000);
    });
});

describe('leaving', () => {
    it('stops the take and the voice, and does not advance afterwards', async () => {
        const exam = harness();
        act(() => exam.result.current.begin());
        await waitFor(() => expect(exam.result.current.phase).toBe('klar'));
        act(() => exam.result.current.next());
        await waitFor(() => expect(exam.result.current.phase).toBe('lytter'));

        act(() => exam.result.current.quit());
        expect(exam.endTake).toHaveBeenCalled();
        expect(exam.result.current.phase).toBe('ferdig');

        // The take was in flight when quit landed; it must not be recorded
        // after the fact, or a session the learner abandoned would come back
        // looking like one they finished.
        await settled();
        expect(exam.result.current.takes).toHaveLength(0);
        expect(exam.result.current.phase).toBe('ferdig');
    });
});
