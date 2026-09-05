/**
 * The small pictures on the community screen.
 *
 * A weekly total on its own is a number without a scale — 320 means nothing
 * until you can see the weeks either side of it. Each of these turns one part
 * of the ledger into a shape you can read at a glance, and each carries a text
 * alternative, because a chart nobody can hear is a chart half the audience
 * does not get.
 *
 * All presentational. They take numbers and return markup; none of them reach
 * into storage or the point engine.
 */
import { motion } from 'framer-motion';
import type { DayTotal, PersonalBest, PointKind, WeekTotal } from '../utils/learningPoints';
import { KIND_COLOUR, KIND_LABEL } from '../utils/pointLabels';

const nb = (value: number) => value.toLocaleString('nb-NO');

// ---------------------------------------------------------------------------
// League ring
// ---------------------------------------------------------------------------

interface RingProps {
    /** All-time points. */
    points: number;
    /** Points at which the current league began. */
    from: number;
    /** Points at which the next one begins, or null at the top. */
    to: number | null;
    icon: string;
    name: string;
}

/**
 * Progress through the current league.
 *
 * Deliberately shows the distance to the NEXT rung rather than an absolute
 * total: a learner with 1 240 points has no idea whether that is a lot, but
 * "two thirds of the way to Gull" is immediately legible.
 */
export function LeagueRing({ points, from, to, icon, name }: RingProps) {
    const span = to === null ? 0 : to - from;
    const progress = span > 0 ? Math.min(1, Math.max(0, (points - from) / span)) : 1;
    const radius = 46;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className="relative h-[124px] w-[124px] shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="9"
                    className="text-white/10"
                />
                <motion.circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="url(#leagueGradient)"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - progress) }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                />
                <defs>
                    <linearGradient id="leagueGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#7dd3fc" />
                        <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                </defs>
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl" aria-hidden="true">
                    {icon}
                </span>
                <span className="mt-0.5 text-lg font-black leading-none tabular-nums text-white">
                    {nb(points)}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                    poeng
                </span>
            </div>

            <span className="sr-only">
                {name}-liga, {nb(points)} poeng totalt
                {to === null
                    ? ', høyeste liga'
                    : `, ${Math.round(progress * 100)} prosent av veien til neste liga`}
                .
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Streak calendar
// ---------------------------------------------------------------------------

const WEEKDAY = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];

/**
 * The last fortnight, one square a day.
 *
 * The gaps are the point. A streak counter says "5" and hides the three weeks
 * of nothing before it; this does not, which is what makes coming back today
 * feel like it mattered.
 */
export function StreakCalendar({ days }: { days: DayTotal[] }) {
    const practised = days.filter(day => day.practised).length;

    return (
        <div>
            <div className="flex flex-wrap gap-1.5" role="img" aria-label={`Du har øvd ${practised} av de siste ${days.length} dagene.`}>
                {days.map((day, index) => {
                    // Monday-first weekday initial, from the UTC day key.
                    const weekday = WEEKDAY[(new Date(day.at).getUTCDay() + 6) % 7];
                    return (
                        <motion.div
                            key={day.key}
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.25 + index * 0.02, type: 'spring', stiffness: 400, damping: 22 }}
                            title={`${day.key}: ${day.points} poeng`}
                            className={[
                                'flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold',
                                day.practised
                                    ? 'bg-gradient-to-br from-emerald-400/80 to-teal-500/80 text-slate-900'
                                    : 'bg-white/[0.06] text-white/25',
                                day.today ? 'ring-2 ring-sky-300/70' : '',
                            ].join(' ')}
                            aria-hidden="true"
                        >
                            {weekday}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** Points per week, as bars. The current week is picked out. */
export function WeekBars({ weeks }: { weeks: WeekTotal[] }) {
    const peak = Math.max(...weeks.map(week => week.points), 1);

    return (
        <div>
            <div
                className="flex h-24 items-end gap-1.5"
                role="img"
                aria-label={weeks
                    .map(week => `${week.current ? 'Denne uken' : week.key}: ${week.points} poeng`)
                    .join('. ')}
            >
                {weeks.map((week, index) => (
                    <div key={week.key} className="flex flex-1 flex-col items-center gap-1.5">
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(3, (week.points / peak) * 100)}%` }}
                            transition={{ delay: 0.2 + index * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                            className={[
                                'w-full rounded-t-md',
                                week.current
                                    ? 'bg-gradient-to-t from-sky-400/70 to-violet-400/90'
                                    : week.points > 0
                                      ? 'bg-white/20'
                                      : 'bg-white/[0.07]',
                            ].join(' ')}
                            aria-hidden="true"
                        />
                        <span
                            className={`text-[10px] tabular-nums ${week.current ? 'font-bold text-white/80' : 'text-white/30'}`}
                            aria-hidden="true"
                        >
                            {week.points > 0 ? nb(week.points) : '·'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Where the points came from
// ---------------------------------------------------------------------------

/**
 * The mix behind a total.
 *
 * The number a learner should care about is not how many points but which
 * kind: a week built from personal bests and mastered words is a different
 * week from one built out of attempts, even at the same total, and only one of
 * them is worth repeating.
 */
export function PointsBreakdown({ split }: { split: { kind: PointKind; points: number }[] }) {
    const total = split.reduce((sum, part) => sum + part.points, 0);
    if (!total) return null;

    return (
        <div>
            <div
                className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
                role="img"
                aria-label={split.map(part => `${KIND_LABEL[part.kind]}: ${part.points} poeng`).join('. ')}
            >
                {split.map(part => (
                    <motion.div
                        key={part.kind}
                        initial={{ width: 0 }}
                        animate={{ width: `${(part.points / total) * 100}%` }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                        className={KIND_COLOUR[part.kind]}
                        aria-hidden="true"
                    />
                ))}
            </div>

            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {split.map(part => (
                    <li key={part.kind} className="flex items-center gap-1.5 text-xs text-white/55">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_COLOUR[part.kind]}`} aria-hidden="true" />
                        {KIND_LABEL[part.kind]}
                        <span className="font-semibold tabular-nums text-white/80">{nb(part.points)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Personal bests
// ---------------------------------------------------------------------------

/**
 * The words this learner has beaten their own best on.
 *
 * This is the most encouraging thing the app can show and the one thing a
 * points total cannot express: not "you have 1 240 points" but "kjøkken went
 * from 52 to 91, and you did that".
 */
export function GainsList({ gains }: { gains: PersonalBest[] }) {
    if (!gains.length) return null;

    return (
        <ul className="space-y-1.5">
            {gains.map(gain => (
                <li
                    key={`${gain.word}-${gain.at}`}
                    className="flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.07] px-3 py-2"
                >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                        {gain.word}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-white/45">
                        {gain.from} → {gain.to}
                    </span>
                    <span className="shrink-0 rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-200">
                        +{gain.to - gain.from}
                    </span>
                </li>
            ))}
        </ul>
    );
}

// ---------------------------------------------------------------------------
// A milestone tile
// ---------------------------------------------------------------------------

export function Milestone({
    icon,
    value,
    label,
    hint,
}: {
    icon: string;
    value: string;
    label: string;
    hint?: string;
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
            <div className="text-xl" aria-hidden="true">
                {icon}
            </div>
            <div className="mt-1 text-xl font-black tabular-nums text-white">{value}</div>
            <div className="text-xs font-semibold text-white/60">{label}</div>
            {hint && <div className="mt-0.5 text-[11px] leading-snug text-white/35">{hint}</div>}
        </div>
    );
}
