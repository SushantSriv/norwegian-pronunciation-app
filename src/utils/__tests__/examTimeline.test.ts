import { describe, expect, it } from 'vitest';
import { buildTimeline, plannedRange, TOTAL_MS, type PickOppgave, type Segment } from '../examTimeline';
import { POOLS, type Nivaa, type Oppgave, type PoolId } from '../../data/muntlig/oppgaver';
import { SEATS, type Seat } from '../roomProtocol';

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

describe('the examiner reads the task aloud', () => {
    it('says every prompt aloud, not just shows it', () => {
        // The candidate has the task on paper at the exam and hears it read
        // out. An app that only put it on screen would be rehearsing reading.
        //
        // Per task rather than per segment: B1-B2's oppgave C is two segments,
        // and the påstand is read in the first of them.
        for (const nivaa of LEVELS) {
            const timeline = buildTimeline({ nivaa });
            for (const segment of timeline) {
                if (!segment.oppgave) continue;
                const spokenForThisTask = timeline
                    .filter(other => other.letter === segment.letter)
                    .flatMap(other => other.says)
                    .join(' ');
                expect(spokenForThisTask, `${nivaa} ${segment.id}`).toContain(
                    segment.oppgave.text
                );
            }
        }
    });

    it('cues the candidate after the question, not before it', () => {
        const a = buildTimeline({ nivaa: 'A2-B1' }).find(s => s.letter === 'A');
        expect(a?.says.at(-1)).toBe('Du kan begynne.');
        expect(a?.says.at(-2)).toBe(a?.oppgave?.text);
    });

    it('reads out the conversation task even when it cannot be run', () => {
        // You should hear what the task you are missing actually asks.
        const pair = buildTimeline({ nivaa: 'A2-B1' }).find(s => s.kind === 'samtale');
        expect(pair?.runnable).toBe(false);
        expect(pair?.says.join(' ')).toContain(pair?.oppgave?.text ?? '###');
    });

    it('does not read the B1–B2 påstand a third time', () => {
        // It is read once with the framing and once as the thinking segment's
        // own line. Repeating it at the answering slot would be padding.
        const timeline = buildTimeline({ nivaa: 'B1-B2', pick: pickId('pa-2') });
        const answering = timeline.find(s => s.id === 'c');
        expect(answering?.says).toEqual(['Du kan begynne.']);
    });
});

/**
 * A shuffle both devices share.
 *
 * The real draw is seeded by the room, so the two browsers walk the same
 * sequence and end up on the same questions. This models that with no
 * randomness in it: one dealer per device, handing out each pool in the order
 * it is printed.
 */
const dealer = (): PickOppgave => {
    const dealt: Partial<Record<PoolId, number>> = {};
    return (pool, oppgaver) => {
        const next = (dealt[pool] ?? -1) + 1;
        dealt[pool] = next;
        return oppgaver[next % oppgaver.length];
    };
};

/** One device's view of a session the two candidates sit together. */
const seated = (nivaa: Nivaa, seat: Seat, pick: PickOppgave = dealer()) =>
    buildTimeline({ nivaa, pick, pairPresent: true, seat });

