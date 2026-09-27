import { useEffect, useMemo, useRef, useState } from 'react';
import { Vurderingskort } from './Vurderingskort';
import { Selvsjekk } from './Selvsjekk';
import { Uttaleprove } from './Uttaleprove';
import { Historikk } from './Historikk';
import { Taletid } from './Taletid';
import type { Seat } from '../../utils/roomProtocol';
import { buildReport } from '../../utils/criteriaReport';
import { forgetHistory, readHistory, remember, type ExamRun } from '../../utils/examHistory';
import type { PauseProfile } from '../../utils/pauses';
import type { Segment } from '../../utils/examTimeline';
import type { Take } from '../../hooks/useExamSession';
import { APP_SIER } from '../../data/muntlig/eksaminator';
import type { Nivaa } from '../../data/muntlig/oppgaver';

interface Props {
    nivaa: Nivaa;
    timeline: Segment[];
    takes: Take[];
    /** Pause measurement per segment; undefined while still being measured. */
    profiles: Record<string, PauseProfile | null>;
    elapsedMs: number;
    /** Speaking time per seat, when the session was run as a pair. */
    spoke?: Record<string, number>;
    seat?: Seat | null;
    /** True when the pair was disconnected because the exam ended. */
    roomClosed?: boolean;
    onRestart: () => void;
}

