/**
 * The shape of one rehearsal, built from the published format.
 *
 * Pure: it takes a level and a way of picking prompts and returns the whole
 * session as a list of segments. No timers, no audio, no React — so the thing
 * that has to be faithful to HK-dir's documents can be tested against them
 * without a browser.
 *
 * `floor` is the single source of truth for whose turn it is, and therefore for
 * whether the microphone is open. Everything else in the mode reads it rather
 * than deciding for itself; a bug where the app listens while it is talking
 * then has exactly one place to be.
 *
 * In a pair the floor is per seat, which is why `seat` is an argument here
 * rather than something a component works out afterwards. Both devices build
 * the same segments in the same order from the same shared seed — the two of
 * them step through one index together — and the only thing that differs
 * between them is which turn says 'deg' and which says 'den-andre'.
 */
import {
    AAPNING,
    APP_SIER,
    AVSLUTNING_OPPGAVE,
    INNLEDNING,
    OPPVARMING,
} from '../data/muntlig/eksaminator';
import { KILDER, POOLS, type Kilde, type Nivaa, type Oppgave, type PoolId } from '../data/muntlig/oppgaver';
import { SEATS, type Seat } from './roomProtocol';

/** Whose turn it is. 'ingen' means nobody is being recorded. */
export type Floor = 'eksaminator' | 'deg' | 'den-andre' | 'ingen';

export type SegKind =
    | 'apning'
    | 'oppvarming'
    | 'individuell'
    | 'samtale'
    | 'tenketid'
    | 'oppfolging'
    | 'avslutning';

export interface Segment {
    id: string;
    kind: SegKind;
    /** The real papers letter the tasks; only the public web page numbers them. */
    letter?: 'A' | 'B' | 'C' | 'D';
    /** A short name for the map down the side. */
    title: string;
    floor: Floor;
    /** Spoken aloud, verbatim, in order. */
    says: string[];
    /** Shown on screen and never spoken: at the real exam this is not speech. */
    note?: string;
    /** The task itself, where there is one. */
    oppgave?: Oppgave;
    kilde?: Kilde;
    /** The published lower and upper bounds for this slot, in milliseconds. */
    minMs?: number;
    maxMs?: number;
    /** Whether the real exam counts this towards the assessment. */
    assessed: boolean;
    /** False when the app cannot honestly run it; `unavailable` says why. */
    runnable: boolean;
    unavailable?: string;
}

const MIN = 60_000;

/** How a prompt is chosen from a pool. Injected so a test is not random. */
export type PickOppgave = (pool: PoolId, oppgaver: Oppgave[]) => Oppgave;

/** The default: whichever the caller's shuffle put first. */
export const firstOf: PickOppgave = (_pool, oppgaver) => oppgaver[0];

interface Options {
    nivaa: Nivaa;
    pick?: PickOppgave;
    /**
     * Whether a second candidate is present.
     *
     * With nobody there the pair task is shown with its real letter and
     * duration but cannot be run — and says so. Greying it out is the honest
     * option: a synthetic partner that always agrees teaches the wrong thing,
     * and hiding the task would misrepresent a fifth of the exam.
     */
    pairPresent?: boolean;
    /**
     * Which of the two chairs this device is sitting in.
     *
     * The two devices build the SAME segments, in the same order, with the
     * same prompts — so the index the pair steps through together still means
     * the same turn on both screens — and they differ only in who holds the
     * floor on each of them. Undefined is sitting alone, and then every turn
     * is yours.
     */
    seat?: Seat;
}

/** One candidate's go at a stretch of the exam that is taken one at a time. */
interface Tur {
    /** Whose figure lights up, and therefore whether this device records. */
    floor: Floor;
    /** Keeps the two goes apart in the ids and in the map down the side. */
    suffix: string;
    /** Says whose go it is, where the title is shown. */
    label: string;
    /** The examiner's framing is read once, before the first go. */
    first: boolean;
}

/**
 * How a one-at-a-time stretch is taken, from this device's point of view.
 *
 * Alone, once. With a partner, twice: "I oppgave A skal dere snakke én og én",
 * "I oppgave C skal dere snakke én og én om ett tema hver" — everything except
 * the conversation task is taken by one candidate at a time, and an app that
 * hands both of them the floor at once has two people talking over each other
 * down a live microphone.
 *
 * WHICH CHAIR GOES FIRST IS THE APP'S DOING, not something transcribed: HK-dir
 * publishes nothing about how an examiner chooses who begins. What it does
 * publish — that exactly one candidate speaks at a time — is what this
 * reproduces, and the order falls out of the seat letters the room has already
 * handed out, so the two devices agree on it without negotiating anything.
 */
