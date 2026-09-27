import { describe, expect, it } from 'vitest';
import {
    CODE_ALPHABET,
    CODE_LENGTH,
    makeCode,
    makeSeed,
    MAX_SIGNAL_BYTES,
    MAX_SPOKEN_MS,
    normaliseCode,
    parseClientMessage,
    parseQueueClientMessage,
    parseQueueServerMessage,
    parseServerMessage,
    ROOM_NIVAAER,
    seededPick,
    seededRandom,
    validCode,
    validNivaa,
    type RoomNivaa,
} from '../roomProtocol';
import type { Nivaa } from '../../data/muntlig/oppgaver';

/**
 * The room's rules, checked from the side an attacker is on.
 *
 * These run in the browser's test suite and the worker imports the same file,
 * so a rule that passes here is the rule the server applies. The cases worth
 * having are the ones where a message is plausible but wrong: a number that is
 * fractional, a payload one byte over, a type nobody defined.
 */

describe('room codes', () => {
    it('is six characters with no letters that get misread aloud', () => {
        expect(CODE_LENGTH).toBe(6);
        for (const confusable of ['0', 'O', '1', 'I', 'L']) {
            expect(CODE_ALPHABET, confusable).not.toContain(confusable);
        }
    });

    it('accepts only codes from its own alphabet', () => {
        expect(validCode('ABC234')).toBe(true);
        expect(validCode('ABC23')).toBe(false);
        expect(validCode('ABC2345')).toBe(false);
        expect(validCode('ABC01L')).toBe(false);
        expect(validCode('abc234')).toBe(false);
        expect(validCode('')).toBe(false);
    });

    it('forgives how people actually type a code', () => {
        expect(normaliseCode(' abc-234 ')).toBe('ABC234');
        expect(normaliseCode('ABC234EXTRA')).toBe('ABC234');
    });

    it('draws only from the alphabet, however the bytes fall', () => {
        // Every byte value in turn, including the ones rejection sampling must
        // throw away.
        let next = 0;
        const code = makeCode(bytes => {
            for (let i = 0; i < bytes.length; i++) bytes[i] = next++ % 256;
        });
        expect(validCode(code)).toBe(true);
    });

    it('does not bias the alphabet', () => {
        // A modulo over 256 would make the first nine characters likelier.
        // Uniform bytes should land roughly evenly; a biased implementation
        // fails this badly rather than marginally.
        const counts = new Map<string, number>();
        let seed = 12345;
        for (let run = 0; run < 4000; run++) {
            const code = makeCode(bytes => {
                for (let i = 0; i < bytes.length; i++) {
                    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                    bytes[i] = (seed >>> 8) & 0xff;
                }
            });
            for (const character of code) counts.set(character, (counts.get(character) ?? 0) + 1);
        }
        const seen = [...counts.values()];
        expect(counts.size).toBe(CODE_ALPHABET.length);
        expect(Math.max(...seen) / Math.min(...seen)).toBeLessThan(1.5);
    });
});

