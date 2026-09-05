import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { NicknameCard } from './NicknameCard';
import {
    GainsList,
    LeagueRing,
    Milestone,
    PointsBreakdown,
    StreakCalendar,
    WeekBars,
} from './CommunityVisuals';
import type { useCommunity } from '../hooks/useCommunity';
import {
    fetchBoard,
    leaderboardEnabled,
    type Board,
    type BoardScope,
} from '../utils/leaderboardClient';
import {
    bestGains,
    CEFR_LEVELS,
    pointsByKind,
    practiceDays,
    weeklyHistory,
} from '../utils/learningPoints';
import { weekStart } from '../utils/period';

interface Props {
    community: ReturnType<typeof useCommunity>;
    onBack: () => void;
}

const TABS: { scope: BoardScope; label: string; solo: string }[] = [
    { scope: 'weekly', label: 'Denne uken', solo: 'Ukene dine' },
    { scope: 'alltime', label: 'All-time', solo: 'Milepæler' },
    { scope: 'improved', label: 'Mest forbedret', solo: 'Dine gjennombrudd' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

const nb = (value: number) => value.toLocaleString('nb-NO');

const formatValue = (scope: BoardScope, value: number) =>
    scope === 'improved' ? `+${value.toFixed(1)}` : nb(value);

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-white/45">{label}</dt>
            <dd className={`text-xl font-bold tabular-nums ${tone ?? 'text-white'}`}>{value}</dd>
            {hint && <p className="text-[11px] text-white/40">{hint}</p>}
        </div>
    );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">{title}</h3>
                {subtitle && <span className="text-[11px] text-white/30">{subtitle}</span>}
            </div>
            {children}
        </section>
    );
}

/**
 * The community screen.
 *
 * Two quite different things share it, and the difference is honest rather than
 * hidden. With a leaderboard server configured it shows the shared board and
 * where this learner sits on it. Without one — which is every default build,
 * including the hosted one — the same tabs show the learner's own history
 * instead: their weeks against each other, their milestones, their personal
 * bests. That is a real board with real data, not a placeholder, and it is
 * genuinely the more motivating of the two on any given Tuesday.
 *
 * Everything here was computed on the device from attempts that had already
 * been graded. Nothing on this screen can change a score.
 */
