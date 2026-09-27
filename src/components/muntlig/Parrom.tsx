import { useState } from 'react';
import type { RoomState } from '../../hooks/useExamRoom';
import type { QueueState } from '../../hooks/useExamQueue';
import {
    CODE_LENGTH,
    normaliseCode,
    ROOM_NIVAAER,
    type RoomNivaa,
} from '../../utils/roomProtocol';

interface Props {
    state: RoomState;
    queue: QueueState;
    /** True when the browser refused to start the partner's audio by itself. */
    needsTap: boolean;
    onPlayPartner: () => void;
    onCreate: (nivaa: RoomNivaa) => void;
    onJoin: (code: string, nivaa: RoomNivaa) => void;
    onQueue: (nivaa: RoomNivaa) => void;
    onLeaveQueue: () => void;
    onLeave: () => void;
}

/**
 * Finding somebody to be the second candidate.
 *
 * The conversation task is a fifth to a third of the exam and needs a person.
 * The app refuses to fake one — a synthetic partner that always agrees teaches
 * the wrong thing — so this is the alternative: a code, a link, and a real
 * person on the other end of it.
 *
 * Three things are said here rather than discovered later, because all three
 * surprise people:
 *
 *   - Your IP address is visible to whoever you practise with. That is how a
 *     direct connection is made; every video call works this way.
 *   - Some networks will not allow a direct connection at all, and there is no
 *     relay behind this because a relay costs money to run.
 *   - The level belongs to whoever opened the room. Two candidates cannot sit
 *     different exams together.
 */

const STATUS: Record<RoomState['phase'], string> = {
    av: '',
    'kobler-til': 'Kobler til rommet …',
    'venter-på-partner': 'Venter på den andre kandidaten.',
    'kobler-lyd': 'Fant partneren din. Kobler lyden …',
    tilkoblet: 'Tilkoblet. Dere hører hverandre nå.',
    feilet: 'Det gikk ikke.',
};

