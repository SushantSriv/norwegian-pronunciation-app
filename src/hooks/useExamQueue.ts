import { useCallback, useEffect, useRef, useState } from 'react';
import {
    parseQueueServerMessage,
    QUEUE_TIMEOUT_MS,
    type RoomNivaa,
} from '../utils/roomProtocol';

/**
 * Waiting for somebody to practise with.
 *
 * The room feature needs a second candidate, and the shareable link only helps
 * if you already know somebody sitting the same exam — which most people
 * preparing for this do not. This is the other half: you say which level you
 * want, and the app pairs you with the next person who says the same.
 *
 * WHAT THE QUEUE KNOWS ABOUT YOU: that a browser is waiting, and when it last
 * said so. No name, no identifier, no history. When two are paired both entries
 * are dropped and a room code is sent to each; everything after that is the
 * ordinary room, and the queue is not part of it.
 *
 * WHAT THE OTHER PERSON WILL LEARN: your IP address, because the audio connects
 * the two browsers directly and that is how a direct connection is made. True
 * of every voice call ever placed — but a different proposition with a stranger
 * than with a friend you sent a link to, so the screen says it before you join
 * rather than in a policy somewhere.
 *
 * NOBODY WAITS FOR EVER. After a few minutes it gives up and says so. A queue
 * that keeps you hoping is worse than one that tells you nobody else is here.
 */

export type QueuePhase = 'av' | 'venter' | 'fant-noen' | 'ingen-kom' | 'feilet';

export interface QueueState {
    phase: QueuePhase;
    nivaa: RoomNivaa | null;
    /** How many are waiting at this level, including you. */
    waiting: number;
    /** Milliseconds spent waiting so far. */
    elapsedMs: number;
    problem: string | null;
}

const EMPTY: QueueState = {
    phase: 'av',
    nivaa: null,
    waiting: 0,
    elapsedMs: 0,
    problem: null,
};

/** How often to tell the queue we are still here. */
const HEARTBEAT_MS = 15_000;

interface Options {
    url?: string;
    /** Called with the room code once two people have been paired. */
    onMatched: (code: string, nivaa: RoomNivaa) => void;
}

export function useExamQueue({ url = '', onMatched }: Options) {
    const [state, setState] = useState<QueueState>(EMPTY);

    const socket = useRef<WebSocket | null>(null);
    const timers = useRef<number[]>([]);
    const startedAt = useRef(0);
    const matched = useRef(onMatched);
    matched.current = onMatched;

    const stop = useCallback(() => {
        timers.current.forEach(window.clearInterval);
        timers.current.forEach(window.clearTimeout);
        timers.current = [];
        const open = socket.current;
        socket.current = null;
        try {
            open?.send(JSON.stringify({ t: 'leave' }));
        } catch {
            // Already closed; the close below is what matters.
        }
        open?.close();
    }, []);

    useEffect(() => stop, [stop]);

    const leave = useCallback(() => {
        stop();
        setState(EMPTY);
    }, [stop]);

    const join = useCallback(
        (nivaa: RoomNivaa) => {
            if (!url) return;
            stop();
            startedAt.current = Date.now();
            setState({ ...EMPTY, phase: 'venter', nivaa, waiting: 1 });

            const ws = new WebSocket(
                `${url.replace(/^http/, 'ws')}/queue?nivaa=${encodeURIComponent(nivaa)}`
            );
            socket.current = ws;

            ws.onmessage = event => {
                const message = parseQueueServerMessage(event.data);
                if (!message) return;

                if (message.t === 'matched') {
                    stop();
                    setState(current => ({ ...current, phase: 'fant-noen' }));
                    matched.current(message.code, message.nivaa);
                    return;
                }
                if (message.t === 'queue') {
                    setState(current => ({ ...current, waiting: message.waiting }));
                    return;
                }
                setState(current => ({ ...current, problem: message.reason }));
            };

            ws.onerror = () =>
                setState(current =>
                    current.phase === 'fant-noen'
                        ? current
                        : {
                              ...current,
                              phase: 'feilet',
                              problem: 'Fikk ikke kontakt med køen. Er du på nett?',
                          }
                );

            ws.onclose = () =>
                setState(current =>
                    // A match closes the socket on purpose; that is not a failure.
                    current.phase === 'fant-noen' || current.phase === 'ingen-kom'
                        ? current
                        : { ...current, phase: 'feilet', problem: 'Køen lukket seg.' }
                );

            timers.current.push(
                window.setInterval(() => {
                    try {
                        ws.send(JSON.stringify({ t: 'wait' }));
                    } catch {
                        // The close handler will report it.
                    }
                    setState(current => ({
                        ...current,
                        elapsedMs: Date.now() - startedAt.current,
                    }));
                }, HEARTBEAT_MS),
                window.setInterval(
                    () =>
                        setState(current => ({
                            ...current,
                            elapsedMs: Date.now() - startedAt.current,
                        })),
                    1000
                ),
                window.setTimeout(() => {
                    stop();
                    setState(current =>
                        current.phase === 'fant-noen'
                            ? current
                            : { ...current, phase: 'ingen-kom', problem: null }
                    );
                }, QUEUE_TIMEOUT_MS)
            );
        },
        [url, stop]
    );

    return { available: Boolean(url), state, join, leave };
}
