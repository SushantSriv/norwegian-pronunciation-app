/**
 * A shared exam room: one Durable Object, two candidates, no audio.
 *
 * The real oral exam has two candidates who can hear each other, and the
 * conversation task is a fifth to a third of it. The app cannot supply a second
 * candidate, but two people with the app open can supply each other — and this
 * is the smallest thing that lets them find each other.
 *
 * WHAT IT DOES: hands out a seat and a shared seed, relays WebRTC signalling
 * between the two browsers so they can open a direct audio connection, and
 * keeps the one piece of state both screens have to agree on — which segment
 * the pair is on. Once the browsers are connected the voices go straight
 * between them. Nothing about the conversation passes through here.
 *
 * WHAT IT DOES NOT DO, and cannot: hold audio, hold transcripts, hold names, or
 * know who either person is. A signalling blob is relayed without being parsed
 * and without being stored. Speaking time is a number of milliseconds each
 * client reports about itself.
 *
 * THAT LAST ONE IS TRUSTED ON PURPOSE. A client could claim it spoke for ten
 * minutes. There is no leaderboard here and no ranking of any kind — a mode
 * whose whole point is that it refuses to grade you has nothing worth lying
 * for — so the number is bounded against the absurd and otherwise believed. It
 * is a pair checking «er vi begge aktive?», not a score.
 *
 * COST. Durable Objects are on the Workers free plan. An idle room hibernates
 * and is billed nothing, incoming WebSocket messages are billed at a twentieth
 * of a request each, and a rehearsal is a few hundred messages. See
 * README.md in this directory.
 */
import {
    MAX_MESSAGES_PER_SECOND,
    MAX_SEATS,
    MAX_SESSION_MS,
    makeCode,
    makeSeed,
    normaliseCode,
    parseClientMessage,
    ROOM_TTL_MS,
    SEATS,
    validCode,
    validNivaa,
    type RoomNivaa,
    type Seat,
    type ServerMessage,
} from '../src/utils/roomProtocol';

// ---------------------------------------------------------------------------
// The slice of the runtime this uses, typed here so the worker compiles with
// the app and needs no @cloudflare/workers-types dependency.
// ---------------------------------------------------------------------------

interface WebSocketLike {
    accept(): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
    addEventListener(type: 'close' | 'error', handler: () => void): void;
}

interface WebSocketPairLike {
    0: WebSocketLike;
    1: WebSocketLike;
}

interface DurableStorage {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    deleteAll(): Promise<void>;
}

interface DurableState {
    storage: DurableStorage;
}

export interface RoomEnv {
    ALLOWED_ORIGINS?: string;
    ROOM: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(request: Request): Promise<Response> };
    };
}

interface Occupant {
    seat: Seat;
    socket: WebSocketLike;
    ready: boolean;
    spokeMs: number;
    /** Sliding window for the message-rate limit. */
    stamps: number[];
}

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

export class ExamRoom {
    private readonly state: DurableState;
    private occupants: Occupant[] = [];
    private seed: number | null = null;
    private nivaa: RoomNivaa | null = null;
    private index = 0;
    private openedAt = 0;

    constructor(state: DurableState) {
        this.state = state;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const code = normaliseCode(url.searchParams.get('code') ?? '');
        if (!validCode(code)) return new Response('bad code', { status: 400 });

        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected websocket', { status: 426 });
        }

        // A room that has been sitting unused has nothing worth resuming.
        const openedAt = (await this.state.storage.get<number>('openedAt')) ?? 0;
        const now = Date.now();
        if (openedAt && now - openedAt > ROOM_TTL_MS) {
            await this.state.storage.deleteAll();
            this.occupants = [];
            this.seed = null;
            this.nivaa = null;
            this.index = 0;
        }

        if (this.occupants.length >= MAX_SEATS) {
            return new Response('room full', { status: 409 });
        }

        if (this.seed === null) {
            this.seed =
                (await this.state.storage.get<number>('seed')) ??
                makeSeed(bytes => crypto.getRandomValues(bytes));
            await this.state.storage.put('seed', this.seed);
        }
        // The level belongs to the room, not to whoever just arrived: the two
        // candidates have to sit the same exam, and the three levels are
        // genuinely different exams. Whoever opened the room decided.
        if (this.nivaa === null) {
            const stored = await this.state.storage.get<string>('nivaa');
            const asked = url.searchParams.get('nivaa');
            this.nivaa = validNivaa(stored) ? stored : validNivaa(asked) ? asked : 'A2-B1';
            await this.state.storage.put('nivaa', this.nivaa);
        }

        if (!this.openedAt) {
            this.openedAt = openedAt || now;
            await this.state.storage.put('openedAt', this.openedAt);
        }

        const taken = new Set(this.occupants.map(occupant => occupant.seat));
        const seat = SEATS.find(candidate => !taken.has(candidate));
        if (!seat) return new Response('room full', { status: 409 });

        const pair = new (globalThis as unknown as { WebSocketPair: new () => WebSocketPairLike })
            .WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();

