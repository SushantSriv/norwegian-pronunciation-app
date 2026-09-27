import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { SessionMap } from './SessionMap';
import { Oppsummering } from './Oppsummering';
import { Rommet, type Who } from './Rommet';
import { Parrom } from './Parrom';
import { useExamRoom } from '../../hooks/useExamRoom';
import { useExamQueue } from '../../hooks/useExamQueue';
import { seededPick, type RoomNivaa } from '../../utils/roomProtocol';
import type { PickOppgave } from '../../utils/examTimeline';
import { useExamSession } from '../../hooks/useExamSession';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { PREP_MS } from '../../hooks/useExamSession';
import { examProfile, PHRASE, recognitionSupported, type ListenProfile } from '../../utils/speech';
import { TOTAL_MS } from '../../utils/examTimeline';
import { decodeMono } from '../../utils/audioFrames';
import { pausesFrom, type PauseProfile } from '../../utils/pauses';
import { APP_SIER } from '../../data/muntlig/eksaminator';
import type { Nivaa } from '../../data/muntlig/oppgaver';

/**
 * Prøverommet — øving på delprøven i muntlig kommunikasjon.
 *
 * Trinn 1 måler ingenting, og det er poenget snarere enn en begrensning. Å bli
 * stoppet etter tre minutter, høre «Du kan begynne» på norsk, og oppdage at
 * oppvarmingen ikke teller, er det meste av det en generalprøve er til for — og
 * ingenting av det krever at appen dømmer noe. Derfor finnes det heller
 * ingenting her som kan overdrive.
 *
 * Det du får tilbake er det taletjenesten hørte, per oppgave. Det prøven
 * faktisk vurderer — flyt, uttale, ordforråd, grammatikk — måles ikke her, og
 * skjermen sier det med de ordene i stedet for å la fraværet gjettes.
 */

interface Props {
    onBack: () => void;
}

const NIVAAER: { id: Nivaa; blurb: string }[] = [
    { id: 'A1-A2', blurb: 'Fire oppgaver. Her teller det å fortelle om deg selv.' },
    { id: 'A2-B1', blurb: 'Tre oppgaver. Oppvarmingen teller ikke.' },
    { id: 'B1-B2', blurb: 'Tre oppgaver. Til slutt en påstand du skal ta stilling til.' },
];