describe('what the room will accept', () => {
    const parse = (value: unknown) => parseClientMessage(value);

    it('takes the four messages it defines', () => {
        expect(parse(JSON.stringify({ t: 'signal', payload: 'v=0' }))).toEqual({
            ok: true,
            message: { t: 'signal', payload: 'v=0' },
        });
        expect(parse(JSON.stringify({ t: 'ready', ready: true })).ok).toBe(true);
        expect(parse(JSON.stringify({ t: 'advance', index: 3 })).ok).toBe(true);
        expect(parse(JSON.stringify({ t: 'spoke', ms: 42_000 })).ok).toBe(true);
    });

    it('refuses anything it did not define', () => {
        expect(parse(JSON.stringify({ t: 'transcript', text: 'jeg heter ola' })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'audio', blob: 'AAAA' })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'score', points: 9999 })).ok).toBe(false);
    });

    it('refuses what is not a message at all', () => {
        expect(parse(42).ok).toBe(false);
        expect(parse('not json').ok).toBe(false);
        expect(parse(JSON.stringify([1, 2, 3])).ok).toBe(false);
        expect(parse(JSON.stringify(null)).ok).toBe(false);
        expect(parse(JSON.stringify('a string')).ok).toBe(false);
    });

    it('bounds the signalling blob', () => {
        const fits = JSON.stringify({ t: 'signal', payload: 'x'.repeat(100) });
        expect(parse(fits).ok).toBe(true);
        expect(parse(JSON.stringify({ t: 'signal', payload: 'x'.repeat(MAX_SIGNAL_BYTES + 1) })).ok).toBe(
            false
        );
        // And the whole frame, so a megabyte of JSON is never parsed at all.
        expect(parse('x'.repeat(MAX_SIGNAL_BYTES + 1))).toEqual({ ok: false, reason: 'too large' });
    });

    it('refuses numbers that are plausible-looking but wrong', () => {
        expect(parse(JSON.stringify({ t: 'advance', index: -1 })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'advance', index: 1.5 })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'advance', index: 1e9 })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'advance', index: '3' })).ok).toBe(false);

        expect(parse(JSON.stringify({ t: 'spoke', ms: -1 })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'spoke', ms: MAX_SPOKEN_MS + 1 })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'spoke', ms: Number.MAX_SAFE_INTEGER })).ok).toBe(false);
    });

    it('refuses the right shape with the wrong types', () => {
        expect(parse(JSON.stringify({ t: 'ready', ready: 'yes' })).ok).toBe(false);
        expect(parse(JSON.stringify({ t: 'signal', payload: { sdp: 'v=0' } })).ok).toBe(false);
    });
});