const clock = (ms: number) => {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Whether the answer was far shorter than its slot allows, in words.
 *
 * A published lower bound is one of the very few hard facts this mode has, and
 * being cut off — or stopping two minutes early — is the thing candidates most
 * often get wrong on the day. It is stated as a fact about the clock, not as a
 * judgement of the answer: a short answer can be a complete one.
 */
function shortfall(take: Take, from: Segment | undefined): string | null {
    if (!from?.minMs || !from.assessed) return null;
    if (take.elapsedMs >= from.minMs) return null;
    return `Du snakket ${clock(take.elapsedMs)}. Oppgaven varer ${Math.round(
        from.minMs / 60_000
    )}–${Math.round((from.maxMs ?? from.minMs) / 60_000)} minutter.`;
}

/**
 * What a rehearsal leaves you with.
 *
 * The order is deliberate and is the argument the screen makes. First what you
 * actually said, because that is the thing worth reading. Then the four
 * criteria with three of them struck through, so the shape of what an app
 * cannot do is visible. Then the rewriting exercise, which is the only useful
 * thing left to do about grammar. Then your own past runs — and nobody else's.
 *
 * Nothing on this screen combines anything. There is no total, because a total
 * is the step a sensor does.
 */
export function Oppsummering({
    nivaa,
    timeline,
    takes,
    profiles,
    elapsedMs,
    spoke,
    seat,
    roomClosed = false,
    onRestart,
}: Props) {
    const [history, setHistory] = useState<ExamRun[]>(() => readHistory());
    const stored = useRef(false);

    const segmentFor = useMemo(
        () => (id: string) => timeline.find(segment => segment.id === id),
        [timeline]
    );

    const evidence = useMemo(
        () =>
            takes.map(take => ({
                segmentId: take.segmentId,
                assessed: segmentFor(take.segmentId)?.assessed ?? false,
                transcript: take.transcript,
                pauses: profiles[take.segmentId] ?? null,
            })),
        [takes, profiles, segmentFor]
    );

    const report = useMemo(() => buildReport(evidence), [evidence]);

    /**
     * The measured, assessed takes — the same set the card counts.
     *
     * The history has to be built from this and not from every profile, or the
     * warm-up's pauses would land in the history while being left out of the
     * card, and the same session would carry two different pause counts.
     */
    const counted = useMemo(
        () => evidence.filter(take => take.assessed && take.pauses?.measured).map(take => take.pauses!),
        [evidence]
    );

    // Lettered tasks that produced nothing. Listed rather than quietly left
    // out: a summary showing only what ran would say the exam is shorter and
    // simpler than it is, and the conversation task alone is a fifth to a third
    // of the real thing.
    const answered = new Set(takes.map(take => take.segmentId));
    const missed = timeline.filter(
        segment =>
            segment.letter &&
            segment.kind !== 'tenketid' &&
            !answered.has(segment.id) &&
            (segment.unavailable !== undefined || segment.floor === 'deg')
    );

    /** Whether every recorded take has been measured yet. */
    const measuring = takes.some(take => take.recordingUrl && !(take.segmentId in profiles));

    useEffect(() => {
        // Once, and only once the measurements are in — storing early would
        // record a run as unmeasured that was merely still being measured.
        if (stored.current || measuring) return;
        stored.current = true;

        const pauses = counted.flatMap(profile => profile.pauses);

        setHistory(
            remember({
                at: new Date().toISOString(),
                nivaa,
                elapsedMs,
                speaking: counted.length
                    ? counted.reduce((sum, profile) => sum + profile.speaking, 0)
                    : null,
                tokens: report.evidence.tokens,
                pauses: counted.length ? pauses.length : null,
                longestPause: pauses.length
                    ? Math.max(...pauses.map(pause => pause.seconds))
                    : null,
                skipped: missed.length,
            })
        );
    }, [measuring, nivaa, elapsedMs, report, counted, missed.length]);

    return (
        <>
            <p className="text-sm text-white/65">
                Ferdig på {clock(elapsedMs)}. Den virkelige prøven tar 20–25 minutter.
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/35">{APP_SIER.totaltid}</p>

            <div className="mt-5 space-y-3">
                {takes.length === 0 && (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/45">
                        Ingen opptak denne gangen.
                    </p>
                )}
                {takes.map(take => {
                    const from = segmentFor(take.segmentId);
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

                            {/*
                              Hearing yourself back is the most useful thing on
                              this screen, and the one thing here that is not an
                              estimate of anything: it is simply what you said.
                              Everything else the app reports about a free answer
                              is hedged, because it has to be. This is not.
                            */}
                            {take.recordingUrl ? (
                                <div className="mt-3">
                                    <audio
                                        controls
                                        preload="none"
                                        src={take.recordingUrl}
                                        className="h-9 w-full"
                                        aria-label={`Hør svaret ditt på ${
                                            from?.letter ? `oppgave ${from.letter}` : from?.title
                                        }`}
                                    />
                                    {shortfall(take, from) && (
                                        <p className="mt-1.5 text-[12px] text-amber-200/60">
                                            {shortfall(take, from)}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="mt-2 text-[12px] leading-relaxed text-white/30">
                                    Ingen lyd å spille av. På denne enheten kan ikke opptak og
                                    taletjenesten dele mikrofonen, så appen valgte ordene — de kan
                                    ingenting annet erstatte.
                                </p>
                            )}
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

            {/*
              The live region is mounted whatever happens and only its TEXT
              changes. A region that appears at the same moment as its first
              message is a region whose first message is never announced — and
              the first message here is the one that matters, because the card
              below it is the result.
            */}
            <p
                role="status"
                aria-live="polite"
                className={
                    measuring
                        ? 'mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/45'
                        : 'sr-only'
                }
            >
                {measuring ? 'Måler pausene i opptaket …' : 'Vurderingskriteriene er klare.'}
            </p>

            {!measuring && <Vurderingskort report={report} nivaa={nivaa} />}

            {roomClosed && (
                <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[12px] leading-relaxed text-white/45">
                    Rommet er lukket, og mikrofonen er av. Det du gjør herfra — leser svarene dine
                    igjen, retter deg selv, tar uttaleprøven — hører ingen andre.
                </p>
            )}

            {spoke && seat && <Taletid spoke={spoke} seat={seat} />}

            {/* The uttale row says "nedenfor", so it is directly below. */}
            <Uttaleprove />

            <Selvsjekk
                answers={takes.map(take => ({
                    segmentId: take.segmentId,
                    title: segmentFor(take.segmentId)?.title ?? '',
                    letter: segmentFor(take.segmentId)?.letter,
                    transcript: take.transcript,
                }))}
            />

            <Historikk
                history={history}
                nivaa={nivaa}
                onForget={() => {
                    forgetHistory();
                    setHistory([]);
                }}
            />

            <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-4 text-[12px] leading-relaxed text-amber-100/70">
                <p className="font-semibold text-amber-100/90">Dette er ikke en vurdering.</p>
                <p className="mt-1.5">
                    For å bli plassert på et nivå må du være på nivået på alle fire kriteriene. Tre
                    av dem er ikke målt her, samtaleoppgaven er ikke kjørt, og ingen har hørt på
                    deg. Det finnes derfor ikke noe regnestykke som kan gi deg et nivå ut fra dette
                    — og appen prøver ikke.
                </p>
            </div>

            <button
                onClick={onRestart}
                className="mt-5 min-h-[48px] w-full rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90"
            >
                Kjør en ny prøve
            </button>
        </>
    );
}
