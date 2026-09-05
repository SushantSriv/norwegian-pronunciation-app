/**
 * The learner's points, their name, and the trip to the leaderboard.
 *
 * Sits between the practice session and the community screen. It owns the
 * ledger, guards against paying for the same attempt twice, and — only if a
 * server is configured and the learner has chosen a name — syncs.
 *
 * The ordering that matters: points are computed from the profile as it was
 * BEFORE the attempt was folded in, because mastery and personal bests are
 * both questions about what changed. App.tsx therefore awards first and
 * remembers second, and both sides key their de-duplication on the attempt
 * object itself, so both see the same "before".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    allTimePoints,
    awardAttempt,
    awardSession,
    currentStreak,
    dominantLevel,
    improvement,
    league,
    loadLedger,
    markSent,
    pendingEvents,
    saveLedger,
    toNextLeague,
    weeklyPoints,
    type AttemptPoints,
    type Ledger,
    type PointLine,
    type PointsAward,
    type SessionPoints,
} from '../utils/learningPoints';
import {
    buildSyncPayload,
    leaderboardEnabled,
    partitionForSync,
    syncCommunity,
    type Standing,
} from '../utils/leaderboardClient';
import {
    createIdentity,
    forgetIdentity,
    loadIdentity,
    saveIdentity,
    type Identity,
} from '../utils/identity';

/** What a run has been worth so far, kept for the results screen. */
export interface RunTally {
    id: string;
    points: number;
    /** One entry per kind earned, so the summary reads as a breakdown. */
    lines: PointLine[];
}

/**
 * Fold new award lines into a run's running tally.
 *
 * Merged by kind rather than appended: after ten phrases a learner does not
 * want ten "Fullført forsøk" rows, they want to know that attempts were worth
 * 50 and personal bests were worth 33.
 */
function mergeLines(existing: PointLine[], incoming: PointLine[]): PointLine[] {
    const merged = existing.map(line => ({ ...line }));
    for (const line of incoming) {
        const match = merged.find(one => one.kind === line.kind);
        if (match) match.points += line.points;
        else merged.push({ ...line });
    }
    return merged.sort((a, b) => b.points - a.points);
}

export interface CommunityState {
    identity: Identity | null;
    ledger: Ledger;
    weekly: number;
    allTime: number;
    streak: number;
    league: ReturnType<typeof league>;
    next: ReturnType<typeof toNextLeague>;
    improvement: ReturnType<typeof improvement>;
    level: ReturnType<typeof dominantLevel>;
    /** What the last attempt or run was worth, for the toast. */
    lastAward: PointsAward | null;
    /** Points earned in the current run, and which run that is. */
    run: RunTally;
    /** Where the server last said the learner stood. */
    standing: Standing | null;
    syncing: boolean;
    syncError: string | null;
}

