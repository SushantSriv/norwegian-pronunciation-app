import { useCallback, useEffect, useRef, useState } from 'react';
import {
    normaliseCode,
    parseServerMessage,
    validCode,
    type ClientMessage,
    type RoomNivaa,
    type Seat,
    type ServerMessage,
} from '../utils/roomProtocol';

/**
 * Two candidates, two devices, one conversation.
 *
 * The exam has a second candidate and the app cannot supply one — but two
 * people who both have the app can supply each other. This connects them: a
 * room code goes over the Durable Object, the two browsers exchange WebRTC
 * offers through it, and from then on the audio goes straight from one to the
 * other. The server never carries a voice.
 *
 * WHY THIS IS BETTER THAN TWO PEOPLE AT ONE PHONE, which was the other way of
 * doing it: each microphone hears one candidate. That makes attribution real
 * rather than something you tap, so who said what is simply true, and each
 * person's transcript stays on their own device.
 *
 * WHAT IT CANNOT PROMISE. A direct connection is not always possible: some
 * networks — a lot of workplace and mobile-carrier ones — will only let two
 * browsers talk through a relay, and a relay costs money to run, so there is
 * not one here. When that happens the connection fails, VISIBLY, and the pair
 * is told to try another network rather than being left with a silent room.
 *
 * WHAT THE OTHER PERSON LEARNS ABOUT YOU. A direct connection is made by each
 * browser telling the other how to reach it, so your IP address is visible to
 * whoever you are practising with. That is how WebRTC works everywhere, it is
 * not something this app added, and it is why the joining screen says to send
 * the code to somebody you meant to practise with.
 */

export type RoomPhase =
    | 'av'
    | 'kobler-til'
    | 'venter-på-partner'
    | 'kobler-lyd'
    | 'tilkoblet'
    | 'feilet';

export interface RoomState {
    phase: RoomPhase;
    code: string | null;
    seat: Seat | null;
    /** Shared with the partner, so both draw the same tasks. */
    seed: number | null;
    /** The room's level, which belongs to the room and not to either person. */
    nivaa: RoomNivaa | null;
    /** Which segment the pair has agreed they are on. */
    index: number;
    /** Speaking milliseconds per seat, as each device reported about itself. */
    spoke: Record<string, number>;
    /** Why it failed, when it did. */
    problem: string | null;
}

/**
 * Public STUN only.
 *
 * STUN just tells a browser what its own address looks like from outside, and
 * costs nothing to use. TURN — relaying the audio when a direct path cannot be
 * found — is the expensive one, and running it is not free, so this app does
 * not pretend to have it.
 */
/** Nothing may sit on "connecting" for ever; this is when it gives up. */
const CONNECT_TIMEOUT_MS = 25_000;

/** How long to wait for the room worker before calling it unreachable. */
const FETCH_TIMEOUT_MS = 10_000;

const ICE: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
];

interface Options {
    /** Where the room worker lives. Empty disables the feature entirely. */
    url?: string;
    /** The partner's audio, once there is any. */
    onRemoteStream?: (stream: MediaStream) => void;
}

const EMPTY: RoomState = {
    phase: 'av',
    code: null,
    seat: null,
    seed: null,
    nivaa: null,
    index: 0,
    spoke: {},
    problem: null,
};

