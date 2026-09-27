import { useCallback, useEffect, useRef, useState } from 'react';
import { buildTimeline, type Segment } from '../utils/examTimeline';
import { speakNorwegian, stopSpeaking } from '../utils/audioPlayback';
import type { Nivaa, Oppgave, PoolId } from '../data/muntlig/oppgaver';
import type { Seat } from '../utils/roomProtocol';

/**
 * Running one rehearsal.
 *
 * The exam is a sequence of turns, and the whole hook exists to keep exactly
 * one of them live at a time: the examiner speaks, then the candidate does,
 * then the clock stops them. Nothing here measures anything — that is stage 2 —
 * so there is no way for this to overclaim. What it produces is the transcript
 * of each take and how long it ran.
 *
 * HALF-DUPLEX, on purpose and in one place. The app never listens while it is
 * speaking. A real examiner can interrupt you; this cannot, and the intro
 * screen says so once rather than the mode pretending otherwise.
 */

export type Phase = 'klar' | 'snakker' | 'forbereder' | 'lytter' | 'venter' | 'ferdig';

/**
 * How long the app waits after the examiner stops before opening the mic.
 *
 * THIS IS THE APP'S PAUSE, NOT THE EXAM'S, and every screen that shows it says
 * so. HK-dir publishes no preparation time for these tasks — the only one in
 * the whole exam is before the B1-B2 påstand, and no number is published for
 * that either. What this is for is smaller and real: a recogniser that starts
 * the instant a synthetic voice stops will catch the room noise of somebody
 * drawing breath, and a candidate who has just heard a question needs a moment
 * to have an answer. It can always be skipped.
 */
export const PREP_MS = 5_000;

/**
 * How long to wait for one spoken line before giving up on it.
 *
 * speechSynthesis is not reliable about `onend`. A voice that is still loading,
 * a tab that was backgrounded mid-utterance, or an engine that simply drops the
 * event all leave the promise pending — and the session then sits on
 * "Eksaminator snakker" for ever, with no control on screen because it is not
 * the candidate's turn. Generous, because cutting a real line short is worse
 * than waiting: roughly twice the time the line would take at speaking pace,
 * plus a fixed allowance for the voice to start.
 */
const speechDeadline = (line: string) => 3_000 + line.length * 120;

export interface Take {
    segmentId: string;
    /** What the browser's speech service made of it. */
    transcript: string;
    /** Wall-clock milliseconds from the floor opening to the take ending. */
    elapsedMs: number;
    /** The recording, for listening back. Owned by the caller. */
    recordingUrl: string | null;
}

interface Options {
    nivaa: Nivaa;
    pairPresent?: boolean;
    /**
     * Which chair this device is in, when there is a partner in the other one.
     *
     * Passed straight through to the timeline, which is the only thing that
     * decides whose turn it is. Nothing here works out a floor of its own: on
     * a task the pair takes one at a time, this device runs the partner's turn
     * exactly the way it runs a task it cannot record — the lines are read and
     * the microphone stays shut.
     */
    seat?: Seat;
    /** Injected so a test is not at the mercy of a shuffle. */
    pick?: (pool: PoolId, oppgaver: Oppgave[]) => Oppgave;
    /** Start a take. Resolves with what was heard when the take ends. */
    listen: (maxMs: number) => Promise<{ transcript: string; recordingUrl: string | null }>;
    /** Stop the current take early, because the candidate said they were done. */
    endTake: () => void;
    /** Speak, and resolve when finished. Injected so tests need no voices. */
    speak?: (text: string) => Promise<void>;
}

