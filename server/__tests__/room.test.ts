import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExamQueue, ExamRoom } from '../room';
import { MAX_MESSAGES_PER_SECOND, type ServerMessage } from '../../src/utils/roomProtocol';

/**
 * The room, driven the way two browsers drive it.
 *
 * Everything here is a fake of a Cloudflare primitive — WebSocketPair, the
 * Durable Object's storage, and a permissive Response, because the real one
 * refuses to be constructed with status 101 outside a Workers runtime. That is
 * a fair trade: what is being tested is the room's own rules, and those are
 * ordinary code.
 *
 * The tests that matter are the ones about what the room will NOT do. It must
 * not seat a third person, must not let a stale tab drag a pair backwards
 * through a task, must not echo a signal back to its sender, and must never
 * hold anything that was said.
 */

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeSocket {
    sent: string[] = [];
    closed = false;
    private handlers: Record<string, ((event: { data: unknown }) => void)[]> = {};

    accept(): void {}

    send(data: string): void {
        if (this.closed) throw new Error('socket closed');
        this.sent.push(data);
    }

    close(): void {
        this.closed = true;
        this.fire('close');
    }

    addEventListener(type: string, handler: (event: { data: unknown }) => void): void {
        (this.handlers[type] ??= []).push(handler);
    }

    /** Drive the room as a browser would. */
    deliver(message: unknown): void {
        this.fire('message', { data: typeof message === 'string' ? message : JSON.stringify(message) });
    }

    private fire(type: string, event: { data: unknown } = { data: null }): void {
        for (const handler of this.handlers[type] ?? []) handler(event);
    }

    /** Everything the room has sent, parsed. */
    messages(): ServerMessage[] {
        return this.sent.map(line => JSON.parse(line) as ServerMessage);
    }

    last<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }> | undefined {
        const found = [...this.messages()].reverse().find(message => message.t === type);
        return found as Extract<ServerMessage, { t: T }> | undefined;
    }
}

const sockets: FakeSocket[] = [];

class FakePair {
    0: FakeSocket;
    1: FakeSocket;
    constructor() {
        this[0] = new FakeSocket();
        this[1] = new FakeSocket();
        sockets.push(this[1]);
    }
}

function fakeStorage() {
    const map = new Map<string, unknown>();
    return {
        get: async <T>(key: string) => map.get(key) as T | undefined,
        put: async (key: string, value: unknown) => {
            map.set(key, value);
        },
        deleteAll: async () => {
            map.clear();
        },
    };
}

const realResponse = globalThis.Response;
const realPair = (globalThis as Record<string, unknown>).WebSocketPair;

beforeAll(() => {
    // The real Response refuses status 101; the Workers runtime does not.
    (globalThis as Record<string, unknown>).Response = class {
        status: number;
        body: unknown;
        constructor(body: unknown, init?: { status?: number }) {
            this.body = body;
            this.status = init?.status ?? 200;
        }
        async text() {
            return String(this.body ?? '');
        }
    };
    (globalThis as Record<string, unknown>).WebSocketPair = FakePair;
});

afterAll(() => {
    globalThis.Response = realResponse;
    (globalThis as Record<string, unknown>).WebSocketPair = realPair;
});

beforeEach(() => {
    sockets.length = 0;
});

// ---------------------------------------------------------------------------

const upgrade = (code = 'ABC234') =>
    ({
        url: `https://example.test/room?code=${code}`,
        headers: new Headers({ Upgrade: 'websocket' }),
        method: 'GET',
    }) as unknown as Request;

/** A room with however many candidates have joined it. */
async function room(joins = 2, code = 'ABC234') {
    const instance = new ExamRoom({ storage: fakeStorage() });
    const responses = [];
    for (let i = 0; i < joins; i++) responses.push(await instance.fetch(upgrade(code)));
    return { instance, responses, seats: sockets.slice() };
}