export function useCommunity() {
    const [ledger, setLedger] = useState<Ledger>(loadLedger);
    const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
    const [lastAward, setLastAward] = useState<PointsAward | null>(null);
    const [standing, setStanding] = useState<Standing | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [run, setRun] = useState<RunTally>({ id: '', points: 0, lines: [] });

    /** Attempts and runs already paid for, by object identity. */
    const paidAttempt = useRef<object | null>(null);
    const paidRun = useRef<string | null>(null);
    /**
     * The ledger as of right now, not as of the last commit.
     *
     * An attempt and the end of a run can both be priced in the same tick, and
     * the second would otherwise read the state the first had not yet flushed
     * and overwrite its points.
     */
    const live = useRef(ledger);

    const commit = useCallback((next: Ledger, earned: PointsAward, runId: string) => {
        live.current = next;
        setLedger(next);
        if (earned.total > 0) setLastAward(earned);
        // Points earned since this run began, for the results screen. Keyed by
        // the run so starting another one begins the count again.
        setRun(current => {
            const base = current.id === runId ? current : { id: runId, points: 0, lines: [] };
            return {
                id: runId,
                points: base.points + earned.total,
                lines: mergeLines(base.lines, earned.lines),
            };
        });
    }, []);

    useEffect(() => {
        saveLedger(ledger);
    }, [ledger]);

    /**
     * Pay for one graded attempt.
     *
     * @param token The attempt object, used as its own identity.
     * @param ready False while the recording is still being analysed, so this
     * matches when the profile is written and an attempt is priced once.
     */
    const award = useCallback(
        (token: object | null, input: Omit<AttemptPoints, 'now'>, ready: boolean, runId: string) => {
            if (!token || !ready || paidAttempt.current === token) return;
            paidAttempt.current = token;
            const { ledger: next, award: earned } = awardAttempt(live.current, {
                ...input,
                now: Date.now(),
            });
            commit(next, earned, runId);
        },
        [commit]
    );

    /** Pay for a run that reached its end. */
    const finishRun = useCallback((runId: string, input: Omit<SessionPoints, 'now'>) => {
        if (paidRun.current === runId) return;
        paidRun.current = runId;
        const { ledger: next, award: earned } = awardSession(live.current, {
            ...input,
            now: Date.now(),
        });
        commit(next, earned, runId);
    }, [commit]);

    const clearAward = useCallback(() => setLastAward(null), []);

    // ── Identity ───────────────────────────────────────────────────────
    const join = useCallback((nickname: string) => {
        const created = createIdentity(nickname);
        saveIdentity(created);
        setIdentity(created);
        return created;
    }, []);

    const rename = useCallback((nickname: string) => {
        setIdentity(current => {
            if (!current) return current;
            const updated = { ...current, nickname };
            saveIdentity(updated);
            return updated;
        });
    }, []);

    const leave = useCallback(() => {
        forgetIdentity();
        setIdentity(null);
        setStanding(null);
    }, []);

    // ── Sync ───────────────────────────────────────────────────────────
    const sync = useCallback(async () => {
        if (!leaderboardEnabled || !identity) return;
        const ledgerNow = live.current;
        const now = Date.now();
        const { sendable, stale } = partitionForSync(pendingEvents(ledgerNow), now);

        // Events too old for any server to accept are settled here rather than
        // carried forever. Doing it before the request means a long backlog
        // shrinks even when the network is down.
        if (stale.length) {
            const pruned = markSent(live.current, stale.map(event => event.id));
            live.current = pruned;
            setLedger(pruned);
        }

        setSyncing(true);
        setSyncError(null);
        try {
            const result = await syncCommunity(
                identity,
                buildSyncPayload(
                    identity.nickname,
                    improvement(ledgerNow, now),
                    sendable
                )
            );
            // Rejected events are marked settled too, not just accepted ones.
            // Every rejection the server can give is permanent for that event —
            // it is too old, or over a ceiling, or the day it belongs to is
            // already full — so retrying it forever would mean every future
            // sync carried the same dead payload.
            const settled = [...result.accepted, ...result.rejected.map(one => one.id)];
            const marked = markSent(live.current, settled);
            live.current = marked;
            setLedger(marked);
            setStanding(result.standing);
            // The server has the last word on the name, since it is the only
            // thing that can see a collision with somebody else's.
            if (result.nickname && result.nickname !== identity.nickname) {
                rename(result.nickname);
            }
        } catch (error) {
            setSyncError(error instanceof Error ? error.message : 'Could not reach the leaderboard.');
        } finally {
            setSyncing(false);
        }
    }, [identity, rename]);

    const now = Date.now();
    const allTime = allTimePoints(ledger);

    const state: CommunityState = {
        identity,
        ledger,
        weekly: weeklyPoints(ledger, now),
        allTime,
        streak: currentStreak(ledger, now),
        league: league(allTime),
        next: toNextLeague(allTime),
        improvement: improvement(ledger, now),
        level: dominantLevel(ledger),
        lastAward,
        run,
        standing,
        syncing,
        syncError,
    };

    return { ...state, award, finishRun, clearAward, join, rename, leave, sync };
}