function turer(pairPresent: boolean, seat?: Seat): Tur[] {
    if (!pairPresent) return [{ floor: 'deg', suffix: '', label: '', first: true }];

    // A pair whose seat has somehow not arrived is treated as the first
    // candidate rather than as both: the one thing that must never happen is
    // one device holding the floor on both turns.
    const mine = seat ?? SEATS[0];
    return SEATS.map((chair, index) => ({
        floor: chair === mine ? 'deg' : 'den-andre',
        suffix: `-${index + 1}`,
        label: chair === mine ? ' (du)' : ' (den andre)',
        first: index === 0,
    }));
}

const drawFrom = (pool: PoolId, pick: PickOppgave): Oppgave =>
    pick(pool, POOLS[pool].oppgaver);

/**
 * A second topic from the same pool, different from the first.
 *
 * Oppgave C at A2-B1 is the one slot where the examiner promises "ett tema
 * hver" and tells the second candidate "Du skal få en annen oppgave etterpå".
 * Drawing once and handing the same prompt to both would have the app
 * contradict the line it has just read aloud.
 *
 * EXACTLY TWO DRAWS, ALWAYS, in the same order on both devices. A retry loop
 * would make the number of draws depend on what came back, and the moment the
 * two devices disagree about how many times they have asked, every later draw
 * is a different question on each screen. When the same item comes back twice
 * the next published one takes its place instead — which also means a pool
 * with a single item in it returns that item rather than spinning.
 */
function annetTemaEnn(first: Oppgave, pool: PoolId, pick: PickOppgave): Oppgave {
    const oppgaver = POOLS[pool].oppgaver;
    const drawn = drawFrom(pool, pick);
    if (drawn.id !== first.id) return drawn;
    const at = oppgaver.findIndex(candidate => candidate.id === first.id);
    return oppgaver[(at + 1) % oppgaver.length];
}

/**
 * Everything the examiner says for one task, in order.
 *
 * The framing, then THE TASK ITSELF READ ALOUD, then the cue to begin. The
 * middle one is the part an app forgets: at the exam the candidate has the task
 * on paper and hears it read out, and an app that only put it on screen would
 * be rehearsing reading rather than listening. The B1-B2 påstand was already
 * read aloud; this makes every task consistent with it.
 *
 * The cue always comes last, because it is the moment the microphone opens and
 * that is what the candidate needs to hear. Two of the framings quote a
 * template that already ends with it, so those say it twice — which is verbatim
 * on both counts and is what examiners do anyway.
 */
const spokenFor = (intro: string[], oppgave: Oppgave): string[] => [
    ...intro,
    oppgave.text,
    INNLEDNING.duKanBegynne,
];

/**
 * One individual speaking slot, as the turns it is actually taken in.
 *
 * `ettTemaHver` is the single slot whose framing promises the pair a topic
 * each; everywhere else the framing either says the opposite outright ("Dere
 * får samme oppgave") or says nothing, and the app is not going to invent a
 * second topic where the examiner has not promised one.
 */
function individuell(
    id: string,
    letter: Segment['letter'],
    title: string,
    intro: string[],
    pool: PoolId,
    pick: PickOppgave,
    minMs: number,
    maxMs: number,
    turns: Tur[],
    ettTemaHver = false
): Segment[] {
    const oppgave = drawFrom(pool, pick);
    // Drawn whether or not anybody is in the other chair, and whichever chair
    // this device is in: the pair's shared seed only keeps the two of them on
    // the same questions while both ask `pick` for the same things in the same
    // order.
    const annet = ettTemaHver ? annetTemaEnn(oppgave, pool, pick) : oppgave;

    return turns.map(tur => ({
        id: `${id}${tur.suffix}`,
        kind: 'individuell',
        letter,
        title: `${title}${tur.label}`,
        floor: tur.floor,
        // The second candidate's own topic is read out, because they have not
        // heard it yet. A topic the two of them share was read a moment ago,
        // so there only the cue to begin is left to say.
        says: tur.first
            ? spokenFor(intro, oppgave)
            : ettTemaHver
              ? spokenFor([], annet)
              : [INNLEDNING.duKanBegynne],
        oppgave: tur.first ? oppgave : annet,
        kilde: POOLS[pool].kilde,
        minMs,
        maxMs,
        assessed: true,
        runnable: true,
    }));
}