        const occupant: Occupant = { seat, socket: server, ready: false, spokeMs: 0, stamps: [] };
        this.occupants.push(occupant);

        this.send(occupant, { t: 'joined', seat, seed: this.seed, code, nivaa: this.nivaa });
        if (this.index > 0) this.send(occupant, { t: 'advance', index: this.index });
        this.announce();

        server.addEventListener('message', event => this.onMessage(occupant, event.data));
        server.addEventListener('close', () => this.leave(occupant));
        server.addEventListener('error', () => this.leave(occupant));

        return new Response(null, {
            status: 101,
            // The runtime reads this back off the response; it is not a header.
            webSocket: client,
        } as ResponseInit & { webSocket: WebSocketLike });
    }

    // -----------------------------------------------------------------------

    private onMessage(occupant: Occupant, data: unknown): void {
        if (!this.withinRate(occupant)) {
            this.send(occupant, { t: 'error', reason: 'for mange meldinger' });
            return;
        }
        if (this.openedAt && Date.now() - this.openedAt > MAX_SESSION_MS) {
            this.send(occupant, { t: 'error', reason: 'rommet er utløpt' });
            occupant.socket.close(1000, 'expired');
            return;
        }

        const parsed = parseClientMessage(data);
        if (!parsed.ok) {
            this.send(occupant, { t: 'error', reason: parsed.reason });
            return;
        }

        const message = parsed.message;
        switch (message.t) {
            case 'signal':
                // Relayed without being read. The server has no business
                // knowing what is in an SDP blob, and parsing it would be a
                // place for the connection to break for no benefit.
                for (const other of this.occupants) {
                    if (other === occupant) continue;
                    this.send(other, { t: 'signal', from: occupant.seat, payload: message.payload });
                }
                return;

            case 'ready':
                occupant.ready = message.ready;
                this.announce();
                return;

            case 'advance':
                // Either seat may move the pair on, and the room keeps the
                // furthest. A candidate whose tab reconnected mid-session must
                // not be able to drag their partner backwards through a task
                // they have already answered.
                if (message.index > this.index) {
                    this.index = message.index;
                    void this.state.storage.put('index', this.index);
                    this.broadcast({ t: 'advance', index: this.index });
                }
                return;

            case 'spoke':
                // Monotonic: a total that goes down is a bug or a lie, and
                // either way the earlier number was the true one.
                if (message.ms > occupant.spokeMs) {
                    occupant.spokeMs = message.ms;
                    this.broadcast({ t: 'spoke', ms: this.spoken() });
                }
                return;
        }
    }

    private withinRate(occupant: Occupant): boolean {
        const now = Date.now();
        occupant.stamps = occupant.stamps.filter(stamp => now - stamp < 1000);
        if (occupant.stamps.length >= MAX_MESSAGES_PER_SECOND) return false;
        occupant.stamps.push(now);
        return true;
    }

    private leave(occupant: Occupant): void {
        this.occupants = this.occupants.filter(other => other !== occupant);
        this.announce();
    }

    private spoken(): Record<string, number> {
        const out: Record<string, number> = {};
        for (const occupant of this.occupants) out[occupant.seat] = occupant.spokeMs;
        return out;
    }

    private announce(): void {
        const ready: Record<string, boolean> = {};
        for (const occupant of this.occupants) ready[occupant.seat] = occupant.ready;
        this.broadcast({
            t: 'room',
            seats: this.occupants.map(occupant => occupant.seat),
            ready,
        });
    }

    private broadcast(message: ServerMessage): void {
        for (const occupant of this.occupants) this.send(occupant, message);
    }

    private send(occupant: Occupant, message: ServerMessage): void {
        try {
            occupant.socket.send(JSON.stringify(message));
        } catch {
            // The socket went away between the check and the send; the close
            // handler will tidy up.
        }
    }
}

// ---------------------------------------------------------------------------
// The worker in front of it
// ---------------------------------------------------------------------------

const corsFor = (request: Request, env: RoomEnv): Record<string, string> => {
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') ?? '';
    return {
        'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
    };
};

export default {
    async fetch(request: Request, env: RoomEnv): Promise<Response> {
        const url = new URL(request.url);
        const cors = corsFor(request, env);

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

        // Ask for a fresh code. Doing this here rather than in the browser
        // means a code is never in use before it is handed out.
        if (url.pathname === '/room/new') {
            const code = makeCode(bytes => crypto.getRandomValues(bytes));
            return new Response(JSON.stringify({ code }), {
                headers: { ...cors, 'Content-Type': 'application/json' },
            });
        }

        if (url.pathname === '/room') {
            const code = normaliseCode(url.searchParams.get('code') ?? '');
            if (!validCode(code)) return new Response('bad code', { status: 400, headers: cors });
            const room = env.ROOM.get(env.ROOM.idFromName(code));
            return room.fetch(request);
        }

        return new Response('not found', { status: 404, headers: cors });
    },
};
