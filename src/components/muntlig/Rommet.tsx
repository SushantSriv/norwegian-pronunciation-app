import { motion } from 'framer-motion';
import type { Floor } from '../../utils/examTimeline';

/**
 * The room, seen from above.
 *
 * A rehearsal is partly about the room. Candidates arrive expecting a test and
 * find a table with four people at it, one of whom asks nothing all session and
 * is the one taking notes. Drawing it makes two facts concrete that a paragraph
 * does not:
 *
 *   - THE SENSOR SAYS NOTHING. They sit apart, they never take the floor, and
 *     they are half of who decides. People are surprised by this on the day.
 *   - THE OTHER CANDIDATE IS PART OF THE EXAM, not an audience. The
 *     conversation task is a fifth to a third of it, and their seat stays on
 *     the plan even when the app has nobody to put in it.
 *
 * The glow follows whoever holds the floor, which comes from the timeline's own
 * `floor` field rather than from a guess here — one source of truth for whose
 * turn it is, and therefore for whether the microphone is open.
 */

export type Who = Floor;

interface Props {
    /** Whose turn it is right now. */
    floor: Who;
    /** Whether the other candidate's chair is actually occupied. */
    pairPresent?: boolean;
    /** What the other candidate is called, when there is one. */
    partnerName?: string;
}

interface Tint {
    /** Explicit stop colours: `currentColor` inside a gradient resolves
     *  against the gradient element, not against whatever references it, so
     *  the figures come out the colour of their surroundings. */
    from: string;
    to: string;
    /** The Tailwind gradient for the glow, which IS a CSS background. */
    glow: string;
}

interface SeatProps {
    label: string;
    role: string;
    tint: Tint;
    active: boolean;
    /** Drawn faded, for a chair nobody is in. */
    empty?: boolean;
    /** Never glows, whatever happens. */
    silent?: boolean;
}

function Person({ label, role, tint, active, empty, silent }: SeatProps) {
    return (
        <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <motion.div
                animate={
                    active
                        ? { scale: 1.08, opacity: 1 }
                        : { scale: 1, opacity: empty ? 0.45 : 0.72 }
                }
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="relative"
            >
                {/* The glow. A ring rather than a filter, so it reads at any size. */}
                {active && (
                    <motion.span
                        aria-hidden="true"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: [0.45, 0.85, 0.45], scale: [1, 1.18, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                        className={`absolute -inset-2 rounded-full bg-gradient-to-br ${tint.glow} blur-md`}
                    />
                )}

                <svg
                    viewBox="0 0 40 46"
                    className="relative h-11 w-10 sm:h-12 sm:w-11"
                    role="img"
                    aria-label={`${label}, ${role}${active ? ', snakker nå' : ''}`}
                >
                    <defs>
                        <linearGradient id={`seat-${label}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={tint.from} />
                            <stop offset="100%" stopColor={tint.to} />
                        </linearGradient>
                    </defs>
                    {empty ? (
                        // An empty chair, not a struck-out person: a dashed
                        // outline reads as "nobody here yet" at a glance, where
                        // a crossed-out figure reads as somebody removed.
                        <g fill="none" stroke={tint.from} strokeWidth="2" strokeDasharray="3 3">
                            <circle cx="20" cy="12" r="8" />
                            <path d="M5 45c0-9 6.7-15.5 15-15.5S35 36 35 45" />
                        </g>
                    ) : (
                        <>
                            <circle cx="20" cy="12" r="9" fill={`url(#seat-${label})`} />
                            <path
                                d="M4 46c0-9.5 7.2-17 16-17s16 7.5 16 17z"
                                fill={`url(#seat-${label})`}
                            />
                        </>
                    )}
                </svg>

                {/* The sensor gets a notebook, because that is what they do. */}
                {silent && (
                    <span
                        aria-hidden="true"
                        className="absolute -bottom-0.5 -right-1 rounded-[3px] bg-white/80 px-[3px] text-[8px] font-bold leading-[11px] text-slate-800"
                    >
                        ✎
                    </span>
                )}
            </motion.div>

            <span
                className={[
                    'max-w-[12ch] truncate text-[11px] font-bold sm:max-w-[14ch]',
                    active ? 'text-white' : empty ? 'text-white/30' : 'text-white/60',
                ].join(' ')}
            >
                {label}
            </span>
            <span className="max-w-[11ch] text-[9px] leading-tight text-white/30 sm:max-w-[14ch]">
                {role}
            </span>
        </div>
    );
}

/**
 * One colour per seat.
 *
 * Colour is never the only difference: each figure also carries its own label
 * and role, the sensor has a notebook, and an empty chair is struck through.
 */
const TINTS: Record<string, Tint> = {
    eksaminator: { from: '#c4b5fd', to: '#7c3aed', glow: 'from-violet-300 to-violet-500' },
    deg: { from: '#6ee7b7', to: '#059669', glow: 'from-emerald-300 to-emerald-500' },
    andre: { from: '#7dd3fc', to: '#0284c7', glow: 'from-sky-300 to-sky-500' },
    sensor: { from: '#cbd5e1', to: '#64748b', glow: 'from-slate-300 to-slate-500' },
};

export function Rommet({ floor, pairPresent = false, partnerName }: Props) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-4">
                {/* Across the table: the examiner, who does the talking. */}
                <div className="flex flex-1 justify-center">
                    <Person
                        label="Eksaminator"
                        role="leser oppgavene og spør"
                        tint={TINTS.eksaminator}
                        active={floor === 'eksaminator'}
                    />
                </div>

                {/* The sensor sits apart, by design and on the plan. */}
                <div className="w-[4.5rem] shrink-0 border-l border-dashed border-white/12 pl-3 sm:w-24 sm:pl-4">
                    <Person
                        label="Sensor"
                        role="sier ingenting, hører alt"
                        tint={TINTS.sensor}
                        active={false}
                        silent
                    />
                </div>
            </div>

            {/* The table. */}
            <div
                aria-hidden="true"
                className="mx-auto my-3 h-6 w-[72%] rounded-[999px] border border-white/12 bg-gradient-to-b from-white/[0.10] to-white/[0.02] sm:h-7"
            />

            <div className="flex items-start justify-center gap-6 sm:gap-10">
                <Person
                    label="Du"
                    role="her sitter du"
                    tint={TINTS.deg}
                    active={floor === 'deg'}
                />
                <Person
                    label={partnerName?.trim() || 'Kandidat 2'}
                    role={pairPresent ? 'den andre kandidaten' : 'ingen her ennå'}
                    tint={TINTS.andre}
                    active={floor === 'den-andre'}
                    empty={!pairPresent}
                />
            </div>

            <p className="mt-3 text-center text-[10px] leading-relaxed text-white/30">
                Sensoren stiller ingen spørsmål, men er med på å avgjøre nivået ditt.
            </p>
        </div>
    );
}
