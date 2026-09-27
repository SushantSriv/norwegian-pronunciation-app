/**
 * The rules a shared exam room runs by.
 *
 * Imported by BOTH the browser and the Durable Object, for the same reason
 * `leaderboardRules.ts` is: two copies of a rule drift, and the copy that
 * drifts is always the one on the server. Everything the room will accept is
 * decided here once.
 *
 * WHAT THE ROOM CARRIES, exhaustively: a seat letter, a seed, which segment
 * the pair is on, how long each person has been speaking, and opaque WebRTC
 * signalling blobs. That is the whole list.
 *
 * WHAT IT NEVER CARRIES: audio, transcripts, names, or anything either
 * candidate said. The voices go peer to peer between the two browsers and
 * never touch the server, and the transcript of what you said never leaves
 * your own device. The room could not store a recording if it wanted to,
 * because one is never sent to it.
 *
 * WHAT A ROOM CANNOT HIDE, and the joining screen says so: WebRTC works by
 * telling the other browser how to reach yours, so your IP address is visible
 * to the person you are practising with. That is how a direct connection is
 * made, it is not something this app added, and it is the reason a room code
 * should go to somebody you meant to practise with rather than be posted
 * publicly.
 */

export type Seat = 'a' | 'b';

/** Two candidates, because the exam is for two candidates. */
export const SEATS: Seat[] = ['a', 'b'];

/**
 * The levels, written out here rather than imported.
 *
 * The Durable Object validates against this list, and importing the task data
 * to get it would pull every published prompt into the worker bundle for the
 * sake of three strings. `Nivaa` in the app is checked against this at compile
 * time by roomProtocol.test.ts, so the two cannot drift.
 */
export const ROOM_NIVAAER = ['A1-A2', 'A2-B1', 'B1-B2'] as const;
export type RoomNivaa = (typeof ROOM_NIVAAER)[number];

export const validNivaa = (value: unknown): value is RoomNivaa =>
    typeof value === 'string' && (ROOM_NIVAAER as readonly string[]).includes(value);

/**
 * Room codes.
 *
 * Six characters from an alphabet with no 0/O or 1/I/L, because these get read
 * aloud over a phone. 32^6 is about a billion, which is far more than enough
 * for rooms that live for an hour — and the code is not a secret worth
 * attacking, since the worst a guesser can do is join a practice conversation
 * and be heard leaving it.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export const validCode = (code: string): boolean => CODE_PATTERN.test(code);

/** Normalise what somebody typed: people type lower case and paste spaces. */
export const normaliseCode = (input: string): string =>
    input
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, CODE_LENGTH);

/**
 * Make a code from cryptographic randomness.
 *
 * Rejection sampling rather than a modulo: the alphabet is 31 characters and
 * 256 is not a multiple of it, so a modulo would make some letters likelier
 * than others. It costs nothing here and the biased version is the kind of
 * thing that is never noticed.
 */