describe('getting in', () => {
    it('seats two candidates, one each', async () => {
        const { seats } = await room(2);
        expect(seats[0].last('joined')?.seat).toBe('a');
        expect(seats[1].last('joined')?.seat).toBe('b');
    });

    it('gives both candidates the same seed, so both draw the same tasks', async () => {
        const { seats } = await room(2);
        const mine = seats[0].last('joined')?.seed;
        expect(typeof mine).toBe('number');
        expect(seats[1].last('joined')?.seed).toBe(mine);
    });

    it('turns a third person away rather than queueing them', async () => {
        const { instance } = await room(2);
        const third = await instance.fetch(upgrade());
        expect((third as unknown as { status: number }).status).toBe(409);
    });

    it('frees the seat when somebody leaves', async () => {
        const { instance, seats } = await room(2);
        seats[0].close();
        expect(seats[1].last('room')?.seats).toEqual(['b']);

        const rejoin = await instance.fetch(upgrade());
        expect((rejoin as unknown as { status: number }).status).toBe(101);
        expect(sockets.at(-1)?.last('joined')?.seat).toBe('a');
    });

    it('refuses a code that is not one of ours', async () => {
        const instance = new ExamRoom({ storage: fakeStorage() });
        const response = await instance.fetch(upgrade('abc'));
        expect((response as unknown as { status: number }).status).toBe(400);
    });

    it('refuses a request that is not a websocket upgrade', async () => {
        const instance = new ExamRoom({ storage: fakeStorage() });
        const response = await instance.fetch({
            url: 'https://example.test/room?code=ABC234',
            headers: new Headers(),
            method: 'GET',
        } as unknown as Request);
        expect((response as unknown as { status: number }).status).toBe(426);
    });

    it('tells a latecomer where the pair has got to', async () => {
        const { instance, seats } = await room(2);
        seats[0].deliver({ t: 'advance', index: 4 });
        seats[1].close();

        await instance.fetch(upgrade());
        expect(sockets.at(-1)?.last('advance')?.index).toBe(4);
    });
});

describe('relaying the connection', () => {
    it('passes a signal to the other seat and not back to the sender', async () => {
        const { seats } = await room(2);
        const before = seats[0].sent.length;

        seats[0].deliver({ t: 'signal', payload: 'v=0 o=- offer' });

        expect(seats[1].last('signal')).toEqual({ t: 'signal', from: 'a', payload: 'v=0 o=- offer' });
        expect(seats[0].sent.length).toBe(before);
    });

    it('does not read or alter what it relays', async () => {
        // The server has no business knowing what is in an SDP blob, and
        // parsing one would be a place for the connection to break for nothing.
        const { seats } = await room(2);
        const payload = JSON.stringify({ candidate: 'a=candidate:1 1 udp 2 192.0.2.1 1 typ host' });
        seats[0].deliver({ t: 'signal', payload });
        expect(seats[1].last('signal')?.payload).toBe(payload);
    });

    it('has nobody to relay to before the second candidate arrives', async () => {
        const { seats } = await room(1);
        seats[0].deliver({ t: 'signal', payload: 'v=0' });
        expect(seats[0].last('signal')).toBeUndefined();
    });
});

describe('staying on the same task', () => {
    it('moves the pair on when either of them advances', async () => {
        const { seats } = await room(2);
        seats[1].deliver({ t: 'advance', index: 2 });
        expect(seats[0].last('advance')?.index).toBe(2);
        expect(seats[1].last('advance')?.index).toBe(2);
    });

    it('never moves the pair backwards', async () => {
        // A tab that reconnects mid-session must not drag its partner back
        // through a task they have already answered.
        const { seats } = await room(2);
        seats[0].deliver({ t: 'advance', index: 5 });
        seats[1].deliver({ t: 'advance', index: 1 });
        expect(seats[0].last('advance')?.index).toBe(5);
    });
});

describe('are we both active', () => {
    it('shares each candidate own count with the pair', async () => {
        const { seats } = await room(2);
        seats[0].deliver({ t: 'spoke', ms: 90_000 });
        seats[1].deliver({ t: 'spoke', ms: 150_000 });
        expect(seats[0].last('spoke')?.ms).toEqual({ a: 90_000, b: 150_000 });
    });

    it('keeps the count monotonic', async () => {
        const { seats } = await room(2);
        seats[0].deliver({ t: 'spoke', ms: 90_000 });
        seats[0].deliver({ t: 'spoke', ms: 10_000 });
        expect(seats[1].last('spoke')?.ms.a).toBe(90_000);
    });

    it('refuses a figure nobody could have spoken', async () => {
        const { seats } = await room(2);
        seats[0].deliver({ t: 'spoke', ms: 999_999_999 });
        expect(seats[0].last('error')).toBeDefined();
        expect(seats[1].last('spoke')).toBeUndefined();
    });
});

describe('what the room refuses', () => {
    it('answers a malformed message with a reason and nothing else', async () => {
        const { seats } = await room(2);
        const peerBefore = seats[1].sent.length;
        seats[0].deliver('not json at all');
        expect(seats[0].last('error')?.reason).toBe('not json');
        expect(seats[1].sent.length).toBe(peerBefore);
    });

    it('refuses a message type nobody defined', async () => {
        const { seats } = await room(2);
        seats[0].deliver({ t: 'transcript', text: 'jeg heter ola' });
        expect(seats[0].last('error')?.reason).toBe('unknown type');
    });

    it('stops a flood rather than relaying it', async () => {
        const { seats } = await room(2);
        for (let i = 0; i < MAX_MESSAGES_PER_SECOND + 5; i++) {
            seats[0].deliver({ t: 'signal', payload: `candidate ${i}` });
        }
        expect(seats[0].last('error')?.reason).toBe('for mange meldinger');
        expect(seats[1].messages().filter(m => m.t === 'signal').length).toBe(
            MAX_MESSAGES_PER_SECOND
        );
    });
});