describe('the topic each candidate gets', () => {
    it('gives the two candidates different topics where the examiner promises one each', () => {
        // "I oppgave C skal dere snakke én og én om ett tema hver. … Til den
        // andre kandidaten: Du skal få en annen oppgave etterpå." Handing both
        // candidates the same question would have the app contradict the line
        // it has just read out loud.
        const mine = (timeline: Segment[]) =>
            timeline.find(s => s.letter === 'C' && s.floor === 'deg')?.oppgave?.text;

        expect(mine(seated('A2-B1', 'a'))).toBeTruthy();
        expect(mine(seated('A2-B1', 'a'))).not.toBe(mine(seated('A2-B1', 'b')));
    });

    it('gives both candidates the same task where the framing says they get one', () => {
        // "I oppgave A skal dere snakke én og én. Dere får samme oppgave." A
        // second topic belongs to the one slot that promises one; inventing
        // another anywhere else is the same overclaim in the other direction.
        const a = seated('A1-A2', 'a').filter(s => s.letter === 'A');
        expect(a).toHaveLength(2);
        expect(a[0].oppgave?.text).toBe(a[1].oppgave?.text);

        const d = seated('A1-A2', 'a').filter(s => s.letter === 'D');
        expect(d[0].oppgave?.text).toBe(d[1].oppgave?.text);
    });

    it('reads the second candidate their own topic, which they have not heard yet', () => {
        // The examiner reads every task aloud. The second candidate's topic is
        // new to the room, so it is read out the way the first one was.
        const second = seated('A2-B1', 'b').filter(s => s.letter === 'C')[1];
        expect(second.says).toEqual([second.oppgave?.text, 'Du kan begynne.']);
    });

    it('does not read a shared task out a second time', () => {
        // Both candidates heard it a moment ago, with the framing, and it is
        // on screen. Only the cue to begin is left — the same reason the
        // B1–B2 påstand is not read a third time.
        const second = seated('A2-B1', 'a').filter(s => s.letter === 'A')[1];
        expect(second.says).toEqual(['Du kan begynne.']);
    });

    it('still hands out two topics when the draw comes back with the same one twice', () => {
        // A shuffle can offer the same item twice, and a pool can have a
        // single item in it. Drawing again until they differ would make the
        // NUMBER of draws depend on what came back — and two devices that
        // disagree about how many times they have asked have different
        // questions on screen from that moment on. That this test returns at
        // all is half of what it checks: a retry loop never would.
        const [first, second] = seated('A2-B1', 'a', pickId('sy-3')).filter(s => s.letter === 'C');
        expect(first.oppgave?.id).toBe('sy-3');
        expect(second.oppgave?.id).not.toBe('sy-3');
    });

    it('invents no prompt for the second candidate either', () => {
        const published = new Set(
            Object.values(POOLS).flatMap(pool => pool.oppgaver.map(o => o.text))
        );
        for (const nivaa of LEVELS) {
            for (const seat of SEATS) {
                for (const segment of seated(nivaa, seat)) {
                    if (!segment.oppgave) continue;
                    expect(published.has(segment.oppgave.text), segment.oppgave.text).toBe(true);
                    expect(segment.kilde?.url, segment.id).toMatch(/^https:\/\/hkdir\.no\//);
                }
            }
        }
    });

    it('keeps the two devices on the same questions in the same order', () => {
        // The pair steps through one shared index, and each device draws its
        // own prompts from the seed the room gave them both. If a seat changed
        // what was drawn, or how often, the two screens would part company at
        // the first task and never find each other again.
        const shape = (segment: Segment) => ({
            id: segment.id,
            letter: segment.letter,
            oppgave: segment.oppgave?.text,
            says: segment.says,
        });

        for (const nivaa of LEVELS) {
            expect(seated(nivaa, 'b').map(shape), nivaa).toEqual(seated(nivaa, 'a').map(shape));
        }
    });
});

describe('two candidates take it in turns', () => {
    it('never tells both candidates to speak at once', () => {
        // "I oppgave A skal dere snakke én og én." Two microphones opening on
        // the same turn is two people talking over each other down a live
        // connection, in the tasks the exam assesses them one at a time.
        for (const nivaa of LEVELS) {
            const b = seated(nivaa, 'b');
            seated(nivaa, 'a').forEach((segment, index) => {
                if (segment.kind === 'samtale') return;
                expect([segment.floor, b[index].floor], `${nivaa} ${segment.id}`).not.toEqual([
                    'deg',
                    'deg',
                ]);
            });
        }
    });

    it('gives every turn to exactly one of the two', () => {
        // The mirror image on the other device: your turn is their partner's
        // turn, and a segment where the examiner or nobody speaks is the same
        // on both screens.
        for (const nivaa of LEVELS) {
            const b = seated(nivaa, 'b');
            seated(nivaa, 'a').forEach((segment, index) => {
                const theirs = b[index].floor;
                if (segment.kind === 'samtale') expect(theirs, segment.id).toBe('deg');
                else if (segment.floor === 'deg') expect(theirs, segment.id).toBe('den-andre');
                else if (segment.floor === 'den-andre') expect(theirs, segment.id).toBe('deg');
                else expect(theirs, segment.id).toBe(segment.floor);
            });
        }
    });

    it('keeps both floors open for the conversation, which they do together', () => {
        // "Det er viktig at dere begge er aktive i samtalen" — the one task
        // where two open microphones is the point rather than a fault.
        for (const nivaa of LEVELS) {
            expect(seated(nivaa, 'a').find(s => s.kind === 'samtale')?.floor, nivaa).toBe('deg');
            expect(seated(nivaa, 'b').find(s => s.kind === 'samtale')?.floor, nivaa).toBe('deg');
        }
    });

    it('takes the whole of B1–B2 oppgave C one candidate at a time', () => {
        // "Etterpå får dere noen spørsmål til temaet." The follow-ups are put
        // to the candidate who has just answered, about what they said, so
        // they stay with that candidate's turn — and each of them is asked the
        // two that the guidance requires.
        const c = seated('B1-B2', 'a', pickId('pa-2')).filter(
            s => s.letter === 'C' && s.kind !== 'tenketid'
        );
        expect(c.map(s => s.floor)).toEqual([
            'deg',
            'deg',
            'deg',
            'den-andre',
            'den-andre',
            'den-andre',
        ]);
        expect(c.filter(s => s.kind === 'oppfolging')).toHaveLength(4);
        expect(c[1].says[0]).toBe('Hvilke fordeler og ulemper ser du ved å eie en bil?');
        expect(c[4].says[0]).toBe('Hvilke fordeler og ulemper ser du ved å eie en bil?');
    });

    it('reads the påstand out once, to both of them, before either answers', () => {
        // One påstand and one go at thinking about it: both candidates hear it
        // read aloud, and the turn-taking starts after it.
        const timeline = seated('B1-B2', 'b', pickId('pa-2'));
        const thinking = timeline.filter(s => s.kind === 'tenketid');
        expect(thinking).toHaveLength(1);
        expect(thinking[0].floor).toBe('ingen');
        expect(timeline.indexOf(thinking[0])).toBeLessThan(
            timeline.findIndex(s => s.letter === 'C' && s.kind === 'individuell')
        );
    });

    it('leaves a candidate sitting the exam alone exactly as they were', () => {
        // Sitting it alone with the examiner as the conversation partner is a
        // published way to take this exam, not a fallback the app invented, so
        // none of the pair's turn-taking may leak into it.
        for (const nivaa of LEVELS) {
            const solo = buildTimeline({ nivaa, pick: dealer() });
            expect(solo.some(s => s.floor === 'den-andre'), nivaa).toBe(false);
            expect(tasks(solo).filter(s => s.letter === 'A'), nivaa).toHaveLength(1);
        }
    });

    it('plans each candidate a session in the region of the published total', () => {
        // What one candidate is on the clock for: their own turns, plus the
        // conversation, which is both of theirs. HK-dir publishes a duration
        // per task and 20–25 minutes for the session, but no minute-by-minute
        // split, so this checks the region rather than an invented figure.
        for (const nivaa of LEVELS) {
            const mine = plannedRange(seated(nivaa, 'a').filter(s => s.floor === 'deg'));
            expect(mine.min, nivaa).toBeGreaterThan(0);
            expect(mine.max, nivaa).toBeLessThanOrEqual(TOTAL_MS.max + 5 * MIN);
        }
    });

    it('plans a pair longer than one candidate, because the pair takes turns', () => {
        // Every task but the conversation is answered twice, one candidate at
        // a time, so a pair sits longer than either candidate's own share — and
        // a B1–B2 pair, where each of them also answers two follow-ups, runs
        // past the published total. The summary says that in so many words
        // rather than the timeline trimming the exam to fit.
        const timeline = seated('B1-B2', 'a', pickId('pa-2'));
        const whole = plannedRange(timeline);
        const mine = plannedRange(timeline.filter(s => s.floor === 'deg'));
        expect(whole.max).toBeGreaterThan(mine.max);
        expect(whole.max).toBeGreaterThan(TOTAL_MS.max);
    });
});
