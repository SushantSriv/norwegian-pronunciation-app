/**
 * What can honestly be said about a rehearsal, criterion by criterion.
 *
 * The exam is graded on four things together — flyt, uttale, ordforråd,
 * grammatikk — and a candidate is placed at a level only if they are at that
 * level on ALL FOUR. This module exists to lay the four out in the order the
 * vurderingsskjema lays them out, and to be explicit that three of them are not
 * measured here and why.
 *
 * THE THING THIS IS DEFENDING AGAINST is a number that looks like a grade. A
 * learner reads "72" as "I would pass", whatever caption sits under it. So:
 *
 *   - Nothing here produces a score, a band, or a CEFR estimate. There is no
 *     arithmetic in this file that combines criteria, because combining them is
 *     exactly the step a sensor does and this cannot.
 *   - The one criterion with a real signal reports the signal, not a verdict:
 *     how many pauses and how long, with what a pause cannot distinguish said
 *     in the same breath.
 *   - A criterion with no honest signal says why it has none, rather than
 *     being quietly left out. An absence a learner has to notice is an absence
 *     they will misread.
 *
 * THE EVIDENCE GATE. Under half a minute of speech, or under sixty words, the
 * module reports nothing at all. Two sentences will produce a pause count, and
 * that pause count will mean nothing; publishing it anyway would be the app
 * inventing a finding out of noise.
 */
import type { PauseProfile } from './pauses';
import { PAUSE_SECONDS } from './pauses';

export type Kriterium = 'flyt' | 'uttale' | 'ordforrad' | 'grammatikk';

/** How much speech there has to be before anything is worth reporting. */
export const EVIDENCE = { seconds: 30, tokens: 60 };

export interface TakeEvidence {
    segmentId: string;
    /** Whether the real exam counts this towards the assessment. */
    assessed: boolean;
    transcript: string;
    /** Null when the recording could not be measured at all. */
    pauses: PauseProfile | null;
}

export interface Evidence {
    /** Seconds of audible speech, or null when no take could be measured. */
    seconds: number | null;
    /** Words in the transcripts of the assessed takes. */
    tokens: number;
    enough: boolean;
    /** Why there is not enough, in words. Null when there is. */
    shortfall: string | null;
}

export interface Row {
    kriterium: Kriterium;
    /** The name the vurderingsskjema uses. */
    label: string;
    /** What the exam looks at under this heading. */
    provenSerPaa: string;
    /** What was measured, or null when nothing was. */
    finding: string | null;
    /**
     * What the finding is a signal of, and what it is not. Never null when
     * `finding` is set: a number without this is a number a learner will read
     * as a grade.
     */
    footnote: string | null;
    /** Why nothing was measured. Never null when `finding` is null. */
    whyNot: string | null;
}

export interface CriteriaReport {
    evidence: Evidence;
    /** All four, always, in the order the skjema prints them. */
    rows: Row[];
}

/** Words, roughly. Good enough to gate on, and never reported as a number. */
export const countTokens = (text: string): number =>
    text.split(/\s+/).filter(word => /\p{L}/u.test(word)).length;

