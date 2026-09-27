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
 */
import {
    AAPNING,
    APP_SIER,
    AVSLUTNING_OPPGAVE,
    INNLEDNING,
    OPPVARMING,
} from '../data/muntlig/eksaminator';
import { KILDER, POOLS, type Kilde, type Nivaa, type Oppgave, type PoolId } from '../data/muntlig/oppgaver';

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
}

const drawFrom = (pool: PoolId, pick: PickOppgave): Oppgave =>
    pick(pool, POOLS[pool].oppgaver);

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

/** One individual speaking slot. */
function individuell(
    id: string,
    letter: Segment['letter'],
    title: string,
    intro: string[],
    pool: PoolId,
    pick: PickOppgave,
    minMs: number,
    maxMs: number
): Segment {
    const oppgave = drawFrom(pool, pick);
    return {
        id,
        kind: 'individuell',
        letter,
        title,
        floor: 'deg',
        says: spokenFor(intro, oppgave),
        oppgave,
        kilde: POOLS[pool].kilde,
        minMs,
        maxMs,
        assessed: true,
        runnable: true,
    };
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
export function buildTimeline({ nivaa, pick = firstOf, pairPresent = false }: Options): Segment[] {
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
        out.push({
            id: 'oppvarming',
            kind: 'oppvarming',
            title: 'Oppvarming',
            floor: 'deg',
            says: [OPPVARMING.says],
            note: OPPVARMING.note,
            kilde: KILDER.mal,
            minMs: 1 * MIN,
            maxMs: 2 * MIN,
            assessed: false,
            runnable: true,
        });
    }

    if (nivaa === 'A1-A2') {
        out.push(
            individuell(
                'a',
                'A',
                'Fortelle',
                [INNLEDNING.a1a2A],
                'fortelle-selv',
                pick,
                1 * MIN,
                2 * MIN
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
            individuell(
                'd',
                'D',
                'Fortelle / beskrive',
                [],
                'fortelle-beskrive',
                pick,
                2 * MIN,
                3 * MIN
            )
        );
    }

    if (nivaa === 'A2-B1') {
        out.push(
            individuell(
                'a',
                'A',
                'Fortelle / beskrive',
                [],
                'fortelle-beskrive',
                pick,
                2 * MIN,
                3 * MIN
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
            individuell(
                'c',
                'C',
                'Uttrykke synspunkt',
                [INNLEDNING.entemaHver],
                'synspunkt',
                pick,
                2 * MIN,
                3 * MIN
            )
        );
    }

    if (nivaa === 'B1-B2') {
        out.push(
            individuell(
                'a',
                'A',
                'Uttrykke og grunngi',
                [],
                'synspunkt',
                pick,
                2 * MIN,
                3 * MIN
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

        out.push(
            {
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
            },
            {
                id: 'c',
                kind: 'individuell',
                letter: 'C',
                title: 'Argumentere',
                floor: 'deg',
                // The påstand was read aloud a moment ago, with time to think
                // after it. Reading it again here would be the app padding.
                says: [INNLEDNING.duKanBegynne],
                oppgave: paastand,
                kilde: KILDER.b1b2,
                minMs: 2 * MIN,
                maxMs: 3 * MIN,
                assessed: true,
                runnable: true,
            }
        );

        // Two of the published follow-ups must be asked. Where none are
        // published the app says so rather than writing its own.
        const followUps = paastand.followUps ?? [];
        if (followUps.length) {
            followUps.slice(0, 2).forEach((question, index) => {
                out.push({
                    id: `c-oppfolging-${index + 1}`,
                    kind: 'oppfolging',
                    letter: 'C',
                    title: `Oppfølging ${index + 1}`,
                    floor: 'deg',
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
                id: 'c-oppfolging-mangler',
                kind: 'oppfolging',
                letter: 'C',
                title: 'Oppfølging',
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