const clock = (ms: number) => {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Empty disables the pair feature entirely, the way the leaderboard works. */
const ROOM_URL = (import.meta.env.VITE_ROOM_URL as string | undefined) ?? '';

export function MuntligScreen({ onBack }: Props) {
    const [nivaa, setNivaa] = useState<Nivaa | null>(null);

    /**
     * The partner's voice.
     *
     * An audio element rather than the Web Audio graph: nothing is measured
     * about what they say — that is their device's job, and their transcript —
     * so it only has to be audible.
     *
     * THE STREAM IS HELD AS WELL AS ATTACHED. It arrives once, when the
     * connection opens, and it used to be attached to whichever element existed
     * at that moment. Choosing a level swaps the lobby's element for the
     * session's, and the new one had no stream — so the partner went silent at
     * exactly the moment the exam started. Keeping it lets any element that
     * mounts pick it up.
     */
    const partnerStream = useRef<MediaStream | null>(null);
    const partnerEl = useRef<HTMLAudioElement | null>(null);
    /** Set when the browser refused to start the audio without a tap. */
    const [needsTap, setNeedsTap] = useState(false);

    const attachPartner = useCallback((element: HTMLAudioElement | null) => {
        partnerEl.current = element;
        if (!element || !partnerStream.current) return;
        element.srcObject = partnerStream.current;
        // `autoplay` is not enough on iOS: an element whose stream arrives
        // after it was created stays silent, and nothing says so. Asking
        // explicitly turns that silence into either sound or a rejection we
        // can put a button on.
        void element.play().then(
            () => setNeedsTap(false),
            () => setNeedsTap(true)
        );
    }, []);

    /** The tap that iOS wants before it will play somebody else's voice. */
    const playPartner = useCallback(() => {
        const element = partnerEl.current;
        if (!element) return;
        void element.play().then(
            () => setNeedsTap(false),
            () => setNeedsTap(true)
        );
    }, []);

    const room = useExamRoom({
        url: ROOM_URL,
        onRemoteStream: useCallback(
            (stream: MediaStream) => {
                partnerStream.current = stream;
                // The element is already mounted; re-attaching also triggers
                // the explicit play() above.
                attachPartner(partnerEl.current);
            },
            [attachPartner]
        ),
    });

    const queue = useExamQueue({
        url: ROOM_URL,
        // Both halves of a match are handed the same code at the same moment,
        // and joining it is the ordinary room path from there on.
        onMatched: useCallback((code: string, level: RoomNivaa) => room.join(code, level), [room]),
    });

    /**
     * A room link opens straight into the lobby, already joining.
     *
     * NOT guarded by a "have I done this" ref, which is the obvious way to
     * write it and is wrong. Mounting this screen twice — which React does on
     * every development mount, and which a real remount does too — runs the
     * hook's cleanup in between and closes the socket. A ref would remember
     * that it had already joined and leave the second mount holding a socket
     * that had just been torn down. Joining again is cheap and idempotent:
     * `join` closes whatever it had before opening the new one.
     */
    const joinRoom = useRef(room.join);
    joinRoom.current = room.join;
    useEffect(() => {
        const code = new URLSearchParams(window.location.search).get('rom');
        if (ROOM_URL && code) joinRoom.current(code);
    }, []);

    // Once the pair is connected the room decides the level, because the two
    // of them have to sit the same exam.
    const connected = room.state.phase === 'tilkoblet';
    useEffect(() => {
        if (connected && room.state.nivaa) setNivaa(room.state.nivaa);
    }, [connected, room.state.nivaa]);

    /**
     * One audio element for the whole screen.
     *
     * Rendered once, outside every branch, so that moving from the lobby into
     * the session does not swap it for a fresh one with no stream attached.
     */
    const partnerLyd = (
        <audio
            id="partner-lyd"
            ref={attachPartner}
            autoPlay
            playsInline
            className="hidden"
        />
    );

    if (!recognitionSupported()) {
        return (
            <Shell onBack={onBack}>
                <p className="text-sm leading-relaxed text-white/65">
                    Denne nettleseren har ingen taletjeneste, så prøverommet kan ikke kjøre her.
                    Chrome, Edge og Safari har en. Firefox har det ikke.
                </p>
            </Shell>
        );
    }

    if (!nivaa) {
        return (
            <Shell onBack={onBack}>
                {partnerLyd}
                <p className="text-sm leading-relaxed text-white/65">
                    Samme oppgaver, samme rekkefølge, samme klokke som på delprøven i muntlig
                    kommunikasjon. Eksaminatoren leser replikkene sine høyt, og du blir stoppet når
                    tiden er ute.
                </p>

                <div className="mt-5 space-y-2">
                    {NIVAAER.map(level => (
                        <button
                            key={level.id}
                            onClick={() => setNivaa(level.id)}
                            className="w-full rounded-xl border border-white/12 bg-white/[0.04] p-4 text-left transition hover:border-white/30 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                        >
                            <span className="block text-base font-bold text-white">{level.id}</span>
                            <span className="block text-sm text-white/55">{level.blurb}</span>
                        </button>
                    ))}
                </div>

                {room.available && (
                    <Parrom
                        state={room.state}
                        queue={queue.state}
                        needsTap={needsTap}
                        onPlayPartner={playPartner}
                        /*
                          Every one of these asks for the microphone first, and
                          from inside the tap. On iOS a getUserMedia call that
                          is not reached from a user gesture never settles at
                          all, which is what used to freeze the screen on
                          "Kobler lyden" once a partner arrived.
                        */
                        onCreate={level => {
                            void room.prepareMicrophone().then(() => room.create(level));
                        }}
                        onJoin={(code, level) => {
                            void room.prepareMicrophone().then(() => room.join(code, level));
                        }}
                        onQueue={level => {
                            void room.prepareMicrophone().then(ok => {
                                if (ok) queue.join(level);
                            });
                        }}
                        onLeaveQueue={queue.leave}
                        onLeave={room.leave}
                    />
                )}

                <div className="mt-5 space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[12px] leading-relaxed text-white/45">
                    <p>{APP_SIER.ikkeEkteOppgaver}</p>
                    <p>{APP_SIER.halvDupleks}</p>
                    {!room.available && <p>{APP_SIER.ingenPartner}</p>}
                    <p className="text-white/35">{APP_SIER.ikkeHkdir}</p>
                </div>

            </Shell>
        );
    }

    // Keyed on the level so a fresh session — and a fresh timeline — is built,
    // rather than the first pick being frozen in for the whole visit.
    return (
        <>
            {partnerLyd}
            <ExamRunner
                key={nivaa}
                nivaa={nivaa}
                room={connected ? room : null}
                onBack={onBack}
                onRestart={() => {
                    room.leave();
                    setNivaa(null);
                }}
            />
        </>
    );
}

type Room = ReturnType<typeof useExamRoom>;

interface RunnerProps {
    nivaa: Nivaa;
    /** The shared room, when there is a partner in it. */
    room: Room | null;
    onBack: () => void;
    onRestart: () => void;
}

function ExamRunner({ nivaa, room, onBack, onRestart }: RunnerProps) {
    const [profile, setProfile] = useState<ListenProfile>(PHRASE);
    /** Bumped when a take is waiting for the microphone. Carries no value. */
    const [armed, setArmed] = useState(0);
    const [, tick] = useState(0);

    /** Resolves the take in flight, so the session can await the microphone. */
    const pending = useRef<((result: { transcript: string; recordingUrl: string | null }) => void) | null>(
        null
    );
    const recordingRef = useRef<string | null>(null);

    const settle = useCallback((transcript: string, recordingUrl: string | null) => {
        const resolve = pending.current;
        pending.current = null;
        resolve?.({ transcript, recordingUrl });
    }, []);

    const onResult = useCallback(
        (recognition: { text: string }) => settle(recognition.text, recordingRef.current),
        [settle]
    );

    /**
     * This session owns its recordings.
     *
     * By default the hook keeps one at a time and revokes the previous URL when
     * a new take lands, which is right for practice. A rehearsal lists every
     * answer and offers to play each one back, so with the default every player
     * but the last pointed at a URL that had already been revoked — and said
     * ERR_FILE_NOT_FOUND when pressed. They are released together below.
     */
    const voice = useVoiceInput({ onResult, profile, ownRecordings: true });

    /** Every object URL this session has been handed, for releasing at the end. */
    const owned = useRef<string[]>([]);
    useEffect(() => {
        const urls = owned.current;
        return () => urls.forEach(url => URL.revokeObjectURL(url));
    }, []);
    recordingRef.current = voice.recordingUrl;

    if (voice.recordingUrl && !owned.current.includes(voice.recordingUrl)) {
        owned.current.push(voice.recordingUrl);
    }

    const voiceRef = useRef(voice);
    voiceRef.current = voice;

    const listen = useCallback((maxMs: number) => {
        // The profile and the arming counter land in the same render, so by the
        // time the effect below runs the hook is already on the exam clock
        // rather than the phrase clock.
        setProfile(examProfile(maxMs));
        setArmed(n => n + 1);
        return new Promise<{ transcript: string; recordingUrl: string | null }>(resolve => {
            pending.current = resolve;
        });
    }, []);

    useEffect(() => {
        if (!armed) return;
        void voiceRef.current.start();
    }, [armed]);

    /**
     * A take that never produced a transcript still has to end.
     *
     * The microphone can be refused, and a take can go by with nothing audible.
     * In both cases `useVoiceInput` reports an error instead of a result, so
     * without this the session would sit on 'lytter' forever with no way out.
     */
    useEffect(() => {
        if (voice.error) settle('', null);
    }, [voice.error, settle]);

    const endTake = voice.stop;

    /**
     * Both candidates draw the same prompts.
     *
     * `buildTimeline` asks for one prompt per pool in a fixed order, so the
     * room's shared seed walks the same sequence on both devices. Without it
     * the pair would be two people answering different questions at each other
     * in the task whose whole point is that they answer the same one.
     */
    const seed = room?.state.seed ?? null;
    const pick = useMemo<PickOppgave | undefined>(() => {
        if (seed === null) return undefined;
        const draw = seededPick(seed);
        return (_pool, oppgaver) => draw(oppgaver);
    }, [seed]);

    const session = useExamSession({
        nivaa,
        pick,
        pairPresent: room !== null,
        // Which chair this device is in. The timeline is the only thing that
        // decides whose turn it is, so the seat goes in there rather than
        // being second-guessed on screen: both devices build the same
        // segments, and the floor is the one field that differs between them.
        seat: room?.state.seat ?? undefined,
        listen,
        endTake,
    });
    const { begin, phase } = session;

    /**
     * Keep the pair on the same task.
     *
     * Either candidate may move the session on and the room keeps the furthest,
     * so a partner who is still reading catches up rather than being left
     * behind on a task nobody is answering any more.
     */
    const roomIndex = room?.state.index ?? 0;
    const localIndex = session.index;
    const advance = room?.advance;
    useEffect(() => {
        if (roomIndex <= localIndex) return;
        // Being moved on while still answering must not throw the answer away.
        // At the real exam the examiner moves the pair on and what you managed
        // to say still counts, so end the take first: it lands, the phase
        // becomes 'klar', and this effect runs again and steps forward.
        if (phase === 'lytter') session.finishTake();
        else session.next();
    }, [roomIndex, localIndex, phase, session]);

    const step = useCallback(() => {
        session.next();
        advance?.(localIndex + 1);
    }, [session, advance, localIndex]);

    useEffect(() => {
        begin();
    }, [begin]);

    // The clock is read from Date.now() at render time, so it needs a pulse.
    useEffect(() => {
        if (phase === 'ferdig') return;
        const timer = window.setInterval(() => tick(n => n + 1), 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    /**
     * Measure each take as it finishes, not all of them at the end.
     *
     * `useVoiceInput` revokes the previous object URL the moment a new
     * recording lands, so at the end of a session only the last take's audio
     * still exists. Measuring here, in the gap before the examiner's next
     * line, is both the only moment the audio is there and the only moment the
     * work is free.
     *
     * Pauses only — never the pitch contour. Running F0 over a three-minute
     * answer would cost seconds to produce a number this mode has no business
     * reporting.
     */
    const [profiles, setProfiles] = useState<Record<string, PauseProfile | null>>({});
    const measured = useRef(new Set<string>());
    const { takes } = session;

    useEffect(() => {
        const last = takes.at(-1);
        if (!last || measured.current.has(last.segmentId)) return;
        measured.current.add(last.segmentId);

        const url = last.recordingUrl;
        if (!url) {
            // No audio at all — the speech service took the microphone. That is
            // not zero pauses, it is nothing to measure, and the report has to
            // be able to tell those apart.
            setProfiles(current => ({ ...current, [last.segmentId]: null }));
            return;
        }

        let alive = true;
        void (async () => {
            const decoded = await decodeMono(url);
            if (!alive) return;
            const profile = decoded ? pausesFrom(decoded.data, decoded.rate) : null;
            setProfiles(current => ({ ...current, [last.segmentId]: profile }));
        })();
        return () => {
            alive = false;
        };
    }, [takes]);

    /**
     * Tell the room how long this candidate's own microphone heard them.
     *
     * «Det er viktig at dere begge er aktive i samtalen» is an instruction the
     * pair was given, and this is how they can check it. Each device measures
     * only its own speaker — nobody's audio is analysed on anybody else's
     * behalf — and with no ranking anywhere in this mode there is nothing to be
     * gained by reporting it wrong.
     */
    const reportSpoken = room?.reportSpoken;
    useEffect(() => {
        if (!reportSpoken) return;
        const spoken = Object.values(profiles)
            .filter(profile => profile?.measured)
            .reduce((sum, profile) => sum + (profile?.speaking ?? 0), 0);
        if (spoken > 0) reportSpoken(spoken * 1000);
    }, [profiles, reportSpoken]);

    const segment = session.segment;
    /**
     * How long this take has run.
     *
     * Off the second-by-second tick that already drives the session clock, so
     * it costs nothing extra. The bounds it counts against are published, which
     * is why it can be shown at all — being stopped at three minutes is the
     * pressure the exam really applies, and a rehearsal without it rehearses
     * the wrong thing.
     */
    const takeStarted = useRef(0);
    if (phase === 'lytter' && takeStarted.current === 0) takeStarted.current = Date.now();
    if (phase !== 'lytter' && takeStarted.current !== 0) takeStarted.current = 0;
    const takeMs = takeStarted.current ? Date.now() - takeStarted.current : 0;

    const listening = phase === 'lytter';

    /**
     * Your voice only leaves this device while you have the floor.
     *
     * The pair speaks one at a time on every task but the conversation, where
     * both floors are open at once and both tracks are with them. Between
     * turns the track is muted rather than closed, so the partner hears the
     * one candidate who is meant to be speaking instead of two devices
     * reading the examiner's lines at each other. Once the session is over
     * the room is theirs again.
     */
    const outgoing = phase === 'ferdig' || (listening && segment?.floor === 'deg');
    const setOutgoing = room?.setOutgoing;
    useEffect(() => {
        setOutgoing?.(outgoing);
    }, [setOutgoing, outgoing]);

    if (phase === 'ferdig' || !segment) {
        return (
            <Shell onBack={onBack}>
                <Oppsummering
                    nivaa={nivaa}
                    timeline={session.timeline}
                    takes={takes}
                    profiles={profiles}
                    elapsedMs={session.elapsedMs}
                    spoke={room?.state.spoke}
                    seat={room?.state.seat}
                    onRestart={onRestart}
                />
            </Shell>
        );
    }

    const speaking = phase === 'snakker';
    const preparing = phase === 'forbereder';
    /** A turn of the other candidate's: this device reads it out and listens. */
    const theirTurn = segment.floor === 'den-andre';
    /** Their turn, once the examiner has finished reading it out. */
    const waiting = theirTurn && !speaking;

    /**
     * Who is lit up in the room.
     *
     * Derived from the phase AND the floor, not from the floor alone: the
     * examiner reads the framing of a task whose floor is yours, so during
     * 'snakker' it is always her turn whatever the segment says.
     *
     * On the other candidate's turn this device never opens its own
     * microphone, so there is no 'lytter' to hang their glow on — it follows
     * the floor for as long as the turn lasts. What the app knows is whose
     * turn it is, not whether they have started talking, and the figure says
     * the first of those.
     */
    const talking: Who = speaking
        ? 'eksaminator'
        : theirTurn
          ? 'den-andre'
          : listening
            ? segment.floor
            : 'ingen';

    return (
        <Shell onBack={onBack} onQuit={session.quit}>
            <div className="flex flex-col gap-5 sm:flex-row">
                <div className="sm:w-52 sm:shrink-0">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                            {nivaa}
                        </span>
                        <span className="text-[11px] tabular-nums text-white/40">
                            {clock(session.elapsedMs)} / {Math.round(TOTAL_MS.max / 60_000)} min
                        </span>
                    </div>
                    <SessionMap timeline={session.timeline} current={session.index} />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="mb-4">
                        <Rommet floor={talking} pairPresent={room !== null} />
                    </div>

                    {/*
                      "Din tur" is announced assertively, because the microphone
                      is already recording by the time it appears — a polite
                      message waits its turn behind whatever else is queued, and
                      a candidate who hears it late has already lost the opening
                      of their answer. Everything else stays polite.
                    */}
                    <p role="alert" aria-live="assertive" className="sr-only">
                        {listening ? 'Din tur. Mikrofonen er på.' : ''}
                    </p>

                    {/*
                      Errors live in their own region, mounted always so that a
                      change of text is what announces them. Rendered
                      conditionally, the node and its first message arrive
                      together and the message is never read out.
                    */}
                    <p
                        role="alert"
                        aria-live="assertive"
                        className={voice.error ? 'mb-2 text-sm text-amber-300' : 'sr-only'}
                    >
                        {voice.error ?? ''}
                    </p>

                    {/*
                      The escape hatch, offered exactly where the problem is
                      read. On some devices the recorder and the speech service
                      cannot share the microphone, and the app cannot always
                      tell that is what happened — browsers differ in whether the
                      starved side errors, returns nothing, or never finishes.
                      Without this, somebody on such a device reads the same
                      message after every attempt they will ever make.
                    */}
                    {voice.error?.includes('fikk ikke tak i ordene') && !voice.recorderStoodDown && (
                        <button
                            onClick={voice.standDownRecorder}
                            className="mb-2 min-h-[44px] w-full rounded-xl border border-amber-300/40 px-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/10"
                        >
                            Skjer dette hver gang? Trykk her — appen slutter å ta opp, så taletjenesten
                            får mikrofonen alene
                        </button>
                    )}

                    {voice.recorderStoodDown && (
                        <p className="mb-2 text-[11px] leading-relaxed text-white/35">
                            Appen tar ikke opp på denne enheten, så taletjenesten får mikrofonen
                            alene. Du får teksten, men ikke melodikurven eller avspilling.
                        </p>
                    )}

                    <div
                        role="status"
                        aria-live="polite"
                        className={[
                            'rounded-xl border px-3.5 py-2 text-sm font-semibold',
                            speaking ? 'border-violet-300/30 bg-violet-400/10 text-violet-100' : '',
                            preparing ? 'border-amber-300/30 bg-amber-400/10 text-amber-100' : '',
                            listening ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100' : '',
                            waiting ? 'border-sky-300/30 bg-sky-400/10 text-sky-100' : '',
                            !speaking && !listening && !preparing && !waiting
                                ? 'border-white/10 bg-white/[0.04] text-white/55'
                                : '',
                        ].join(' ')}
                    >
                        {speaking && 'Eksaminator snakker'}
                        {preparing && 'Tenk deg om — mikrofonen åpner straks'}
                        {listening && 'Din tur — snakk nå'}
                        {/*
                          Whose turn it is, which is what the app knows — not
                          that they are speaking, which it does not. Their
                          microphone is on their own device, and nothing about
                          what they say is measured here.
                        */}
                        {waiting && 'Den andre kandidaten har ordet'}
                        {!speaking && !listening && !preparing && !waiting && 'Klar'}
                    </div>

                    {listening && segment.maxMs && (
                        <p className="mt-2 text-[12px] tabular-nums text-white/45">
                            {clock(takeMs)} av {Math.round((segment.minMs ?? 0) / 60_000)}–
                            {Math.round(segment.maxMs / 60_000)} minutter
                            {takeMs >= segment.maxMs && ' · tiden er ute'}
                        </p>
                    )}

                    {segment.says.length > 0 && (
                        <div className="mt-4 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                            {segment.says.map(line => (
                                <p key={line} className="text-sm leading-relaxed text-white/80">
                                    {line}
                                </p>
                            ))}
                        </div>
                    )}

                    {segment.oppgave && (
                        <div className="mt-3 rounded-xl border border-sky-300/25 bg-sky-400/[0.07] p-4">
                            <p className="text-base font-semibold leading-relaxed text-white">
                                {segment.oppgave.text}
                            </p>
                            {segment.kilde && (
                                <p className="mt-2 text-[11px] text-white/35">
                                    Sitert fra {segment.kilde.label}
                                </p>
                            )}
                        </div>
                    )}

                    {segment.note && (
                        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-white/45">
                            {segment.note}
                        </p>
                    )}

                    {!segment.runnable && segment.unavailable && (
                        <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-400/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-100/75">
                            {segment.unavailable}
                        </p>
                    )}

                    {preparing && (
                        <>
                            <button
                                onClick={session.startNow}
                                className="mt-4 min-h-[48px] w-full rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90"
                            >
                                Jeg er klar
                            </button>
                            {/*
                              Said every time, because a candidate who took this
                              for the exam's preparation time would walk in
                              expecting one. The exam gives preparation time in
                              exactly one place — before the B1–B2 påstand — and
                              publishes no number even there.
                            */}
                            <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                                Appen venter {Math.round(PREP_MS / 1000)} sekunder her, slik at
                                taletjenesten ikke fanger opp at du trekker pusten. Det er appens
                                pause, ikke prøvens.
                            </p>
                        </>
                    )}

                    {listening && voice.interim && (
                        <p className="mt-4 text-sm italic leading-relaxed text-white/45">
                            {voice.interim}
                        </p>
                    )}

                    {listening && (
                        <button
                            onClick={session.finishTake}
                            className="mt-4 min-h-[48px] w-full rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90"
                        >
                            Jeg er ferdig
                        </button>
                    )}

                    {phase === 'klar' && (
                        <button
                            onClick={step}
                            className="mt-4 min-h-[48px] w-full rounded-xl border border-white/20 text-base font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                        >
                            Neste
                        </button>
                    )}


                </div>
            </div>
        </Shell>
    );
}

function Shell({
    children,
    onBack,
    onQuit,
}: {
    children: ReactNode;
    onBack: () => void;
    onQuit?: () => void;
}) {
    /**
     * Ending the whole run asks first.
     *
     * It sat one button away from "Jeg er ferdig", which ends an ANSWER, and a
     * mis-tap threw away every answer so far. Two taps, and the second says
     * what it does: the summary is still written, because a rehearsal you
     * abandoned halfway is still one you learn from.
     */
    const [confirming, setConfirming] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="glass w-full rounded-3xl p-5 sm:p-7"
        >
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white sm:text-3xl">🎓 Prøverommet</h1>
                    <p className="mt-1 text-sm text-white/55">Muntlig prøve, slik den faktisk går</p>
                </div>
                <div className="flex shrink-0 gap-2">
                    {onQuit && (
                        <button
                            onClick={() => {
                                if (confirming) onQuit();
                                else setConfirming(true);
                            }}
                            onBlur={() => setConfirming(false)}
                            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                        >
                            {confirming ? 'Avslutt prøven?' : 'Avslutt'}
                        </button>
                    )}
                    <button
                        onClick={onBack}
                        className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                    >
                        Tilbake
                    </button>
                </div>
            </div>
            {children}
        </motion.div>
    );
}
