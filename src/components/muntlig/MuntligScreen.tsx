import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { SessionMap } from './SessionMap';
import { useExamSession } from '../../hooks/useExamSession';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { examProfile, PHRASE, recognitionSupported, type ListenProfile } from '../../utils/speech';
import { TOTAL_MS } from '../../utils/examTimeline';
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

export function MuntligScreen({ onBack }: Props) {
    const [nivaa, setNivaa] = useState<Nivaa | null>(null);

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

                <div className="mt-5 space-y-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[12px] leading-relaxed text-white/45">
                    <p>{APP_SIER.ikkeEkteOppgaver}</p>
                    <p>{APP_SIER.halvDupleks}</p>
                    <p>{APP_SIER.ingenPartner}</p>
                    <p className="text-white/35">{APP_SIER.ikkeHkdir}</p>
                </div>
            </Shell>
        );
    }

    // Keyed on the level so a fresh session — and a fresh timeline — is built,
    // rather than the first pick being frozen in for the whole visit.
    return <ExamRunner key={nivaa} nivaa={nivaa} onBack={onBack} onRestart={() => setNivaa(null)} />;
}

interface RunnerProps {
    nivaa: Nivaa;
    onBack: () => void;
    onRestart: () => void;
}

function ExamRunner({ nivaa, onBack, onRestart }: RunnerProps) {
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

    const voice = useVoiceInput({ onResult, profile });
    recordingRef.current = voice.recordingUrl;

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
    const session = useExamSession({ nivaa, listen, endTake });
    const { begin, phase } = session;

    useEffect(() => {
        begin();
    }, [begin]);

    // The clock is read from Date.now() at render time, so it needs a pulse.
    useEffect(() => {
        if (phase === 'ferdig') return;
        const timer = window.setInterval(() => tick(n => n + 1), 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    const segment = session.segment;

    if (phase === 'ferdig' || !segment) {
        // Which lettered tasks produced nothing. Listed rather than quietly
        // left out: a summary that shows only what ran would tell you the exam
        // is shorter and simpler than it is, and the conversation task alone is
        // a fifth to a third of the real thing.
        const spoken = new Set(session.takes.map(take => take.segmentId));
        const missed = session.timeline.filter(
            s =>
                s.letter &&
                s.kind !== 'tenketid' &&
                !spoken.has(s.id) &&
                // Either the app could not run it, or it was your turn and
                // nothing came of it. A slot where only the examiner speaks is
                // not something you missed.
                (s.unavailable !== undefined || s.floor === 'deg')
        );

        return (
            <Shell onBack={onBack}>
                <p className="text-sm text-white/65">
                    Ferdig på {clock(session.elapsedMs)}. Den virkelige prøven tar 20–25 minutter.
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/35">{APP_SIER.totaltid}</p>

                <div className="mt-5 space-y-3">
                    {session.takes.length === 0 && (
                        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/45">
                            Ingen opptak denne gangen.
                        </p>
                    )}
                    {session.takes.map(take => {
                        const from = session.timeline.find(s => s.id === take.segmentId);
                        return (
                            <div
                                key={take.segmentId}
                                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-bold text-white">
                                        {from?.letter ? `Oppgave ${from.letter} · ` : ''}
                                        {from?.title}
                                    </span>
                                    <span className="shrink-0 text-[11px] tabular-nums text-white/40">
                                        {clock(take.elapsedMs)}
                                        {from?.assessed === false && ' · teller ikke'}
                                    </span>
                                </div>
                                {from?.oppgave && (
                                    <p className="mt-1.5 text-[12px] italic text-white/40">
                                        {from.oppgave.text}
                                    </p>
                                )}
                                <p className="mt-2 text-sm leading-relaxed text-white/70">
                                    {take.transcript || (
                                        <span className="text-white/35">Ingenting ble hørt.</span>
                                    )}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {missed.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        <p className="text-sm font-semibold text-white/70">Dette ble ikke kjørt</p>
                        {missed.map(task => (
                            <div key={task.id}>
                                <p className="text-[13px] font-semibold text-white/55">
                                    Oppgave {task.letter} · {task.title}
                                    {task.maxMs && (
                                        <span className="ml-1.5 font-normal tabular-nums text-white/35">
                                            {Math.round((task.minMs ?? 0) / 60_000)}–
                                            {Math.round(task.maxMs / 60_000)} min
                                        </span>
                                    )}
                                </p>
                                <p className="mt-0.5 text-[12px] leading-relaxed text-white/40">
                                    {task.unavailable ?? 'Du gikk videre uten å svare.'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-[12px] leading-relaxed text-amber-100/70">
                    <p className="font-semibold text-amber-100/90">Dette er ikke en vurdering.</p>
                    <p className="mt-1.5">
                        Prøven vurderer flyt, uttale, ordforråd og grammatikk. Ingen av delene er målt
                        her — du har fått tilbake det taletjenesten hørte, og ingenting mer. For å bli
                        plassert på et nivå må du være på nivået på alle fire kriteriene, så det finnes
                        ikke noe regnestykke som kan gi deg et nivå ut fra dette.
                    </p>
                </div>

                <button
                    onClick={onRestart}
                    className="mt-5 min-h-[48px] w-full rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90"
                >
                    Kjør en ny prøve
                </button>
            </Shell>
        );
    }

    const listening = phase === 'lytter';
    const speaking = phase === 'snakker';

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
                    <div
                        role="status"
                        aria-live="polite"
                        className={[
                            'rounded-xl border px-3.5 py-2 text-sm font-semibold',
                            speaking ? 'border-violet-300/30 bg-violet-400/10 text-violet-100' : '',
                            listening ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100' : '',
                            !speaking && !listening ? 'border-white/10 bg-white/[0.04] text-white/55' : '',
                        ].join(' ')}
                    >
                        {speaking && 'Eksaminator snakker'}
                        {listening && 'Din tur — snakk nå'}
                        {!speaking && !listening && 'Klar'}
                    </div>

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
                            onClick={session.next}
                            className="mt-4 min-h-[48px] w-full rounded-xl border border-white/20 text-base font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                        >
                            Neste
                        </button>
                    )}

                    {voice.error && <p className="mt-3 text-sm text-amber-300">{voice.error}</p>}
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
                            onClick={onQuit}
                            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                        >
                            Avslutt
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
