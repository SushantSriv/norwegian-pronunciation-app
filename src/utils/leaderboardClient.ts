/**
 * The one place in this app that talks to a leaderboard server.
 *
 * OFF BY DEFAULT. Without VITE_LEADERBOARD_URL at build time there is no
 * endpoint, `leaderboardEnabled` is false, and nothing here ever opens a
 * connection — the community screen falls back to showing the learner their
 * own points. The hosted GitHub Pages build ships that way, so the app keeps
 * its promise that nothing leaves the device unless the operator opted in.
 *
 * WHAT IS SENT, exhaustively: a nickname, an anonymous id, a bearer secret,
 * point events as {id, kind, points, timestamp, level}, and an improvement
 * figure. That is the whole payload, and buildSyncPayload is the only thing
 * that builds it — so the test asserting that no phrase, transcript, word,
 * recording or score sample can appear in it is checking the real thing.
 *
 * Recordings never come near this file. There is no code path from the
 * microphone to here: the point engine upstream takes numbers out of an
 * already-graded attempt and the phrase text it uses for anti-grinding stays
 * in localStorage.
 */
import type { Identity } from './identity';
import {
    CLOCK_SKEW_MS,
    MAX_EVENT_AGE_MS,
    MAX_EVENTS_PER_SYNC,
    type SubmittedEvent,
} from './leaderboardRules';
import type { Improvement, PointEvent } from './learningPoints';

const ENDPOINT: string | undefined = import.meta.env.VITE_LEADERBOARD_URL;

/** Whether this build has a leaderboard server at all. */
export const leaderboardEnabled = Boolean(ENDPOINT);

export type BoardScope = 'weekly' | 'alltime' | 'improved';

export interface BoardRow {
    rank: number;
    /** Anonymous id, used only to spot yourself in the list. */
    id: string;
    nickname: string;
    /** Points for weekly and all-time; tenths of a score point for improved. */
    value: number;
    level: string | null;
}

export interface Standing {
    rank: number | null;
    value: number;
    /** Rank at the last sync, so the UI can show movement. */
    previousRank: number | null;
    /** Points needed to pass the learner one place above. */
    toNext: number | null;
}

export interface Board {
    scope: BoardScope;
    level: string;
    rows: BoardRow[];
    you: Standing | null;
    /** Total ranked learners, so "#17 of 240" is possible. */
    total: number;
}

export interface SyncPayload {
    nickname: string;
    improvement: { delta: number; samples: number; baseline: number } | null;
    events: SubmittedEvent[];
}

export interface SyncResult {
    /** Ids the server took. Anything missing was refused and stays pending. */
    accepted: string[];
    rejected: { id: string; reason: string }[];
    standing: Standing | null;
    /** The name the server settled on, which may differ after a collision. */
    nickname: string;
}

/**
 * Build the sync body.
 *
 * Pure and exported so the privacy guarantee is testable rather than merely
 * asserted in a comment. Every field is copied explicitly; nothing is spread
 * in from a larger object, because a spread is how a recording ends up on a
 * server two refactors from now.
 *
 * The learner's level is not sent. The server works it out from the events it
 * has already accepted, which is one fewer client-supplied number to trust.
 */
export function buildSyncPayload(
    nickname: string,
    improvement: Improvement | null,
    pending: readonly PointEvent[]
): SyncPayload {
    const events: SubmittedEvent[] = pending.map(event => ({
        id: event.id,
        kind: event.kind,
        points: event.points,
        at: event.at,
        ...(event.cefr ? { cefr: event.cefr } : {}),
    }));

    return {
        nickname,
        improvement: improvement
            ? {
                  delta: improvement.delta,
                  samples: improvement.samples,
                  baseline: improvement.baseline,
              }
            : null,
        events,
    };
}

/**
 * Split what is waiting into what is worth sending and what never will be.
 *
 * Two things go wrong without this, and both were found by running it. A
 * learner who practises offline for a fortnight has a backlog whose OLDEST
 * events come first — send the first 200 of those and every one is refused as
 * too old, so their recent points never arrive at all. And events past the
 * server's age limit can never be accepted by anybody, so carrying them in
 * every future request forever is pure waste.
 *
 * So: give up on the stale ones locally, and send the most recent of the rest.
 */
export function partitionForSync(
    pending: readonly PointEvent[],
    now: number
): { sendable: PointEvent[]; stale: PointEvent[] } {
    const floor = now - MAX_EVENT_AGE_MS;
    const stale: PointEvent[] = [];
    const fresh: PointEvent[] = [];

    for (const event of pending) {
        // A clock that ran fast could have stamped an event slightly ahead of
        // now; the server allows for that, so this must too.
        if (event.at < floor || event.at > now + CLOCK_SKEW_MS) stale.push(event);
        else fresh.push(event);
    }

    // Newest first is what matters when there are more than one request's
    // worth: this week's points are the ones the learner is waiting to see.
    fresh.sort((a, b) => b.at - a.at);
    return { sendable: fresh.slice(0, MAX_EVENTS_PER_SYNC), stale };
}

class LeaderboardOffline extends Error {}

const request = async <T,>(path: string, init: RequestInit): Promise<T> => {
    if (!ENDPOINT) throw new LeaderboardOffline('No leaderboard endpoint is configured.');
    const response = await fetch(`${ENDPOINT.replace(/\/$/, '')}${path}`, init);
    if (!response.ok) throw new Error(`Leaderboard responded ${response.status}`);
    return (await response.json()) as T;
};

/** Send what has not been sent, and learn where the learner now stands. */
export async function syncCommunity(
    identity: Identity,
    payload: SyncPayload
): Promise<SyncResult> {
    return request<SyncResult>('/v1/sync', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${identity.secret}`,
            'x-learner-id': identity.id,
        },
        body: JSON.stringify(payload),
    });
}

export async function fetchBoard(
    scope: BoardScope,
    level: string,
    identity: Identity | null
): Promise<Board> {
    const query = new URLSearchParams({ scope, level });
    if (identity) query.set('me', identity.id);
    return request<Board>(`/v1/board?${query}`, { method: 'GET' });
}