const nb = (value: number, digits = 0) =>
    value.toLocaleString('nb-NO', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Why three of the four are not measured.
 *
 * These are reasons, not apologies. Each one names something true about the
 * pipeline that would make the number wrong, so a learner can tell the
 * difference between "not built yet" and "cannot be built honestly".
 */
const WHY_NOT: Record<Exclude<Kriterium, 'flyt'>, string> = {
    uttale:
        'Appen måler uttale ved å sammenligne det du sa med det du skulle si. På et fritt svar finnes det ingen fasit å sammenligne med — og transkripsjonen er tjenestens gjetning, ikke en fasit. Ta uttaleprøven nedenfor i stedet: der er det noe å sammenligne med.',
    ordforrad:
        'Transkripsjonen er taletjenestens gjetning på hvilke ord du brukte. Et ordforrådstall regnet ut av den måler først og fremst hvor godt tjenesten hørte deg — ikke hvor mange ord du har.',
    grammatikk:
        'Taletjenesten skriver det den tror du mente, ikke det du faktisk sa: den retter endelser og ordstilling på veien. En grammatikkfeil kan derfor være borte før appen ser den. Les gjennom svaret ditt selv nedenfor.',
};

const LABELS: Record<Kriterium, { label: string; provenSerPaa: string }> = {
    flyt: {
        label: 'Flyt',
        provenSerPaa:
            'Om du snakker sammenhengende nok til å bli forstått, og om pauser og omformuleringer kommer i veien.',
    },
    uttale: {
        label: 'Uttale',
        provenSerPaa: 'Om uttalen er tydelig nok til at en samtalepartner forstår deg.',
    },
    ordforrad: {
        label: 'Ordforråd',
        provenSerPaa: 'Om du har ord nok til å si det du vil si om emnet.',
    },
    grammatikk: {
        label: 'Grammatikk',
        provenSerPaa: 'Om formene og setningsbygningen holder for oppgaven.',
    },
};

const unmeasured = (kriterium: Exclude<Kriterium, 'flyt'>): Row => ({
    kriterium,
    ...LABELS[kriterium],
    finding: null,
    footnote: null,
    whyNot: WHY_NOT[kriterium],
});

/**
 * Turn the takes into the four rows.
 *
 * Only the ASSESSED takes count towards the evidence — the warm-up is
 * explicitly not part of the vurderingsgrunnlag at the real exam, and an app
 * that quietly counted it would be teaching the wrong thing about what the
 * exam looks at.
 */
export function buildReport(takes: TakeEvidence[]): CriteriaReport {
    const counted = takes.filter(take => take.assessed);
    const measured = counted.map(take => take.pauses).filter((p): p is PauseProfile => !!p?.measured);

    const tokens = counted.reduce((sum, take) => sum + countTokens(take.transcript), 0);
    const seconds = measured.length
        ? measured.reduce((sum, profile) => sum + profile.speaking, 0)
        : null;

    const shortfalls: string[] = [];
    if (seconds === null) shortfalls.push('ingen av opptakene kunne måles');
    else if (seconds < EVIDENCE.seconds)
        shortfalls.push(`du snakket ${nb(seconds)} sekunder, og det trengs ${EVIDENCE.seconds}`);
    if (tokens < EVIDENCE.tokens)
        shortfalls.push(`svarene ble ${nb(tokens)} ord, og det trengs ${EVIDENCE.tokens}`);

    const evidence: Evidence = {
        seconds,
        tokens,
        enough: shortfalls.length === 0,
        shortfall: shortfalls.length ? shortfalls.join(', ') : null,
    };

    const rows: Row[] = [
        flytRow(evidence, measured),
        unmeasured('uttale'),
        unmeasured('ordforrad'),
        unmeasured('grammatikk'),
    ];

    return { evidence, rows };
}

function flytRow(evidence: Evidence, measured: PauseProfile[]): Row {
    const base = { kriterium: 'flyt' as const, ...LABELS.flyt };

    if (!evidence.enough) {
        return {
            ...base,
            finding: null,
            footnote: null,
            whyNot: `Det er for lite å gå på: ${evidence.shortfall}. En pausetelling fra et kort svar sier ingenting, så appen oppgir den ikke.`,
        };
    }

    const pauses = measured.flatMap(profile => profile.pauses);
    const longest = pauses.reduce<number>((best, pause) => Math.max(best, pause.seconds), 0);

    const finding = pauses.length
        ? `${nb(pauses.length)} pauser på ${nb(PAUSE_SECONDS, 1)} sekunder eller mer. Den lengste var ${nb(longest, 1)} sekunder.`
        : `Ingen pauser på ${nb(PAUSE_SECONDS, 1)} sekunder eller mer.`;

    return {
        ...base,
        finding,
        footnote:
            'Dette er stillhet i opptaket, ikke en vurdering av flyt. Appen hører ikke forskjell på en tenkepause, et pust og et mikrofonbortfall — og den hører ikke fyllord som «eh» og «liksom» i det hele tatt, siden det er lyd. Bruk tallet til å finne stedene i opptaket, og hør selv.',
        whyNot: null,
    };
}
