import { describe, expect, it } from 'vitest';
import { buildSyncPayload, leaderboardEnabled, partitionForSync } from '../leaderboardClient';
import { awardAttempt, emptyLedger, pendingEvents, type PointEvent } from '../learningPoints';
import { MAX_POINTS } from '../leaderboardRules';
import { emptyProfile } from '../learningProfile';
import type { WordScore } from '../scoring';

const NOW = Date.UTC(2026, 0, 5, 10);

const word = (over: Partial<WordScore> & { word: string }): WordScore => ({
    index: 0,
    status: 'equal',
    score: 1,
    expectedIpa: null,
    heardIpa: null,
    ...over,
});

/**
 * A ledger built the way the app builds one: by pricing real attempts, with
 * real phrases and real transcripts going into the engine. If any of that can
 * leak into a payload, this is the fixture that would carry it.
 */
function practised() {
    let ledger = emptyLedger();
    const phrases = ['jeg heter Kari og bor i Bergen', 'kan du hjelpe meg med søknaden'];
    phrases.forEach((phrase, index) => {
        ledger = awardAttempt(ledger, {
            score: 82,
            threshold: 55,
            passed: true,
            counts: true,
            phrase,
            wordScores: phrase.split(' ').map((text, i) => word({ word: text, index: i })),
            cefr: 'A2',
            profile: emptyProfile(),
            now: NOW + index * 60_000,
        }).ledger;
    });
    return ledger;
}

describe('the leaderboard is off unless a build turns it on', () => {
    it('has no endpoint in a default build', () => {
        // The hosted GitHub Pages build sets no VITE_LEADERBOARD_URL, so the
        // community screen shows local points and opens no connection.
        expect(leaderboardEnabled).toBe(false);
    });
});

describe('buildSyncPayload — what leaves the device', () => {
    const ledger = practised();
    const payload = buildSyncPayload(
        'FjordFox',
        { delta: 8.5, samples: 30, baseline: 22 },
        pendingEvents(ledger)
    );

    it('carries the nickname, the improvement and the events, and nothing else', () => {
        expect(Object.keys(payload).sort()).toEqual(['events', 'improvement', 'nickname']);
        expect(payload.nickname).toBe('FjordFox');
    });

    it('describes an event with five fields and no sixth', () => {
        for (const event of payload.events) {
            expect(Object.keys(event).sort()).toEqual(['at', 'cefr', 'id', 'kind', 'points']);
        }
    });

    it('never carries a phrase, a word or a transcript', () => {
        const json = JSON.stringify(payload);
        for (const secret of [
            'jeg heter Kari',
            'Kari',
            'Bergen',
            'søknaden',
            'hjelpe',
            'phrase',
            'heard',
            'expected',
            'transcript',
        ]) {
            expect(json).not.toContain(secret);
        }
    });

    it('never carries a recording, or anything derived from the audio', () => {
        const json = JSON.stringify(payload);
        for (const forbidden of ['audio', 'blob:', 'data:', 'ipa', 'contour', 'pitch', 'wav']) {
            expect(json.toLowerCase()).not.toContain(forbidden);
        }
    });

    it('never carries the per-attempt scores, only the points they were worth', () => {
        // Checked by VALUE, not by substring: event ids are random hex, and "82"
        // appearing inside one would have made this pass or fail by luck rather
        // than by behaviour.
        const numbers = new Set<number>();
        const walk = (value: unknown): void => {
            if (typeof value === 'number') numbers.add(value);
            else if (value && typeof value === 'object') Object.values(value).forEach(walk);
        };
        walk(payload);

        // 82 was the composite score of both attempts. It is nowhere.
        expect(ledger.samples.map(sample => sample.score)).toContain(82);
        expect(numbers.has(82)).toBe(false);

        // Nor is the per-word personal-best table, which is what improvement is
        // computed from.
        expect(payload).not.toHaveProperty('bests');
        expect(Object.keys(payload.improvement ?? {})).toEqual(['delta', 'samples', 'baseline']);

        for (const event of payload.events) {
            expect(event).not.toHaveProperty('score');
            expect(event.points).toBeLessThanOrEqual(MAX_POINTS[event.kind]);
        }
    });

    it('keeps the phrase the anti-grinding counter needs on the device', () => {
        // The ledger knows the phrases; the payload built from it does not.
        expect(JSON.stringify(ledger)).toContain('bergen');
        expect(JSON.stringify(payload)).not.toContain('bergen');
    });

    it('sends nothing at all when there is nothing new', () => {
        const payload = buildSyncPayload('FjordFox', null, []);
        expect(payload.events).toEqual([]);
        expect(payload.improvement).toBeNull();
    });

    it('will not post an unbounded number of events in one request', () => {
        const many: PointEvent[] = Array.from({ length: 5_000 }, (_, i) => ({
            id: `event${String(i).padStart(12, '0')}`,
            kind: 'clear',
            points: 5,
            at: NOW - i * 1000,
        }));
        // The whole path, the way the hook runs it: decide what to send, then
        // build the body from that.
        const { sendable } = partitionForSync(many, NOW);
        expect(buildSyncPayload('FjordFox', null, sendable).events.length).toBeLessThanOrEqual(200);
    });

    it('omits the level from an event that had none', () => {
        const ledger = awardAttempt(emptyLedger(), {
            score: 70,
            threshold: 55,
            passed: true,
            counts: true,
            phrase: 'takk for hjelpen',
            wordScores: [word({ word: 'takk' })],
            cefr: 'Cleaning',
            profile: emptyProfile(),
            now: NOW,
        }).ledger;
        const payload = buildSyncPayload('FjordFox', null, pendingEvents(ledger));
        expect(payload.events.every(event => !('cefr' in event))).toBe(true);
    });
});

describe('partitionForSync — what is worth sending', () => {
    const DAY = 86_400_000;
    const at = (offsetDays: number): PointEvent => ({
        id: `event${String(Math.abs(offsetDays)).padStart(12, '0')}`,
        kind: 'clear',
        points: 5,
        at: NOW - offsetDays * DAY,
    });

    it('gives up on events no server would ever accept', () => {
        const { sendable, stale } = partitionForSync([at(20), at(1)], NOW);
        expect(stale.map(e => e.at)).toEqual([NOW - 20 * DAY]);
        expect(sendable.map(e => e.at)).toEqual([NOW - DAY]);
    });

    it('sends the newest first when there are more than one request holds', () => {
        // A fortnight offline: the oldest events would all be refused, so
        // taking them first would mean this week's points never arrive.
        const backlog = Array.from({ length: 500 }, (_, i) => ({
            ...at(0),
            id: `event${String(i).padStart(12, '0')}`,
            at: NOW - i * 60_000,
        }));

        const { sendable } = partitionForSync(backlog, NOW);
        expect(sendable).toHaveLength(200);
        expect(sendable[0].at).toBe(NOW);
        // Every one sent is newer than everything left behind.
        const oldestSent = Math.min(...sendable.map(e => e.at));
        expect(oldestSent).toBe(NOW - 199 * 60_000);
    });

    it('treats an event from a fast clock as unsendable rather than losing it', () => {
        const { sendable, stale } = partitionForSync([at(-1)], NOW);
        expect(sendable).toEqual([]);
        expect(stale).toHaveLength(1);
    });

    it('has nothing to do when there is nothing pending', () => {
        expect(partitionForSync([], NOW)).toEqual({ sendable: [], stale: [] });
    });
});
