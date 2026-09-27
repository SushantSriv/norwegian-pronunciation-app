import { describe, expect, it } from 'vitest';
import { buildTimeline, plannedRange, TOTAL_MS, type Segment } from '../examTimeline';
import { POOLS, type Nivaa, type Oppgave, type PoolId } from '../../data/muntlig/oppgaver';

/**
 * The timeline against the published format.
 *
 * These are not tests of our taste. Every expectation below is a fact printed
 * in an HK-dir document, so a change that breaks one is a change that has made
 * the rehearsal less like the exam — which is the only way this mode can fail
 * that a user would not notice until the day itself.
 */

const MIN = 60_000;
const LEVELS: Nivaa[] = ['A1-A2', 'A2-B1', 'B1-B2'];

/** Pick a named task, so nothing here depends on ordering or randomness. */
const pickId =
    (id: string) =>
    (_pool: PoolId, oppgaver: Oppgave[]): Oppgave =>
        oppgaver.find(o => o.id === id) ?? oppgaver[0];

const tasks = (timeline: Segment[]) => timeline.filter(s => s.letter);
const letters = (timeline: Segment[]) => [...new Set(tasks(timeline).map(s => s.letter))];

describe('the shape of the exam', () => {
    it('gives A1–A2 four tasks and the others three', () => {
        expect(letters(buildTimeline({ nivaa: 'A1-A2' }))).toEqual(['A', 'B', 'C', 'D']);
        expect(letters(buildTimeline({ nivaa: 'A2-B1' }))).toEqual(['A', 'B', 'C']);
        expect(letters(buildTimeline({ nivaa: 'B1-B2' }))).toEqual(['A', 'B', 'C']);
    });

    it('letters the tasks, because the real papers do', () => {
        // The public web page numbers them 1–4; every actual task set and
        // instruction sheet uses letters, and the candidate hears letters.
        for (const nivaa of LEVELS) {
            for (const segment of tasks(buildTimeline({ nivaa }))) {
                expect(segment.letter).toMatch(/^[A-D]$/);
            }
        }
    });

    it('has exactly one conversation task at every level', () => {
        for (const nivaa of LEVELS) {
            const pair = buildTimeline({ nivaa }).filter(s => s.kind === 'samtale');
            expect(pair, nivaa).toHaveLength(1);
        }
    });

    it('opens by reading the welcome aloud, with the right task count', () => {
        expect(buildTimeline({ nivaa: 'A1-A2' })[0].says[0]).toContain('fire oppgaver');
        expect(buildTimeline({ nivaa: 'A2-B1' })[0].says[0]).toContain('tre oppgaver');
        expect(buildTimeline({ nivaa: 'B1-B2' })[0].says[0]).toContain('tre oppgaver');
    });

    it('ends every session by thanking the candidate', () => {
        for (const nivaa of LEVELS) {
            expect(buildTimeline({ nivaa }).at(-1)?.says[0]).toBe('Som avslutning: Takk');
        }
    });
});

describe('what counts and what does not', () => {
    it('gives A2–B1 and B1–B2 an unassessed warm-up', () => {
        for (const nivaa of ['A2-B1', 'B1-B2'] as Nivaa[]) {
            const warmUp = buildTimeline({ nivaa }).find(s => s.kind === 'oppvarming');
            expect(warmUp, nivaa).toBeDefined();
            expect(warmUp?.assessed).toBe(false);
            expect(warmUp?.note).toContain('ikke skal være del av vurderingsgrunnlaget');
        }
    });

    it('gives A1–A2 no warm-up, because there the same content is assessed', () => {
        // This distinction is the most useful thing the mode teaches about
        // choosing a level: talking about yourself counts at A1–A2 and does not
        // at the levels above.
        const timeline = buildTimeline({ nivaa: 'A1-A2' });
        expect(timeline.find(s => s.kind === 'oppvarming')).toBeUndefined();

        const a = timeline.find(s => s.letter === 'A');
        expect(a?.assessed).toBe(true);
        expect(a?.oppgave?.text).toBe('Kan du fortelle litt om deg selv?');
    });

    it('never speaks an examiner-only note aloud', () => {
        // At the real exam these are instructions to the examiner. Speaking
        // them would teach a candidate to expect something they will not hear.
        for (const nivaa of LEVELS) {
            for (const segment of buildTimeline({ nivaa })) {
                if (!segment.note) continue;
                expect(segment.says).not.toContain(segment.note);
            }
        }
    });
});