export function useExamSession({
    nivaa,
    pairPresent = false,
    seat,
    pick,
    listen,
    endTake,
    speak = speakNorwegian,
}: Options) {
    const [timeline] = useState<Segment[]>(() => buildTimeline({ nivaa, pick, pairPresent, seat }));
    const [index, setIndex] = useState(0);
    const [phase, setPhase] = useState<Phase>('klar');
    const [takes, setTakes] = useState<Take[]>([]);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    /** What the service has heard so far in the take in flight. */
    const [live, setLive] = useState('');
    /**
     * What starts a segment running. Zero until the session begins.
     *
     * Deliberately NOT the phase. The runner's first act is to set the phase to
     * 'snakker', so an effect keyed on the phase would tear itself down one
     * line into the opening and the session would stall there.
     */
    const [nonce, setNonce] = useState(0);

    // Kept in refs so the runner is not re-created mid-segment, which would
    // restart a take the candidate is halfway through.
    const listenRef = useRef(listen);
    listenRef.current = listen;
    const speakRef = useRef(speak);
    speakRef.current = speak;
    /** Bumped on quit, so a segment still in flight does not advance after it. */
    const runId = useRef(0);
    /** Ends the preparation pause early, when the candidate says they are ready. */
    const skipPrep = useRef<(() => void) | null>(null);

    const segment = timeline[index] ?? null;
    const done = index >= timeline.length;

    const begin = useCallback(() => {
        runId.current += 1;
        setTakes([]);
        setIndex(0);
        setLive('');
        setStartedAt(Date.now());
        setPhase('venter');
        setNonce(n => n + 1);
    }, []);

    const quit = useCallback(() => {
        runId.current += 1;
        stopSpeaking();
        skipPrep.current?.();
        endTake();
        setPhase('ferdig');
    }, [endTake]);

    /**
     * Run one segment: say the lines, then open the floor if it is the
     * candidate's, then move on.
     */
    useEffect(() => {
        if (nonce === 0) return;
        if (!segment) {
            setPhase('ferdig');
            return;
        }
        const mine = ++runId.current;
        let cancelled = false;

        const run = async () => {
            setPhase('snakker');
            for (const line of segment.says) {
                if (cancelled || runId.current !== mine) return;
                // Whichever comes first: the voice finishing, or the deadline.
                // A line that never reports finishing must not strand the run.
                await Promise.race([
                    speakRef.current(line),
                    new Promise<void>(resolve => {
                        window.setTimeout(resolve, speechDeadline(line));
                    }),
                ]);
            }
            if (cancelled || runId.current !== mine) return;

            // A segment the app cannot run, or one where nobody speaks, is
            // read out and then simply passed.
            if (!segment.runnable || segment.floor !== 'deg') {
                setPhase('klar');
                return;
            }

            // A beat between the examiner finishing and the microphone
            // opening. Skippable, and never presented as the exam's doing.
            setPhase('forbereder');
            await new Promise<void>(resolve => {
                const timer = window.setTimeout(resolve, PREP_MS);
                skipPrep.current = () => {
                    window.clearTimeout(timer);
                    resolve();
                };
            });
            skipPrep.current = null;
            if (cancelled || runId.current !== mine) return;

            setPhase('lytter');
            setLive('');
            const openedAt = Date.now();
            const result = await listenRef.current(segment.maxMs ?? 180_000);
            if (cancelled || runId.current !== mine) return;

            setTakes(previous => [
                ...previous,
                {
                    segmentId: segment.id,
                    transcript: result.transcript,
                    elapsedMs: Date.now() - openedAt,
                    recordingUrl: result.recordingUrl,
                },
            ]);
            setPhase('klar');
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [nonce, segment]);

    /** Move to the next segment. The candidate presses this, or the clock does. */
    const next = useCallback(() => {
        setLive('');
        setPhase('venter');
        setIndex(current => current + 1);
        setNonce(n => n + 1);
    }, []);

    /** "Jeg er ferdig" — end the take without waiting for the upper bound. */
    const finishTake = useCallback(() => {
        if (phase !== 'lytter') return;
        endTake();
    }, [phase, endTake]);

    /** "Jeg er klar" — stop waiting and open the microphone now. */
    const startNow = useCallback(() => skipPrep.current?.(), []);

    return {
        timeline,
        segment,
        index,
        phase,
        takes,
        live,
        setLive,
        done,
        startedAt,
        elapsedMs: startedAt === null ? 0 : Date.now() - startedAt,
        begin,
        next,
        finishTake,
        startNow,
        quit,
    };
}