export function CommunityScreen({ community, onBack }: Props) {
    const [scope, setScope] = useState<BoardScope>('weekly');
    const [level, setLevel] = useState('all');
    const [board, setBoard] = useState<Board | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [renaming, setRenaming] = useState(false);
    /** The current fetch, so a finished sync can trigger another one. */
    const reload = useRef<() => void>(() => {});

    const { identity, ledger, weekly, allTime, streak, standing, improvement, sync } = community;

    // Send what has not been sent, once, when the screen opens. This screen is
    // not where points are earned, so once on open is the whole of it — but the
    // board has to be fetched again afterwards, or the learner looks at a table
    // computed before their own points arrived and cannot find themselves.
    useEffect(() => {
        void sync().finally(() => reload.current());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(() => {
        if (!leaderboardEnabled) return () => {};
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchBoard(scope, level, identity)
            .then(result => {
                if (!cancelled) setBoard(result);
            })
            .catch((cause: unknown) => {
                if (!cancelled) {
                    setError(
                        cause instanceof Error ? cause.message : 'Leaderboardet svarer ikke.'
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [scope, level, identity]);

    useEffect(() => {
        reload.current = load;
        return load();
    }, [load]);

    const now = Date.now();
    const weeks = weeklyHistory(ledger, now, 8);
    const days = practiceDays(ledger, now, 14);
    const thisWeekSplit = pointsByKind(ledger, weekStart(now));
    const gains = bestGains(ledger, 5);
    const hasPoints = allTime > 0;

    const movement =
        standing?.rank != null && standing.previousRank != null
            ? standing.previousRank - standing.rank
            : 0;

    const nextLeague = community.next;
    const bestWeek = weeks.reduce((best, week) => Math.max(best, week.points), 0);
    const daysPractised = days.filter(day => day.practised).length;

    // Your own row, when you are ranked but below the visible top.
    const outsideTop =
        board?.you?.rank != null && !board.rows.some(row => row.id === identity?.id)
            ? board.you
            : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="glass w-full rounded-3xl p-5 sm:p-7"
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-white sm:text-3xl">🏆 Fellesskap</h1>
                    <p className="mt-1 text-sm text-white/55">
                        Poeng for læring og framgang — ikke for å gjenta det du alt kan.
                    </p>
                </div>
                <button
                    onClick={onBack}
                    className="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                >
                    Tilbake
                </button>
            </div>

            {/* ── Your own standing ─────────────────────────────────────── */}
            <section
                aria-label="Din uke"
                className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5"
            >
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                    <LeagueRing
                        points={allTime}
                        from={community.league.from}
                        to={nextLeague ? nextLeague.league.from : null}
                        icon={community.league.icon}
                        name={community.league.name}
                    />

                    <div className="min-w-0 flex-1 text-center sm:text-left">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <span className="text-lg font-bold text-white">
                                {identity ? identity.nickname : 'Deg'}
                            </span>
                            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-white/75">
                                {community.league.icon} {community.league.name}
                                {community.level ? ` · ${community.level}` : ''}
                            </span>
                            {identity && !renaming && (
                                <button
                                    onClick={() => setRenaming(true)}
                                    className="text-xs text-white/40 underline decoration-white/20 underline-offset-2 transition hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                                >
                                    Bytt navn
                                </button>
                            )}
                        </div>

                        {standing?.rank != null ? (
                            <p className="mt-1.5 text-2xl font-extrabold text-white">
                                Du er #{standing.rank} denne uken
                                {movement > 0 && (
                                    <span className="ml-2 align-middle text-sm font-bold text-emerald-300">
                                        ↑ {movement} {movement === 1 ? 'plass' : 'plasser'}
                                    </span>
                                )}
                                {movement < 0 && (
                                    <span className="ml-2 align-middle text-sm font-bold text-white/40">
                                        ↓ {-movement}
                                    </span>
                                )}
                            </p>
                        ) : (
                            <p className="mt-1.5 text-2xl font-extrabold text-white">
                                {hasPoints ? `+${nb(weekly)} poeng denne uken` : 'Klar for første økt'}
                            </p>
                        )}

                        {standing?.toNext != null && standing.toNext > 0 && (
                            <p className="mt-1 text-sm text-white/70">
                                Bare <strong className="text-white">{nb(standing.toNext)} poeng</strong> til
                                #{(standing.rank ?? 1) - 1}.
                            </p>
                        )}

                        {nextLeague && (
                            <p className="mt-1 text-sm text-white/50">
                                {nb(nextLeague.points)} poeng til {nextLeague.league.icon}{' '}
                                {nextLeague.league.name}.
                            </p>
                        )}

                        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-left sm:grid-cols-4">
                            <Stat label="Denne uken" value={`+${nb(weekly)}`} hint="poeng" />
                            <Stat
                                label="Streak"
                                value={streak > 0 ? `${streak}` : '—'}
                                hint={streak > 0 ? (streak === 1 ? 'dag' : 'dager') : 'start i dag'}
                                tone={streak > 1 ? 'text-amber-300' : undefined}
                            />
                            <Stat
                                label="Mestret"
                                value={nb(ledger.mastered.length)}
                                hint={ledger.mastered.length === 1 ? 'ord' : 'ord'}
                            />
                            <Stat
                                label="Forbedring"
                                value={
                                    improvement
                                        ? `${improvement.delta > 0 ? '+' : ''}${improvement.delta}`
                                        : '—'
                                }
                                hint={improvement ? 'mot forrige uke' : 'ikke nok data ennå'}
                                tone={improvement && improvement.delta > 0 ? 'text-emerald-300' : undefined}
                            />
                        </dl>
                    </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">
                        Siste to uker
                    </p>
                    <StreakCalendar days={days} />
                </div>

                {!hasPoints && (
                    <p className="mt-4 rounded-xl border border-sky-300/25 bg-sky-400/10 p-3 text-sm text-white/80">
                        Fullfør din første øvelse for å komme på leaderboardet. Den aller første
                        frasen du sier er verdt poeng — du starter ikke på #10 483.
                    </p>
                )}
            </section>

            {/* Only shown when there is something to decide — and only when there
                is a board to be named on. Asking a learner to pick a nickname in
                a build with no leaderboard is asking for something that does
                nothing. The name itself lives in the card above, beside the rank
                it belongs to. */}
            {leaderboardEnabled && (!identity || renaming) && (
                <div className="mt-4">
                    <NicknameCard
                        mode={identity ? 'rename' : 'join'}
                        current={identity?.nickname}
                        onSubmit={nickname => {
                            if (identity) community.rename(nickname);
                            else community.join(nickname);
                            setRenaming(false);
                        }}
                        onCancel={identity ? () => setRenaming(false) : undefined}
                    />
                </div>
            )}

            {/* ── The board ─────────────────────────────────────────────── */}
            <div className="mt-6">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard">
                    {TABS.map(tab => (
                        <button
                            key={tab.scope}
                            role="tab"
                            onClick={() => setScope(tab.scope)}
                            aria-selected={scope === tab.scope}
                            className={
                                scope === tab.scope
                                    ? 'rounded-full bg-white px-4 py-1.5 text-sm font-bold text-slate-900'
                                    : 'rounded-full border border-white/15 px-4 py-1.5 text-sm font-semibold text-white/60 transition hover:border-white/35 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70'
                            }
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {leaderboardEnabled && scope !== 'improved' && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {['all', ...CEFR_LEVELS].map(option => (
                            <button
                                key={option}
                                onClick={() => setLevel(option)}
                                aria-pressed={level === option}
                                className={
                                    level === option
                                        ? 'rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white'
                                        : 'rounded-full px-3 py-1 text-xs font-semibold text-white/45 transition hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70'
                                }
                            >
                                {option === 'all' ? 'Alle' : option}
                            </button>
                        ))}
                    </div>
                )}

                <div className="mt-4" role="tabpanel">
                    {leaderboardEnabled ? (
                        loading && !board ? (
                            <p className="p-4 text-sm text-white/50">Henter…</p>
                        ) : error ? (
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                                <p>{error}</p>
                                <p className="mt-1 text-white/40">
                                    Poengene dine er trygge på denne enheten og sendes neste gang.
                                </p>
                                <button
                                    onClick={load}
                                    className="mt-3 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                                >
                                    Prøv igjen
                                </button>
                            </div>
                        ) : !board?.rows.length ? (
                            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                                {scope === 'improved'
                                    ? 'Ingen har nok data ennå. Forbedring måles mot forrige uke og krever minst 10 forsøk hver uke.'
                                    : 'Du er klar for din første plassering!'}
                            </p>
                        ) : (
                            <>
                                <ol className="space-y-1.5">
                                    {board.rows.map((row, index) => (
                                        <BoardRow
                                            key={row.id}
                                            rank={row.rank}
                                            nickname={row.nickname}
                                            level={row.level}
                                            value={formatValue(scope, row.value)}
                                            medal={MEDALS[index]}
                                            you={identity?.id === row.id}
                                        />
                                    ))}
                                </ol>
                                {outsideTop && (
                                    <>
                                        <p className="py-1.5 text-center text-xs text-white/25" aria-hidden="true">
                                            ⋯
                                        </p>
                                        <BoardRow
                                            rank={outsideTop.rank ?? 0}
                                            nickname={identity?.nickname ?? 'Deg'}
                                            level={community.level}
                                            value={formatValue(scope, outsideTop.value)}
                                            you
                                        />
                                    </>
                                )}
                                <p className="mt-2 text-center text-[11px] text-white/30">
                                    {nb(board.total)} lærende på denne tavlen
                                </p>
                            </>
                        )
                    ) : (
                        <SoloBoard
                            scope={scope}
                            weeks={weeks}
                            gains={gains}
                            weekly={weekly}
                            allTime={allTime}
                            bestWeek={bestWeek}
                            daysPractised={daysPractised}
                            mastered={ledger.mastered.length}
                            improvementDelta={improvement ? improvement.delta : null}
                        />
                    )}
                </div>
            </div>

            {/* ── Where the points came from ────────────────────────────── */}
            {thisWeekSplit.length > 0 && (
                <Panel title="Hvor poengene kom fra" subtitle="denne uken">
                    <PointsBreakdown split={thisWeekSplit} />
                </Panel>
            )}

            <p className="mt-6 text-[11px] leading-relaxed text-white/35">
                Poengene regnes ut fra uttalescoren du allerede har fått — leaderboardet rører
                aldri selve scoringen. Opptak, transkripsjoner og frasene du øver på blir på denne
                enheten; bare et kallenavn, en anonym id og selve poengene sendes noe sted.
            </p>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------

/** The podium places get a tint each, so first place looks like first place. */
const PODIUM = [
    'border-amber-300/35 bg-amber-300/[0.08]',
    'border-slate-300/30 bg-slate-300/[0.07]',
    'border-orange-400/30 bg-orange-400/[0.07]',
];

function BoardRow({
    rank,
    nickname,
    level,
    value,
    medal,
    you,
}: {
    rank: number;
    nickname: string;
    level: string | null;
    value: string;
    medal?: string;
    you?: boolean;
}) {
    const podium = rank <= PODIUM.length ? PODIUM[rank - 1] : null;

    return (
        <li
            className={[
                'flex items-center gap-3 rounded-xl border px-3',
                podium ? 'py-3' : 'py-2.5',
                you
                    ? 'border-sky-300/50 bg-sky-300/[0.13] ring-1 ring-sky-300/20'
                    : (podium ?? 'border-white/10 bg-white/[0.03]'),
            ].join(' ')}
        >
            <span
                className={[
                    'w-8 shrink-0 text-center font-bold',
                    medal ? 'text-xl' : 'text-sm text-white/50',
                ].join(' ')}
            >
                {medal ?? rank}
            </span>
            <span
                className={[
                    'min-w-0 flex-1 truncate font-semibold text-white',
                    podium ? 'text-base' : 'text-sm',
                ].join(' ')}
            >
                {nickname}
                {you && <span className="ml-2 text-xs font-bold text-sky-200">deg</span>}
            </span>
            {level && <span className="shrink-0 text-[11px] text-white/35">{level}</span>}
            <span
                className={[
                    'shrink-0 font-bold tabular-nums',
                    podium ? 'text-base text-white' : 'text-sm text-white/85',
                ].join(' ')}
            >
                {value}
            </span>
        </li>
    );
}

/**
 * The board when there is no shared one.
 *
 * Not a placeholder and not an apology: the same three questions, answered
 * about the learner instead of about strangers. Am I doing more than I was?
 * What have I actually got out of this? Which words did I beat?
 */
function SoloBoard({
    scope,
    weeks,
    gains,
    weekly,
    allTime,
    bestWeek,
    daysPractised,
    mastered,
    improvementDelta,
}: {
    scope: BoardScope;
    weeks: ReturnType<typeof weeklyHistory>;
    gains: ReturnType<typeof bestGains>;
    weekly: number;
    allTime: number;
    bestWeek: number;
    daysPractised: number;
    mastered: number;
    improvementDelta: number | null;
}) {
    const notice = (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-white/45">
            Denne versjonen har ingen delt leaderboard, så tavlen viser din egen framgang. Poengene
            teller og lagres her; den delte tavlen slås på når en server er satt opp for bygget.
        </p>
    );

    if (scope === 'improved') {
        return (
            <div>
                {gains.length ? (
                    <>
                        <p className="mb-3 text-sm text-white/60">
                            Ordene du har slått din egen rekord på — dette er læring, målt.
                        </p>
                        <GainsList gains={gains} />
                    </>
                ) : (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                        Ingen personlige rekorder ennå. Første gang du sier et ord bedre enn du
                        noen gang har gjort før, dukker det opp her.
                    </p>
                )}
                {improvementDelta !== null && (
                    <p className="mt-3 text-sm text-white/60">
                        Medianscoren din er{' '}
                        <strong className={improvementDelta >= 0 ? 'text-emerald-300' : 'text-white'}>
                            {improvementDelta > 0 ? '+' : ''}
                            {improvementDelta}
                        </strong>{' '}
                        mot forrige uke.
                    </p>
                )}
                {notice}
            </div>
        );
    }

    if (scope === 'alltime') {
        return (
            <div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Milestone icon="⭐" value={nb(allTime)} label="poeng totalt" />
                    <Milestone icon="🏅" value={nb(bestWeek)} label="beste uke" hint="siste 8 uker" />
                    <Milestone icon="📚" value={nb(mastered)} label="ord mestret" />
                    <Milestone
                        icon="📅"
                        value={nb(daysPractised)}
                        label="dager øvd"
                        hint="siste 14 dager"
                    />
                </div>
                {notice}
            </div>
        );
    }

    const previous = weeks.at(-2)?.points ?? 0;
    const change = weekly - previous;

    return (
        <div>
            <p className="mb-3 text-sm text-white/60">
                {previous > 0 ? (
                    <>
                        Du ligger{' '}
                        <strong className={change >= 0 ? 'text-emerald-300' : 'text-amber-300'}>
                            {change >= 0 ? '+' : ''}
                            {nb(change)} poeng
                        </strong>{' '}
                        mot samme punkt forrige uke.
                    </>
                ) : (
                    <>Ukene dine, side om side. Denne uken er den framhevede.</>
                )}
            </p>
            <WeekBars weeks={weeks} />
            {notice}
        </div>
    );
}