describe('the published durations', () => {
    it('matches the printed bounds slot by slot', () => {
        const a1a2 = buildTimeline({ nivaa: 'A1-A2' });
        expect(a1a2.find(s => s.letter === 'A')).toMatchObject({ minMs: 1 * MIN, maxMs: 2 * MIN });
        expect(a1a2.find(s => s.letter === 'D')).toMatchObject({ minMs: 2 * MIN, maxMs: 3 * MIN });

        // The conversation is twice as long above A1–A2.
        expect(a1a2.find(s => s.kind === 'samtale')).toMatchObject({ minMs: 2 * MIN, maxMs: 3 * MIN });
        for (const nivaa of ['A2-B1', 'B1-B2'] as Nivaa[]) {
            expect(buildTimeline({ nivaa }).find(s => s.kind === 'samtale'), nivaa).toMatchObject({
                minMs: 5 * MIN,
                maxMs: 7 * MIN,
            });
        }
    });

    it('plans a session inside the published total, once a partner is there', () => {
        for (const nivaa of LEVELS) {
            const range = plannedRange(buildTimeline({ nivaa, pairPresent: true }));
            expect(range.min, nivaa).toBeGreaterThan(0);
            // HK-dir publishes 20–25 minutes for the whole session but no
            // minute-by-minute split, so this only checks we are in the region
            // rather than pretending to an exact figure.
            expect(range.max, nivaa).toBeLessThanOrEqual(TOTAL_MS.max + 5 * MIN);
        }
    });
});

describe('what the app refuses to run', () => {
    it('greys the conversation task when there is nobody to talk to', () => {
        const pair = buildTimeline({ nivaa: 'A2-B1' }).find(s => s.kind === 'samtale');
        expect(pair?.runnable).toBe(false);
        expect(pair?.floor).toBe('ingen');
        expect(pair?.unavailable).toContain('annen kandidat');
        // Still shown, with its real letter and duration: hiding it would
        // misrepresent a fifth of the exam.
        expect(pair?.letter).toBe('B');
        expect(pair?.maxMs).toBe(7 * MIN);
    });

    it('runs the conversation task once a partner is present', () => {
        const pair = buildTimeline({ nivaa: 'A2-B1', pairPresent: true }).find(
            s => s.kind === 'samtale'
        );
        expect(pair?.runnable).toBe(true);
        expect(pair?.unavailable).toBeUndefined();
    });

    it('greys the picture task, because we do not have the pictures', () => {
        const picture = buildTimeline({ nivaa: 'A1-A2' }).find(s => s.letter === 'B');
        expect(picture?.runnable).toBe(false);
        expect(picture?.unavailable).toContain('bilde');
        expect(picture?.maxMs).toBe(3 * MIN);
    });

    it('says the examiner asks nothing during the B1–B2 conversation', () => {
        const pair = buildTimeline({ nivaa: 'B1-B2', pairPresent: true }).find(
            s => s.kind === 'samtale'
        );
        expect(pair?.note).toContain('ingen oppfølgingsspørsmål');
    });
});