const clock = (ms: number) => {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export function Parrom({
    state,
    queue,
    needsTap,
    onPlayPartner,
    onCreate,
    onJoin,
    onQueue,
    onLeaveQueue,
    onLeave,
}: Props) {
    const [typed, setTyped] = useState('');
    const [copied, setCopied] = useState(false);
    /**
     * The level this room would be opened at.
     *
     * Chosen here rather than taken from the picker above. Opening a room is a
     * decision for two people, and reading it off whichever level button the
     * mouse last passed over would make it something you could change without
     * meaning to — and then discover on the other side of a link.
     */
    const [nivaa, setNivaa] = useState<RoomNivaa>('A2-B1');

    const link = state.code
        ? `${window.location.origin}${window.location.pathname}?rom=${state.code}`
        : '';

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard refused; the code is on screen to be read out anyway.
        }
    };

    return (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">
                Øv sammen med en annen kandidat
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                Samtaleoppgaven krever to kandidater. Lag et rom og send lenken til noen som også
                skal opp — da hører dere hverandre, og hver mikrofon hører bare sin egen kandidat.
            </p>

            {state.phase === 'av' && queue.phase !== 'av' && (
                <div className="mt-3.5 rounded-xl border border-white/12 bg-white/[0.05] p-4 text-center">
                    {queue.phase === 'venter' && (
                        <>
                            <p className="text-sm font-semibold text-white">
                                Venter på en å øve med på {queue.nivaa}
                            </p>
                            <p
                                className="mt-1 text-[12px] tabular-nums text-white/45"
                                role="status"
                                aria-live="polite"
                            >
                                {clock(queue.elapsedMs)}
                                {queue.waiting > 1 && ` · ${queue.waiting} i køen`}
                            </p>
                            <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                                Appen setter dere sammen så snart én til velger samme nivå. Du kan
                                gå ut når som helst.
                            </p>
                        </>
                    )}

                    {queue.phase === 'fant-noen' && (
                        <p className="text-sm font-semibold text-emerald-200">
                            Fant en kandidat. Kobler dere sammen …
                        </p>
                    )}

                    {queue.phase === 'ingen-kom' && (
                        <>
                            <p className="text-sm font-semibold text-white/80">
                                Ingen andre kom i løpet av tre minutter.
                            </p>
                            <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
                                Det er få som øver akkurat nå. Du kan prøve igjen, sende lenken til
                                noen du kjenner, eller ta prøven alene — samtaleoppgaven blir stående
                                ukjørt, og appen sier hva du gikk glipp av.
                            </p>
                        </>
                    )}

                    {queue.phase === 'feilet' && (
                        <p className="text-sm font-semibold text-amber-300">
                            {queue.problem ?? 'Køen svarte ikke.'}
                        </p>
                    )}

                    <button
                        onClick={onLeaveQueue}
                        className="mt-3 min-h-[44px] w-full rounded-xl border border-white/20 text-sm font-semibold text-white/75 transition hover:border-white/40 hover:bg-white/10"
                    >
                        {queue.phase === 'venter' ? 'Gå ut av køen' : 'Tilbake'}
                    </button>
                </div>
            )}

            {state.phase === 'av' && queue.phase === 'av' ? (
                <>
                    <div className="mt-3.5" role="group" aria-label="Nivå for rommet">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                            Nivå for rommet
                        </p>
                        <div className="flex gap-1.5">
                            {ROOM_NIVAAER.map(level => (
                                <button
                                    key={level}
                                    onClick={() => setNivaa(level)}
                                    aria-pressed={nivaa === level}
                                    className={[
                                        'min-h-[40px] flex-1 rounded-lg border text-[13px] font-bold transition',
                                        nivaa === level
                                            ? 'border-white/45 bg-white/[0.12] text-white'
                                            : 'border-white/12 text-white/50 hover:border-white/30 hover:text-white/80',
                                    ].join(' ')}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/*
                      The queue is the first option, because it is the only one
                      most people can use: preparing for this exam does not come
                      with knowing somebody else preparing for it.
                    */}
                    <button
                        onClick={() => onQueue(nivaa)}
                        className="mt-2.5 min-h-[48px] w-full rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90"
                    >
                        Finn en å øve med på {nivaa}
                    </button>

                    <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                        Du blir satt sammen med en fremmed som øver til samme prøve. Ingen navn
                        utveksles. Men for å koble lyden direkte må nettleserne fortelle hverandre
                        hvordan de nås, så <strong className="font-semibold text-white/55">
                        IP-adressen din blir synlig for den du blir satt sammen med</strong> — slik
                        er det i enhver samtale på nett. Vil du heller styre hvem det blir, lag et
                        rom og send lenken.
                    </p>

                    <button
                        onClick={() => onCreate(nivaa)}
                        className="mt-3 min-h-[48px] w-full rounded-xl border border-white/20 text-base font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                    >
                        Lag et rom og send lenken
                    </button>

                    <div className="mt-3 flex items-center gap-2">
                        <label className="sr-only" htmlFor="romkode">
                            Romkode
                        </label>
                        <input
                            id="romkode"
                            value={typed}
                            onChange={event => setTyped(normaliseCode(event.target.value))}
                            placeholder="ROMKODE"
                            inputMode="text"
                            autoCapitalize="characters"
                            spellCheck={false}
                            className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-3 text-center text-base font-bold uppercase tracking-[0.25em] text-white outline-none transition placeholder:tracking-normal placeholder:text-white/25 focus:border-white/35 focus-visible:ring-2 focus-visible:ring-sky-300/70"
                        />
                        <button
                            onClick={() => onJoin(typed, nivaa)}
                            disabled={typed.length !== CODE_LENGTH}
                            className="min-h-[48px] shrink-0 rounded-xl border border-white/20 px-4 text-sm font-bold text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            Bli med
                        </button>
                    </div>
                </>
            ) : (
                <div className="mt-3.5">
                    {state.code && (
                        <div className="rounded-xl border border-white/12 bg-white/[0.05] p-3.5 text-center">
                            <p className="text-[11px] uppercase tracking-wide text-white/40">
                                Romkode
                            </p>
                            <p className="mt-0.5 text-2xl font-black tracking-[0.3em] text-white">
                                {state.code}
                            </p>
                            <button
                                onClick={copy}
                                className="mt-2 rounded-lg border border-white/20 px-3 py-1.5 text-[12px] font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                            >
                                {copied ? 'Lenken er kopiert' : 'Kopier lenken'}
                            </button>
                        </div>
                    )}

                    <p
                        role="status"
                        aria-live="polite"
                        className={[
                            'mt-3 text-sm font-semibold',
                            state.phase === 'tilkoblet' ? 'text-emerald-200' : '',
                            state.phase === 'feilet' ? 'text-amber-300' : '',
                            state.phase !== 'tilkoblet' && state.phase !== 'feilet'
                                ? 'text-white/60'
                                : '',
                        ].join(' ')}
                    >
                        {STATUS[state.phase]}
                    </p>

                    {needsTap && state.phase === 'tilkoblet' && (
                        <button
                            onClick={onPlayPartner}
                            className="mt-3 min-h-[48px] w-full rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90"
                        >
                            🔊 Trykk for å høre partneren
                        </button>
                    )}

                    {state.problem && (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-amber-200/75">
                            {state.problem}
                        </p>
                    )}

                    {state.nivaa && state.nivaa !== nivaa && (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-white/50">
                            Rommet er på {state.nivaa}, som den som laget det valgte. Dere kan ikke
                            ta hver deres nivå sammen — det er tre forskjellige prøver.
                        </p>
                    )}

                    <button
                        onClick={onLeave}
                        className="mt-3 min-h-[44px] w-full rounded-xl border border-white/20 text-sm font-semibold text-white/75 transition hover:border-white/40 hover:bg-white/10"
                    >
                        Forlat rommet
                    </button>
                </div>
            )}

            <div className="mt-3.5 space-y-1.5 border-t border-white/[0.07] pt-3 text-[11px] leading-relaxed text-white/35">
                <p>
                    Lyden går direkte mellom de to nettleserne. Ingenting av det dere sier går via
                    en server, og ingenting lagres.
                </p>
                <p>
                    For å koble direkte må nettleserne fortelle hverandre hvordan de nås, så
                    IP-adressen din er synlig for den du øver med. Slik fungerer alle videosamtaler
                    — send koden til noen du mente å øve med.
                </p>
                <p>
                    På noen bedrifts- og mobilnett slipper ikke en direkte kobling gjennom. Da sier
                    appen fra i stedet for å la dere sitte i et stille rom.
                </p>
            </div>
        </div>
    );
}