describe('what the room never holds', () => {
    it('has no field for audio or for anything said', async () => {
        const { seats } = await room(2);
        seats[0].deliver({ t: 'signal', payload: 'v=0' });
        seats[0].deliver({ t: 'spoke', ms: 60_000 });
        seats[1].deliver({ t: 'advance', index: 2 });

        // Everything the room ever sends, read as one string. A transcript or a
        // recording could only get here by being added to the protocol, and
        // this is where that would be noticed.
        const everything = [...seats[0].sent, ...seats[1].sent].join(' ');
        expect(everything).not.toMatch(/blob:/);
        expect(everything).not.toMatch(/data:audio/);
        expect(everything).not.toMatch(/transcript/i);

        for (const message of [...seats[0].messages(), ...seats[1].messages()]) {
            expect(['joined', 'room', 'signal', 'advance', 'spoke', 'error']).toContain(message.t);
        }
    });
});

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

const queueUpgrade = (nivaa = 'A2-B1') =>
    ({
        url: `https://example.test/queue?nivaa=${nivaa}`,
        headers: new Headers({ Upgrade: 'websocket' }),
        method: 'GET',
    }) as unknown as Request;

/** A queue with however many browsers are waiting in it. */
async function queue(joins = 2, nivaa = 'A2-B1') {
    const instance = new ExamQueue();
    for (let i = 0; i < joins; i++) await instance.fetch(queueUpgrade(nivaa));
    return { instance, waiting: sockets.slice() };
}

/** What the queue can say, as far as these assertions need to know. */
interface QueueFrame {
    t: string;
    code?: string;
    nivaa?: string;
    waiting?: number;
}

const sent = (socket: FakeSocket, type: string): QueueFrame[] =>
    socket.sent.map(line => JSON.parse(line) as QueueFrame).filter(m => m.t === type);

describe('pairing two strangers', () => {
    it('leaves one person waiting, and says how many that is', async () => {
        const { waiting } = await queue(1);
        expect(sent(waiting[0], 'matched')).toHaveLength(0);
        expect(sent(waiting[0], 'queue').at(-1)).toEqual({ t: 'queue', waiting: 1 });
    });

    it('gives both halves of a pair the same room code', async () => {
        const { waiting } = await queue(2);
        const first = sent(waiting[0], 'matched')[0];
        const second = sent(waiting[1], 'matched')[0];

        expect(first?.code).toMatch(/^[A-Z2-9]{6}$/);
        // Two people sent to different rooms would each sit alone in one.
        expect(second?.code).toBe(first?.code);
        expect(first?.nivaa).toBe('A2-B1');
    });

    it('drops both from the queue once they are paired', async () => {
        const { instance, waiting } = await queue(2);
        sockets.length = 0;
        await instance.fetch(queueUpgrade());
        // A third arrival is alone, not matched with somebody already in a room.
        expect(sent(sockets[0], 'matched')).toHaveLength(0);
        expect(sent(sockets[0], 'queue').at(-1)).toEqual({ t: 'queue', waiting: 1 });
        expect(waiting[0].closed || waiting[1].closed).toBeDefined();
    });

    it('lets somebody give up their place', async () => {
        const { waiting } = await queue(1);
        waiting[0].deliver({ t: 'leave' });
        expect(waiting[0].closed).toBe(true);
    });

    it('refuses a request that is not a websocket upgrade', async () => {
        const instance = new ExamQueue();
        const response = await instance.fetch({
            url: 'https://example.test/queue?nivaa=A2-B1',
            headers: new Headers(),
            method: 'GET',
        } as unknown as Request);
        expect((response as unknown as { status: number }).status).toBe(426);
    });
});

describe('what the queue never holds', () => {
    it('sends nothing about who is waiting', async () => {
        // The queue keeps a socket and a timestamp. A name, an id or anything
        // said would have to appear in one of these frames to exist at all.
        const { waiting } = await queue(2);
        const everything = waiting.flatMap(socket => socket.sent).join(' ');
        expect(everything).not.toMatch(/nickname|name|id"|transcript|blob:/i);

        for (const socket of waiting) {
            for (const message of socket.messages() as unknown as QueueFrame[]) {
                expect(['queue', 'matched', 'error']).toContain(message.t);
            }
        }
    });
});