describe('B1–B2 oppgave C', () => {
    const carTimeline = () => buildTimeline({ nivaa: 'B1-B2', pick: pickId('pa-2') });

    it('reads the påstand aloud and offers time to think, with no invented clock', () => {
        const thinking = carTimeline().find(s => s.kind === 'tenketid');
        expect(thinking?.says).toContain('Det er for dyrt å ha bil i Norge.');
        expect(thinking?.says.at(-1)).toContain('tenke deg om og notere');
        // The only preparation time in the whole exam, and HK-dir publishes no
        // number of minutes for it.
        expect(thinking?.minMs).toBeUndefined();
        expect(thinking?.maxMs).toBeUndefined();
        expect(thinking?.note).toContain('finner ikke på et tall');
    });

    it('asks exactly two of the published follow-ups', () => {
        const followUps = carTimeline().filter(s => s.kind === 'oppfolging');
        expect(followUps).toHaveLength(2);
        expect(followUps[0].says[0]).toBe('Hvilke fordeler og ulemper ser du ved å eie en bil?');
        expect(followUps.every(s => s.runnable)).toBe(true);
    });

    it('refuses to invent follow-ups for a påstand that has none published', () => {
        const timeline = buildTimeline({ nivaa: 'B1-B2', pick: pickId('pa-1') });
        const followUps = timeline.filter(s => s.kind === 'oppfolging');
        expect(followUps).toHaveLength(1);
        expect(followUps[0].runnable).toBe(false);
        expect(followUps[0].says).toEqual([]);
        expect(followUps[0].unavailable).toContain('dikter dem ikke opp');
    });

    it('is the only level with a thinking-time segment at all', () => {
        for (const nivaa of ['A1-A2', 'A2-B1'] as Nivaa[]) {
            expect(buildTimeline({ nivaa }).some(s => s.kind === 'tenketid'), nivaa).toBe(false);
        }
    });
});

describe('provenance', () => {
    it('every prompt carries the source it was transcribed from', () => {
        for (const nivaa of LEVELS) {
            for (const segment of buildTimeline({ nivaa })) {
                if (!segment.oppgave) continue;
                expect(segment.kilde?.url, segment.id).toMatch(/^https:\/\/hkdir\.no\//);
                expect(segment.kilde?.label).toBeTruthy();
            }
        }
    });

    it('draws every prompt from the published pools and invents none', () => {
        const published = new Set(
            Object.values(POOLS).flatMap(pool => pool.oppgaver.map(o => o.text))
        );
        for (const nivaa of LEVELS) {
            for (const segment of buildTimeline({ nivaa })) {
                if (!segment.oppgave) continue;
                expect(published.has(segment.oppgave.text), segment.oppgave.text).toBe(true);
            }
        }
    });

    it('shares pools across levels the way the exam does', () => {
        // A1–A2 D and A2–B1 A are the same pool; A2–B1 C and B1–B2 A are too.
        const d = buildTimeline({ nivaa: 'A1-A2', pick: pickId('fb-2') }).find(s => s.letter === 'D');
        const a = buildTimeline({ nivaa: 'A2-B1', pick: pickId('fb-2') }).find(s => s.letter === 'A');
        expect(d?.oppgave?.text).toBe(a?.oppgave?.text);

        const c = buildTimeline({ nivaa: 'A2-B1', pick: pickId('sy-3') }).find(s => s.letter === 'C');
        const b1a = buildTimeline({ nivaa: 'B1-B2', pick: pickId('sy-3') }).find(s => s.letter === 'A');
        expect(c?.oppgave?.text).toBe(b1a?.oppgave?.text);
    });
});

describe('the microphone is never open while the app is talking', () => {
    it('gives the floor to the examiner for the opening and the close', () => {
        for (const nivaa of LEVELS) {
            const timeline = buildTimeline({ nivaa });
            expect(timeline[0].floor).toBe('eksaminator');
            expect(timeline.at(-1)?.floor).toBe('eksaminator');
        }
    });

    it('never gives the floor to the candidate on a segment it cannot run', () => {
        for (const nivaa of LEVELS) {
            for (const segment of buildTimeline({ nivaa })) {
                if (segment.runnable) continue;
                expect(segment.floor, segment.id).toBe('ingen');
            }
        }
    });
});