/** The conversation task, which needs a person the app cannot supply. */
function samtale(
    id: string,
    letter: Segment['letter'],
    says: string[],
    pool: PoolId,
    pick: PickOppgave,
    minMs: number,
    maxMs: number,
    pairPresent: boolean,
    note?: string
): Segment {
    const oppgave = drawFrom(pool, pick);
    return {
        id,
        kind: 'samtale',
        letter,
        title: 'Samtale',
        floor: pairPresent ? 'deg' : 'ingen',
        // Read out even when it cannot be run: a candidate should hear what
        // the task they are missing actually asks.
        says: [...says, oppgave.text],
        note,
        oppgave,
        kilde: POOLS[pool].kilde,
        minMs,
        maxMs,
        assessed: true,
        runnable: pairPresent,
        unavailable: pairPresent ? undefined : APP_SIER.ingenPartner,
    };
}

/**
 * Build the session.
 *
 * The three levels are genuinely different shapes, not one shape with
 * parameters: A1-A2 has four tasks and no warm-up, and its self-presentation
 * counts; the other two have three tasks, an unassessed warm-up, and a
 * conversation slot twice as long.
 */
export function buildTimeline({
    nivaa,
    pick = firstOf,
    pairPresent = false,
    seat,
}: Options): Segment[] {
    const turns = turer(pairPresent, seat);
    const out: Segment[] = [
        {
            id: 'apning',
            kind: 'apning',
            title: 'Åpning',
            floor: 'eksaminator',
            says: [AAPNING[nivaa]],
            kilde: KILDER.mal,
            assessed: false,
            runnable: true,
        },
    ];

    if (nivaa !== 'A1-A2') {
        out.push(
            ...turns.map(tur => ({
                id: `oppvarming${tur.suffix}`,
                kind: 'oppvarming' as const,
                title: `Oppvarming${tur.label}`,
                floor: tur.floor,
                // "Vil dere begynne med å fortelle helt kort om dere selv? Du
                // kan begynne." is put to both candidates and cues one of
                // them; the second hears the cue and nothing else, because
                // the question was asked of the pair.
                says: tur.first ? [OPPVARMING.says] : [INNLEDNING.duKanBegynne],
                note: OPPVARMING.note,
                kilde: KILDER.mal,
                minMs: 1 * MIN,
                maxMs: 2 * MIN,
                assessed: false,
                runnable: true,
            }))
        );
    }

    if (nivaa === 'A1-A2') {
        out.push(
            ...individuell(
                'a',
                'A',
                'Fortelle',
                [INNLEDNING.a1a2A],
                'fortelle-selv',
                pick,
                1 * MIN,
                2 * MIN,
                turns
            ),
            {
                // The picture task. HK-dir's own drawings cannot be
                // redistributed and a wrong picture is a wrong task, so the
                // clock and the script run and the image does not.
                id: 'b',
                kind: 'individuell',
                letter: 'B',
                title: 'Beskrive bilde',
                floor: 'ingen',
                says: [INNLEDNING.a1a2B],
                kilde: KILDER.a1a2,
                minMs: 2 * MIN,
                maxMs: 3 * MIN,
                assessed: true,
                runnable: false,
                unavailable: APP_SIER.ingenBilder,
            },
            samtale(
                'c',
                'C',
                [INNLEDNING.a1a2C],
                'samtale-dagligdags',
                pick,
                2 * MIN,
                3 * MIN,
                pairPresent
            ),
            ...individuell(
                'd',
                'D',
                'Fortelle / beskrive',
                [],
                'fortelle-beskrive',
                pick,
                2 * MIN,
                3 * MIN,
                turns
            )
        );
    }

    if (nivaa === 'A2-B1') {
        out.push(
            ...individuell(
                'a',
                'A',
                'Fortelle / beskrive',
                [],
                'fortelle-beskrive',
                pick,
                2 * MIN,
                3 * MIN,
                turns
            ),
            samtale(
                'b',
                'B',
                [INNLEDNING.samtaleBeggeAktive],
                'samtale-synspunkt',
                pick,
                5 * MIN,
                7 * MIN,
                pairPresent
            ),
            ...individuell(
                'c',
                'C',
                'Uttrykke synspunkt',
                [INNLEDNING.entemaHver],
                'synspunkt',
                pick,
                2 * MIN,
                3 * MIN,
                turns,
                // "I oppgave C skal dere snakke én og én om ett tema hver …
                // Til den andre kandidaten: Du skal få en annen oppgave
                // etterpå."
                true
            )
        );
    }

    if (nivaa === 'B1-B2') {
        out.push(
            ...individuell(
                'a',
                'A',
                'Uttrykke og grunngi',
                [],
                'synspunkt',
                pick,
                2 * MIN,
                3 * MIN,
                turns
            ),
            samtale(
                'b',
                'B',
                [INNLEDNING.samtaleOppgittEmne],
                'samtale-synspunkt',
                pick,
                5 * MIN,
                7 * MIN,
                pairPresent,
                APP_SIER.ingenOppfolgingPaaSamtalen
            )
        );

        const paastand = drawFrom('paastand', pick);

        out.push({
            id: 'c-tenketid',
            kind: 'tenketid',
            letter: 'C',
            title: 'Tenketid',
            floor: 'ingen',
            says: [INNLEDNING.argumentere, paastand.text, INNLEDNING.tenketid],
            note: APP_SIER.ingenTenketall,
            oppgave: paastand,
            kilde: KILDER.b1b2,
            assessed: false,
            runnable: true,
        });

        // Oppgave C is a block rather than a slot: "Etterpå får dere noen
        // spørsmål til temaet" — the follow-ups are put to the candidate who
        // has just answered, about what they said. So a pair takes the whole
        // block one after the other, rather than the examiner working through
        // both candidates once per question.
        for (const tur of turns) {
            out.push({
                id: `c${tur.suffix}`,
                kind: 'individuell',
                letter: 'C',
                title: `Argumentere${tur.label}`,
                floor: tur.floor,
                // The påstand was read aloud a moment ago, with time to think
                // after it, and both candidates heard it. Reading it again
                // here would be the app padding.
                says: [INNLEDNING.duKanBegynne],
                oppgave: paastand,
                kilde: KILDER.b1b2,
                minMs: 2 * MIN,
                maxMs: 3 * MIN,
                assessed: true,
                runnable: true,
            });

            // Two of the published follow-ups must be asked. Where none are
            // published the app says so rather than writing its own.
            const followUps = paastand.followUps ?? [];
            if (followUps.length) {
                followUps.slice(0, 2).forEach((question, index) => {
                    out.push({
                        id: `c-oppfolging-${index + 1}${tur.suffix}`,
                        kind: 'oppfolging',
                        letter: 'C',
                        title: `Oppfølging ${index + 1}${tur.label}`,
                        floor: tur.floor,
                        // Asked again of the second candidate, in the words it
                        // is published in: it is a question to be answered,
                        // not a framing that has already been heard.
                        says: [question],
                        kilde: KILDER.b1b2,
                        minMs: 1 * MIN,
                        maxMs: 2 * MIN,
                        assessed: true,
                        runnable: true,
                    });
                });
            } else {
                out.push({
                    id: `c-oppfolging-mangler${tur.suffix}`,
                    kind: 'oppfolging',
                    letter: 'C',
                    title: `Oppfølging${tur.label}`,
                    floor: 'ingen',
                    says: [],
                    note: APP_SIER.oppfolgingIkkePublisert,
                    kilde: KILDER.b1b2,
                    assessed: false,
                    runnable: false,
                    unavailable: APP_SIER.oppfolgingIkkePublisert,
                });
            }
        }
    }

    out.push({
        id: 'avslutning',
        kind: 'avslutning',
        title: 'Slutt',
        floor: 'eksaminator',
        says: [AVSLUTNING_OPPGAVE],
        kilde: KILDER.mal,
        assessed: false,
        runnable: true,
    });

    return out;
}

/** The published total for the whole session, for the clock to sit against. */
export const TOTAL_MS = { min: 20 * MIN, max: 25 * MIN };

/** Summed from the per-task bounds, which is not the same as a published total. */
export function plannedRange(timeline: Segment[]): { min: number; max: number } {
    return timeline.reduce(
        (total, segment) => ({
            min: total.min + (segment.runnable ? (segment.minMs ?? 0) : 0),
            max: total.max + (segment.runnable ? (segment.maxMs ?? 0) : 0),
        }),
        { min: 0, max: 0 }
    );
}