export function makeCode(random: (bytes: Uint8Array) => void): string {
    let code = '';
    const buffer = new Uint8Array(CODE_LENGTH * 2);
    while (code.length < CODE_LENGTH) {
        random(buffer);
        for (const byte of buffer) {
            if (code.length === CODE_LENGTH) break;
            if (byte >= 248) continue; // 248 = 31 * 8, the largest usable multiple
            code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        }
    }
    return code;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** A room is two candidates. A third is turned away rather than queued. */
export const MAX_SEATS = 2;

/** An SDP offer with a dozen candidates is a few kilobytes. */
export const MAX_SIGNAL_BYTES = 16_384;

/** Messages per second per connection, over a short window. */
export const MAX_MESSAGES_PER_SECOND = 30;

/** Nothing in this app runs longer than the published exam plus slack. */
export const MAX_SESSION_MS = 60 * 60_000;

/** Nobody speaks for longer than the longest slot plus slack. */
export const MAX_SPOKEN_MS = 15 * 60_000;

/** How long an unused room is kept before it is forgotten. */
export const ROOM_TTL_MS = 3 * 60 * 60_000;

/**
 * The queue.
 *
 * Most people preparing for this exam do not know somebody else preparing for
 * it, so a feature that needs a partner you already have is a feature almost
 * nobody can use. The queue pairs two strangers who picked the same level.
 *
 * WHAT A STRANGER LEARNS ABOUT YOU, and the screen says this before you join
 * rather than after: a direct audio connection is made by each browser telling
 * the other how to reach it, so they see your IP address. That is true of every
 * video call ever made, but it is a different thing with somebody you have
 * never met than with a friend you sent a link to, so it is stated where the
 * decision is made.
 *
 * WHAT THEY DO NOT LEARN: your name, because the app never asks for one; your
 * transcript, which never leaves your own device; or anything you said, because
 * the audio goes between the two browsers and is never recorded by either.
 *
 * Nobody waits for ever. A queue that keeps you hoping is worse than one that
 * says plainly that nobody else is here.
 */
export const QUEUE_TIMEOUT_MS = 3 * 60_000;

/** How long a waiting entry survives without a heartbeat. */
export const QUEUE_STALE_MS = 45_000;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** What a browser sends the queue. */
export type QueueClientMessage =
    /** Still here, still waiting. */
    | { t: 'wait' }
    /** Give up my place. */
    | { t: 'leave' };

/** What the queue sends back. */
export type QueueServerMessage =
    /** How many are waiting at this level, including you. */
    | { t: 'queue'; waiting: number }
    /** Paired. Both sides are told the same code at the same moment. */
    | { t: 'matched'; code: string; nivaa: RoomNivaa }
    | { t: 'error'; reason: string };

export type ClientMessage =
    /** Relayed verbatim to the other seat. The server does not parse it. */
    | { t: 'signal'; payload: string }
    /** This candidate is ready for the session to start. */
    | { t: 'ready'; ready: boolean }
    /** Move the pair to a segment. Either seat may; the room takes the max. */
    | { t: 'advance'; index: number }
    /** How long this candidate has spoken in total, by their own microphone. */
    | { t: 'spoke'; ms: number };

export type ServerMessage =
    | { t: 'joined'; seat: Seat; seed: number; code: string; nivaa: RoomNivaa }
    /** Who is present, and whether they are ready. */
    | { t: 'room'; seats: Seat[]; ready: Record<string, boolean> }
    | { t: 'signal'; from: Seat; payload: string }
    | { t: 'advance'; index: number }
    | { t: 'spoke'; ms: Record<string, number> }
    | { t: 'error'; reason: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const wholeNumber = (value: unknown, max: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/**
 * Parse a message from a client, or say why not.
 *
 * Returns a discriminated result rather than throwing, because a bad message
 * is an ordinary event on a public socket — somebody's tab woke up stale, or
 * somebody is poking at it — and neither deserves a stack trace.
 */
export function parseClientMessage(
    raw: unknown
): { ok: true; message: ClientMessage } | { ok: false; reason: string } {
    if (typeof raw !== 'string') return { ok: false, reason: 'not text' };
    if (raw.length > MAX_SIGNAL_BYTES) return { ok: false, reason: 'too large' };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, reason: 'not json' };
    }
    if (!isObject(parsed)) return { ok: false, reason: 'not an object' };

    switch (parsed.t) {
        case 'signal':
            if (typeof parsed.payload !== 'string') return { ok: false, reason: 'bad signal' };
            if (parsed.payload.length > MAX_SIGNAL_BYTES)
                return { ok: false, reason: 'signal too large' };
            return { ok: true, message: { t: 'signal', payload: parsed.payload } };

        case 'ready':
            if (typeof parsed.ready !== 'boolean') return { ok: false, reason: 'bad ready' };
            return { ok: true, message: { t: 'ready', ready: parsed.ready } };

        case 'advance':
            // An index is a position in a timeline of at most a few dozen
            // segments. Anything larger is not a client this app wrote.
            if (!wholeNumber(parsed.index, 64)) return { ok: false, reason: 'bad index' };
            return { ok: true, message: { t: 'advance', index: parsed.index } };

        case 'spoke':
            if (!wholeNumber(parsed.ms, MAX_SPOKEN_MS)) return { ok: false, reason: 'bad ms' };
            return { ok: true, message: { t: 'spoke', ms: parsed.ms } };

        default:
            return { ok: false, reason: 'unknown type' };
    }
}

/**
 * Parse a message from the room.
 *
 * The browser checks these too. Not because the server is the threat — it is
 * ours — but because a frame from a half-upgraded worker, or a socket that
 * something else answered, must not be able to throw inside an event handler
 * where there is nowhere sensible for the error to go.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
    if (typeof raw !== 'string' || raw.length > MAX_SIGNAL_BYTES * 2) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isObject(parsed)) return null;

    switch (parsed.t) {
        case 'joined':
            return SEATS.includes(parsed.seat as Seat) &&
                typeof parsed.seed === 'number' &&
                typeof parsed.code === 'string' &&
                validNivaa(parsed.nivaa)
                ? {
                      t: 'joined',
                      seat: parsed.seat as Seat,
                      seed: parsed.seed,
                      code: parsed.code,
                      nivaa: parsed.nivaa,
                  }
                : null;

        case 'room':
            return Array.isArray(parsed.seats) && isObject(parsed.ready)
                ? {
                      t: 'room',
                      seats: parsed.seats.filter((value): value is Seat =>
                          SEATS.includes(value as Seat)
                      ),
                      ready: parsed.ready as Record<string, boolean>,
                  }
                : null;

        case 'signal':
            return typeof parsed.payload === 'string' && SEATS.includes(parsed.from as Seat)
                ? { t: 'signal', from: parsed.from as Seat, payload: parsed.payload }
                : null;

        case 'advance':
            return wholeNumber(parsed.index, 64) ? { t: 'advance', index: parsed.index } : null;

        case 'spoke':
            return isObject(parsed.ms)
                ? { t: 'spoke', ms: parsed.ms as Record<string, number> }
                : null;

        case 'error':
            return typeof parsed.reason === 'string'
                ? { t: 'error', reason: parsed.reason.slice(0, 200) }
                : null;

        default:
            return null;
    }
}

export function parseQueueClientMessage(raw: unknown): QueueClientMessage | null {
    if (typeof raw !== 'string' || raw.length > 256) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isObject(parsed)) return null;
    if (parsed.t === 'wait') return { t: 'wait' };
    if (parsed.t === 'leave') return { t: 'leave' };
    return null;
}

export function parseQueueServerMessage(raw: unknown): QueueServerMessage | null {
    if (typeof raw !== 'string' || raw.length > 1024) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isObject(parsed)) return null;

    switch (parsed.t) {
        case 'queue':
            return wholeNumber(parsed.waiting, 10_000) ? { t: 'queue', waiting: parsed.waiting } : null;
        case 'matched':
            return typeof parsed.code === 'string' &&
                validCode(parsed.code) &&
                validNivaa(parsed.nivaa)
                ? { t: 'matched', code: parsed.code, nivaa: parsed.nivaa }
                : null;
        case 'error':
            return typeof parsed.reason === 'string'
                ? { t: 'error', reason: parsed.reason.slice(0, 200) }
                : null;
        default:
            return null;
    }
}

/**
 * A seed both candidates share, so both build the same task set.
 *
 * The two browsers draw their prompts independently; without a shared seed
 * they would draw different ones and the pair would be answering different
 * questions in a conversation task. Thirty-one bits, which is plenty for
 * picking from pools of a handful.
 */
export const makeSeed = (random: (bytes: Uint32Array) => void): number => {
    const buffer = new Uint32Array(1);
    random(buffer);
    return buffer[0] % 0x7fffffff;
};

/**
 * Draw prompts from a seed.
 *
 * Both browsers build their own timeline, and `buildTimeline` asks for a
 * prompt once per pool in a fixed order — so the same seed walks the same
 * sequence on both devices and the pair ends up discussing the same question.
 * Without this they would each draw their own and the conversation task would
 * be two people answering different prompts at each other.
 */
export function seededPick(seed: number): <T>(oppgaver: T[]) => T {
    const next = seededRandom(seed);
    return <T,>(oppgaver: T[]): T => oppgaver[Math.floor(next() * oppgaver.length)];
}

/**
 * A small deterministic generator, so both sides draw identically.
 *
 * Mulberry32: three lines, no dependency, and far better distributed than the
 * `sin` trick that usually turns up in its place. Nothing here is security
 * sensitive — it picks which published question a pair gets.
 */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