describe('the shared draw', () => {
    it('gives both candidates the same sequence from the same seed', () => {
        const seed = 987654;
        const mine = Array.from({ length: 10 }, seededRandom(seed));
        const theirs = Array.from({ length: 10 }, seededRandom(seed));
        expect(mine).toEqual(theirs);
    });

    it('gives different sequences from different seeds', () => {
        const a = Array.from({ length: 10 }, seededRandom(1));
        const b = Array.from({ length: 10 }, seededRandom(2));
        expect(a).not.toEqual(b);
    });

    it('stays inside [0, 1)', () => {
        const next = seededRandom(42);
        for (let i = 0; i < 1000; i++) {
            const value = next();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('makes a seed that fits in a positive integer', () => {
        const seed = makeSeed(words => {
            words[0] = 0xffffffff;
        });
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(0x7fffffff);
    });
});

describe('the levels the room knows', () => {
    it('is exactly the levels the app has', () => {
        // The Durable Object validates against its own list rather than
        // importing every published prompt to get one. These two assignments
        // are the thing that stops the two lists drifting: each fails to
        // compile if either list gains or loses a level.
        const asApp: Nivaa[] = [...ROOM_NIVAAER];
        const asRoom: RoomNivaa[] = asApp;
        expect(asRoom).toEqual(['A1-A2', 'A2-B1', 'B1-B2']);
    });

    it('refuses a level nobody offers', () => {
        expect(validNivaa('A2-B1')).toBe(true);
        expect(validNivaa('C1')).toBe(false);
        expect(validNivaa('')).toBe(false);
        expect(validNivaa(null)).toBe(false);
    });
});

describe('what the browser will accept back', () => {
    const parse = (value: unknown) => parseServerMessage(value);

    it('takes a well-formed seat assignment', () => {
        expect(
            parse(JSON.stringify({ t: 'joined', seat: 'b', seed: 5, code: 'ABC234', nivaa: 'B1-B2' }))
        ).toEqual({ t: 'joined', seat: 'b', seed: 5, code: 'ABC234', nivaa: 'B1-B2' });
    });

    it('refuses a frame that is almost right', () => {
        // A half-upgraded worker, or a socket something else answered. Neither
        // may throw inside an event handler with nowhere to put the error.
        expect(parse(JSON.stringify({ t: 'joined', seat: 'c', seed: 5, code: 'ABC234', nivaa: 'B1-B2' }))).toBeNull();
        expect(parse(JSON.stringify({ t: 'joined', seat: 'a', seed: 5, code: 'ABC234' }))).toBeNull();
        expect(parse(JSON.stringify({ t: 'advance', index: -3 }))).toBeNull();
        expect(parse('{')).toBeNull();
        expect(parse(undefined)).toBeNull();
    });

    it('keeps an error message short enough to show', () => {
        const long = parse(JSON.stringify({ t: 'error', reason: 'x'.repeat(5000) }));
        expect(long?.t).toBe('error');
        expect((long as { reason: string }).reason.length).toBeLessThanOrEqual(200);
    });
});

describe('drawing the same tasks on both devices', () => {
    it('walks the same sequence from the same seed', () => {
        const pool = ['en', 'to', 'tre', 'fire', 'fem'];
        const mine = seededPick(4242);
        const theirs = seededPick(4242);
        // buildTimeline asks once per pool in a fixed order, so what matters is
        // that the Nth draw matches, not that any single draw does.
        for (let i = 0; i < 6; i++) expect(theirs(pool)).toBe(mine(pool));
    });

    it('draws from different seeds differently', () => {
        const pool = Array.from({ length: 20 }, (_, i) => i);
        const mine = Array.from({ length: 8 }, seededPick(1).bind(null, pool));
        const theirs = Array.from({ length: 8 }, seededPick(99).bind(null, pool));
        expect(mine).not.toEqual(theirs);
    });

    it('always lands inside the pool', () => {
        const pool = ['a', 'b', 'c'];
        const draw = seededPick(7);
        for (let i = 0; i < 500; i++) expect(pool).toContain(draw(pool));
    });
});

describe('the queue', () => {
    it('takes only the two things a waiting browser can say', () => {
        expect(parseQueueClientMessage(JSON.stringify({ t: 'wait' }))).toEqual({ t: 'wait' });
        expect(parseQueueClientMessage(JSON.stringify({ t: 'leave' }))).toEqual({ t: 'leave' });
        expect(parseQueueClientMessage(JSON.stringify({ t: 'match', with: 'someone' }))).toBeNull();
        expect(parseQueueClientMessage(JSON.stringify({ t: 'nickname', name: 'Ola' }))).toBeNull();
        expect(parseQueueClientMessage('x'.repeat(500))).toBeNull();
        expect(parseQueueClientMessage(42)).toBeNull();
    });

    it('accepts a match only with a code it could have issued', () => {
        expect(
            parseQueueServerMessage(JSON.stringify({ t: 'matched', code: 'ABC234', nivaa: 'A2-B1' }))
        ).toEqual({ t: 'matched', code: 'ABC234', nivaa: 'A2-B1' });

        // A code from the wrong alphabet, or a level nobody offers, would send
        // the pair to a room that cannot exist.
        expect(
            parseQueueServerMessage(JSON.stringify({ t: 'matched', code: 'abc01l', nivaa: 'A2-B1' }))
        ).toBeNull();
        expect(
            parseQueueServerMessage(JSON.stringify({ t: 'matched', code: 'ABC234', nivaa: 'C1' }))
        ).toBeNull();
    });

    it('bounds the queue length it will believe', () => {
        expect(parseQueueServerMessage(JSON.stringify({ t: 'queue', waiting: 3 }))?.t).toBe('queue');
        expect(parseQueueServerMessage(JSON.stringify({ t: 'queue', waiting: -1 }))).toBeNull();
        expect(parseQueueServerMessage(JSON.stringify({ t: 'queue', waiting: 1e9 }))).toBeNull();
    });

    it('carries nothing about who is waiting', () => {
        // The queue holds a socket and a timestamp. If a name, an id or a
        // transcript ever became part of this protocol, it would have to be
        // added here — which is where it would be noticed.
        const shapes = [
            { t: 'queue', waiting: 2 },
            { t: 'matched', code: 'ABC234', nivaa: 'B1-B2' },
            { t: 'error', reason: 'nope' },
        ];
        for (const shape of shapes) {
            const parsed = parseQueueServerMessage(JSON.stringify(shape));
            expect(parsed).not.toBeNull();
            for (const key of Object.keys(parsed as object)) {
                expect(['t', 'waiting', 'code', 'nivaa', 'reason']).toContain(key);
            }
        }
    });
});