export function useExamRoom({ url = '', onRemoteStream }: Options = {}) {
    const [state, setState] = useState<RoomState>(EMPTY);

    const socket = useRef<WebSocket | null>(null);
    const peer = useRef<RTCPeerConnection | null>(null);
    const local = useRef<MediaStream | null>(null);
    /** Fails the whole attempt if the connection never comes up. */
    const deadline = useRef<number | null>(null);
    const seat = useRef<Seat | null>(null);
    const remoteHandler = useRef(onRemoteStream);
    remoteHandler.current = onRemoteStream;

    const available = Boolean(url);

    const send = useCallback((message: ClientMessage) => {
        if (socket.current?.readyState === WebSocket.OPEN) {
            socket.current.send(JSON.stringify(message));
        }
    }, []);

    /**
     * Ask for the microphone NOW, while a tap is still in hand.
     *
     * On iOS — which is every browser on an iPhone or iPad, Chrome included,
     * because Apple requires them all to use WebKit — getUserMedia has to be
     * reached from a user gesture. It used to be called when the partner
     * arrived, from a WebSocket message handler, which is not a gesture: on
     * iOS that call does not reject, it simply never settles, and the screen
     * sat on "Kobler lyden ..." for ever.
     *
     * Called from the lobby buttons, so by the time a partner turns up the
     * stream is already held. Safe to call more than once.
     */
    const prepareMicrophone = useCallback(async (): Promise<boolean> => {
        if (local.current) return true;
        try {
            local.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    // Without these, each candidate hears themselves back
                    // through the other's speaker half a second late, which is
                    // the single most disorienting thing a call can do.
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            return true;
        } catch {
            setState(current => ({
                ...current,
                phase: 'feilet',
                problem: 'Mikrofonen ble ikke sluppet til, so partneren din kan ikke hore deg.',
            }));
            return false;
        }
    }, []);

    const teardown = useCallback(() => {
        if (deadline.current !== null) window.clearTimeout(deadline.current);
        deadline.current = null;
        peer.current?.close();
        peer.current = null;
        local.current?.getTracks().forEach(track => track.stop());
        local.current = null;
        socket.current?.close();
        socket.current = null;
        seat.current = null;
    }, []);

    useEffect(() => teardown, [teardown]);

    const leave = useCallback(() => {
        teardown();
        setState(EMPTY);
    }, [teardown]);

    /**
     * Open the peer connection.
     *
     * Seat A offers and seat B answers. Deciding that by seat rather than by
     * who got there first means both sides know their role without negotiating
     * it, and two simultaneous offers — glare, which is genuinely fiddly to
     * recover from — cannot happen.
     */
    const connectAudio = useCallback(async () => {
        if (peer.current) return;
        setState(current => ({ ...current, phase: 'kobler-lyd' }));

        // Normally already held from the lobby tap. This is the fallback for
        // a browser that grants it without one.
        if (!(await prepareMicrophone())) return;
        const stream = local.current;
        if (!stream) return;

        // Nothing may sit on "Kobler lyden" for ever. A connection that has not
        // come up by now is one that is not going to.
        deadline.current = window.setTimeout(() => {
            setState(current =>
                current.phase === 'tilkoblet'
                    ? current
                    : {
                          ...current,
                          phase: 'feilet',
                          problem:
                              'Fikk ikke apnet lyden mellom dere i tide. Det skjer pa en del bedrifts- og mobilnett, og pa nett som blokkerer direkte forbindelser. Prov et annet nett - helst begge pa vanlig wifi.',
                      }
            );
        }, CONNECT_TIMEOUT_MS);

        const connection = new RTCPeerConnection({ iceServers: ICE });
        peer.current = connection;

        stream.getTracks().forEach(track => connection.addTrack(track, stream));

        connection.ontrack = event => {
            const [remote] = event.streams;
            if (remote) remoteHandler.current?.(remote);
        };

        connection.onicecandidate = event => {
            if (event.candidate) {
                send({ t: 'signal', payload: JSON.stringify({ ice: event.candidate }) });
            }
        };

        /**
         * Up, or not up — read from BOTH state machines.
         *
         * `connectionState` is the modern one, and the only one this used to
         * watch. Safari did not implement it until late, and on an iPhone every
         * browser IS Safari — Apple requires it — so on those devices the event
         * never fired and the screen stayed on "Kobler lyden" even when the
         * audio was flowing perfectly. `iceConnectionState` has been there from
         * the beginning and is what those browsers actually report.
         */
        const settled = () => {
            const ice = connection.iceConnectionState;
            const overall = connection.connectionState;

            if (overall === 'connected' || ice === 'connected' || ice === 'completed') {
                if (deadline.current !== null) window.clearTimeout(deadline.current);
                deadline.current = null;
                setState(current => ({ ...current, phase: 'tilkoblet', problem: null }));
                return;
            }
            if (overall === 'failed' || ice === 'failed') {
                setState(current => ({
                    ...current,
                    phase: 'feilet',
                    problem:
                        'Nettleserne fant ingen direkte vei til hverandre. Det skjer på en del bedrifts- og mobilnett. Prøv et annet nett — for eksempel begge på vanlig wifi.',
                }));
            }
        };

        connection.onconnectionstatechange = settled;
        connection.oniceconnectionstatechange = settled;

        if (seat.current === 'a') {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            send({ t: 'signal', payload: JSON.stringify({ sdp: connection.localDescription }) });
        }
    }, [send, prepareMicrophone]);

    const onSignal = useCallback(
        async (payload: string) => {
            const connection = peer.current;
            if (!connection) return;

            let parsed: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
            try {
                parsed = JSON.parse(payload);
            } catch {
                // A blob we cannot read is a peer we cannot talk to; dropping
                // it is better than throwing inside a socket handler.
                return;
            }

            if (parsed.sdp) {
                await connection.setRemoteDescription(parsed.sdp);
                if (parsed.sdp.type === 'offer') {
                    const answer = await connection.createAnswer();
                    await connection.setLocalDescription(answer);
                    send({
                        t: 'signal',
                        payload: JSON.stringify({ sdp: connection.localDescription }),
                    });
                }
            } else if (parsed.ice) {
                try {
                    await connection.addIceCandidate(parsed.ice);
                } catch {
                    // A candidate arriving before the description is normal.
                }
            }
        },
        [send]
    );

    const handle = useCallback(
        (message: ServerMessage) => {
            switch (message.t) {
                case 'joined':
                    seat.current = message.seat;
                    setState(current => ({
                        ...current,
                        seat: message.seat,
                        seed: message.seed,
                        nivaa: message.nivaa,
                        code: message.code,
                        phase: 'venter-på-partner',
                    }));
                    return;

                case 'room':
                    if (message.seats.length === 2) void connectAudio();
                    else
                        setState(current =>
                            current.phase === 'tilkoblet' || current.phase === 'kobler-lyd'
                                ? {
                                      ...current,
                                      phase: 'venter-på-partner',
                                      problem: 'Partneren din forlot rommet.',
                                  }
                                : current
                        );
                    return;

                case 'signal':
                    void onSignal(message.payload);
                    return;

                case 'advance':
                    setState(current => ({ ...current, index: message.index }));
                    return;

                case 'spoke':
                    setState(current => ({ ...current, spoke: message.ms }));
                    return;

                case 'error':
                    setState(current => ({ ...current, problem: message.reason }));
                    return;
            }
        },
        [connectAudio, onSignal]
    );

    const join = useCallback(
        (raw: string, nivaa?: RoomNivaa) => {
            const code = normaliseCode(raw);
            if (!available || !validCode(code)) {
                setState({
                    ...EMPTY,
                    phase: 'feilet',
                    problem: 'Romkoden er på seks tegn. Sjekk at du har fått hele.',
                });
                return;
            }

            teardown();
            setState({ ...EMPTY, phase: 'kobler-til', code });

            // The level is a request, not an instruction: the room keeps
            // whatever the first arrival asked for, so a joiner who picked
            // differently is told the room's level rather than splitting the
            // pair across two different exams.
            const query = nivaa ? `&nivaa=${encodeURIComponent(nivaa)}` : '';
            const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/room?code=${code}${query}`);
            socket.current = ws;

            ws.onmessage = event => {
                const parsed = parseServerMessage(event.data);
                if (parsed) handle(parsed);
            };
            ws.onerror = () =>
                setState(current => ({
                    ...current,
                    phase: 'feilet',
                    problem: 'Fikk ikke kontakt med rommet. Er du på nett?',
                }));
            ws.onclose = () =>
                setState(current =>
                    current.phase === 'feilet'
                        ? current
                        : { ...current, phase: 'feilet', problem: 'Rommet lukket seg.' }
                );
        },
        [available, url, teardown, handle]
    );

    /** Ask the worker for a code nobody is using. */
    /**
     * Ask the worker for a code nobody is using.
     *
     * The failure message used to be "Fikk ikke laget et rom. Er du på nett?"
     * for every possible cause, which is useless to the person reading it and
     * worse than useless to whoever they report it to: a blocked request, a
     * refused origin and a worker that is down all looked identical. It now
     * says which of those happened.
     */
    const create = useCallback(
        async (nivaa: RoomNivaa): Promise<string | null> => {
            if (!available) return null;

            const fail = (problem: string) => {
                setState({ ...EMPTY, phase: 'feilet', problem });
                return null;
            };

            // A request that never answers must not leave the button dead.
            const abort = new AbortController();
            const timer = window.setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);

            try {
                const response = await fetch(`${url}/room/new`, { signal: abort.signal });
                if (!response.ok) {
                    return fail(
                        `Rom-tjenesten svarte ${response.status}. Det er ikke noe galt med nettet ditt — prøv igjen om litt.`
                    );
                }
                const body: unknown = await response.json();
                const code =
                    typeof body === 'object' && body !== null && 'code' in body
                        ? String((body as { code: unknown }).code)
                        : '';
                if (!validCode(code)) {
                    return fail('Rom-tjenesten svarte noe uventet. Prøv igjen om litt.');
                }
                join(code, nivaa);
                return code;
            } catch (cause) {
                const aborted = cause instanceof DOMException && cause.name === 'AbortError';
                return fail(
                    aborted
                        ? 'Rom-tjenesten svarte ikke i tide. Er du på et nett som blokkerer?'
                        : 'Nådde ikke rom-tjenesten i det hele tatt. Det skjer hvis nettet er nede, eller hvis en annonseblokker eller et bedriftsnett stopper forespørselen.'
                );
            } finally {
                window.clearTimeout(timer);
            }
        },
        [available, url, join]
    );

    return {
        available,
        state,
        create,
        join,
        leave,
        prepareMicrophone,
        /**
         * Open or close this candidate's outgoing microphone.
         *
         * On a task the pair takes one at a time only one of them is meant to
         * be heard, and both devices read the examiner's lines aloud — so a
         * track that is open all session sends the partner a second copy of
         * the examiner on top of their own, and the room around whoever is not
         * speaking on top of whoever is.
         *
         * `enabled = false` sends silence rather than closing anything: the
         * connection stays up, nothing is renegotiated, and the floor coming
         * back is a boolean rather than a reconnection. It touches ONLY what
         * leaves this device — the microphone this device records from, and
         * therefore the transcript, is untouched.
         */
        setOutgoing: useCallback((open: boolean) => {
            local.current?.getAudioTracks().forEach(track => {
                track.enabled = open;
            });
        }, []),
        advance: useCallback((index: number) => send({ t: 'advance', index }), [send]),
        reportSpoken: useCallback((ms: number) => send({ t: 'spoke', ms: Math.round(ms) }), [send]),
        setReady: useCallback((ready: boolean) => send({ t: 'ready', ready }), [send]),
    };
}
