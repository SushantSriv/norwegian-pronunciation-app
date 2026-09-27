/**
 * The published example tasks for the Norwegian oral exam.
 *
 * EVERY ITEM HERE IS TRANSCRIBED FROM AN HK-DIR DOCUMENT. Nothing is written by
 * this app, and nothing is paraphrased. That is a deliberate refusal rather
 * than laziness: the live task bank is confidential — printed from PAD one week
 * before the test period and shredded afterwards — so no app can hand anybody
 * the real questions, and inventing sixty plausible ones would give a candidate
 * the feeling of having seen the exam while actually giving them our guesses.
 *
 * The published examples are worth more than invented ones anyway. The same
 * items appear both as "eksempler" in the candidate PDFs and inside the
 * official examiner templates, so they are the live register and the live
 * phrasing.
 *
 * If practice items are ever added they go under their own heading, marked as
 * not official, and are never merged into this list.
 */

export type Nivaa = 'A1-A2' | 'A2-B1' | 'B1-B2';

/**
 * Pools are shared across levels, because the exam shares them.
 *
 * A1-A2 oppgave D and A2-B1 oppgave A draw the same items; so do A2-B1 oppgave
 * C and B1-B2 oppgave A. Five pools, not fifteen slots.
 */
export type PoolId =
    | 'fortelle-selv'
    | 'fortelle-beskrive'
    | 'samtale-dagligdags'
    | 'samtale-synspunkt'
    | 'synspunkt'
    | 'paastand';

export interface Oppgave {
    id: string;
    /** Verbatim, as printed. */
    text: string;
    /**
     * Published follow-up questions, where HK-dir publishes any.
     *
     * Only the car påstand has them. For the other three the app says so and
     * declines to invent replacements — a made-up follow-up is the app putting
     * words in the examiner's mouth at the exact moment a candidate is most
     * likely to believe them.
     */
    followUps?: string[];
}

/** Where a piece of text came from, shown beside it rather than claimed. */
export interface Kilde {
    label: string;
    url: string;
}

export const KILDER: Record<string, Kilde> = {
    a1a2: {
        label: 'Eksempeloppgåver A1–A2, HK-dir',
        url: 'https://hkdir.no/voksenopplaering/norsk-og-samfunnskunnskap/om-norskprovene/norskproven-a1-b2/prove-i-munnleg-kommunikasjon',
    },
    a2b1: {
        label: 'Eksempeloppgåver A2–B1, HK-dir',
        url: 'https://hkdir.no/voksenopplaering/norsk-og-samfunnskunnskap/om-norskprovene/norskproven-a1-b2/prove-i-munnleg-kommunikasjon',
    },
    b1b2: {
        label: 'Eksempeloppgåver B1–B2, HK-dir',
        url: 'https://hkdir.no/voksenopplaering/norsk-og-samfunnskunnskap/om-norskprovene/norskproven-a1-b2/prove-i-munnleg-kommunikasjon',
    },
    mal: {
        label: 'Mal til eksaminator, HK-dir',
        url: 'https://hkdir.no/voksenopplaering/norsk-og-samfunnskunnskap/om-norskprovene/norskproven-a1-b2/prove-i-munnleg-kommunikasjon',
    },
    veiledning: {
        label: 'Vedlegg 4 — Veiledning til gjennomføring av prøven i muntlig norsk (A1–B2)',
        url: 'https://hkdir.no/voksenopplaering/norsk-og-samfunnskunnskap/om-norskprovene/norskproven-a1-b2/prove-i-munnleg-kommunikasjon',
    },
};

export const POOLS: Record<PoolId, { kilde: Kilde; oppgaver: Oppgave[] }> = {
    // The one fixed task in the whole exam: identical for both candidates, in
    // every A1-A2 test, and — unlike the warm-up at the higher levels — assessed.
    'fortelle-selv': {
        kilde: KILDER.a1a2,
        oppgaver: [{ id: 'selv-1', text: 'Kan du fortelle litt om deg selv?' }],
    },

    // A1-A2 oppgave D and A2-B1 oppgave A.
    'fortelle-beskrive': {
        kilde: KILDER.a2b1,
        oppgaver: [
            { id: 'fb-1', text: 'Kan du fortelle om hvordan du bruker data/pc på skolen?' },
            { id: 'fb-2', text: 'Kan du fortelle om hva du pleier å bruke penger på?' },
            { id: 'fb-3', text: 'Kan du fortelle om et sted du har lyst å reise til?' },
        ],
    },

    // A1-A2 oppgave C.
    'samtale-dagligdags': {
        kilde: KILDER.a1a2,
        oppgaver: [
            { id: 'sd-1', text: 'Kan dere snakke sammen om været i Norge?' },
            { id: 'sd-2', text: 'Kan dere snakke sammen om hva dere gjør på lørdager?' },
        ],
    },

    // A2-B1 oppgave B and B1-B2 oppgave B.
    'samtale-synspunkt': {
        kilde: KILDER.a2b1,
        oppgaver: [
            { id: 'ss-1', text: 'Kan dere snakke sammen om hvordan man kan være en god venn?' },
            {
                id: 'ss-2',
                text: 'Hva mener dere er det beste man kan gjøre for å bli kjent med nye folk?',
            },
            {
                id: 'ss-3',
                text: 'Synes dere det er viktig at både kvinner og menn jobber utenfor hjemmet? Hvorfor/hvorfor ikke?',
            },
            {
                id: 'ss-4',
                text: 'Mener dere det er viktigere å være flink til å snakke norsk enn å skrive norsk? Hvorfor/hvorfor ikke?',
            },
        ],
    },

    // A2-B1 oppgave C and B1-B2 oppgave A.
    synspunkt: {
        kilde: KILDER.a2b1,
        oppgaver: [
            {
                id: 'sy-1',
                text: 'Synes du det er bra at folk er opptatt av kropp og helse? Hvorfor/hvorfor ikke?',
            },
            {
                id: 'sy-2',
                text: 'Synes du det er viktig å ta vare på kulturen fra hjemlandet ditt når du bor i Norge?',
            },
            { id: 'sy-3', text: 'Synes du at alle ungdommer bør ta en utdanning?' },
            { id: 'sy-4', text: 'Hva er positivt og negativt med å jobbe veldig mye?' },
        ],
    },

    // B1-B2 oppgave C. Only the car påstand has published follow-ups, and the
    // guidance says two of them must be asked to push the candidate to B2.
    paastand: {
        kilde: KILDER.b1b2,
        oppgaver: [
            { id: 'pa-1', text: 'Folk bør gå på jobb selv om de er litt syke.' },
            {
                id: 'pa-2',
                text: 'Det er for dyrt å ha bil i Norge.',
                followUps: [
                    'Hvilke fordeler og ulemper ser du ved å eie en bil?',
                    'Tror du folk i byene og på landet har ulike meninger om bruk av bil? Begrunn synet ditt.',
                    'Tror du det er mulig å legge til rette for et samfunn uten biler? Begrunn synet ditt.',
                ],
            },
            { id: 'pa-3', text: 'Nordmenn er for opptatt av jobb og karriere.' },
            {
                id: 'pa-4',
                text: 'Ungdommer bør ikke bo hjemme hos foreldrene etter at de har fylt 20 år.',
            },
        ],
    },
};

/** How many of the published follow-ups the examiner must ask, where they exist. */
export const PAAKREVDE_OPPFOLGINGER = 2;

/**
 * Extra prompts, written for this app and never mixed into the published ones.
 *
 * HK-dir publishes three or four examples per slot, which is enough to see what
 * a task looks like and not enough to rehearse with: by the third run every
 * question is one you have already answered, and rehearsing an answer you have
 * memorised is the one thing this mode is meant to stop you doing.
 *
 * THESE ARE NOT EXAM TASKS AND ARE LABELLED AS SUCH EVERYWHERE THEY APPEAR.
 * They are written in the register and the grammatical frame of the published
 * ones — «Kan du fortelle om …», «Synes du …? Hvorfor/hvorfor ikke?» — because
 * recognising the frame is part of what a rehearsal is for. They are kept in a
 * separate structure from POOLS rather than appended to it, so that no future
 * change can quietly let one of them be presented as something HK-dir wrote.
 *
 * The real tasks are confidential: printed from PAD a week before the exam
 * period and shredded afterwards. Nothing here is a guess at them, and nothing
 * here should be read as one.
 */
export const OVING_KILDE: Kilde = {
    label: 'skrevet for denne appen — ikke publisert av HK-dir',
    url: 'https://github.com/SushantSriv/norwegian-pronunciation-app',
};

export const OVINGSOPPGAVER: Partial<Record<PoolId, Oppgave[]>> = {
    'fortelle-beskrive': [
        { id: 'ov-fb-1', text: 'Kan du fortelle om en vanlig dag hos deg?' },
        { id: 'ov-fb-2', text: 'Kan du fortelle om hva du gjør når du har fri?' },
        { id: 'ov-fb-3', text: 'Kan du fortelle om hvordan du kommer deg til jobb eller skole?' },
        { id: 'ov-fb-4', text: 'Kan du fortelle om et måltid du liker å lage?' },
        { id: 'ov-fb-5', text: 'Kan du fortelle om stedet der du bor?' },
        { id: 'ov-fb-6', text: 'Kan du fortelle om noe du har lært i Norge?' },
        { id: 'ov-fb-7', text: 'Kan du fortelle om hva du gjør for å holde deg i form?' },
        { id: 'ov-fb-8', text: 'Kan du fortelle om en høytid som betyr noe for deg?' },
    ],
    'samtale-dagligdags': [
        { id: 'ov-sd-1', text: 'Kan dere snakke sammen om hva dere pleier å handle i butikken?' },
        { id: 'ov-sd-2', text: 'Kan dere snakke sammen om hvordan dere reiser rundt i byen?' },
        { id: 'ov-sd-3', text: 'Kan dere snakke sammen om hva dere gjør når dere blir syke?' },
        { id: 'ov-sd-4', text: 'Kan dere snakke sammen om hva dere liker å gjøre om sommeren?' },
        { id: 'ov-sd-5', text: 'Kan dere snakke sammen om hvordan dere lærer norske ord?' },
    ],
    'samtale-synspunkt': [
        { id: 'ov-ss-1', text: 'Kan dere snakke sammen om hva som gjør en god nabo?' },
        {
            id: 'ov-ss-2',
            text: 'Synes dere det er lett eller vanskelig å bli kjent med folk i Norge? Hvorfor/hvorfor ikke?',
        },
        {
            id: 'ov-ss-3',
            text: 'Mener dere at barn bør ha mobiltelefon på skolen? Hvorfor/hvorfor ikke?',
        },
        { id: 'ov-ss-4', text: 'Hva mener dere er det viktigste når man skal lære et nytt språk?' },
        {
            id: 'ov-ss-5',
            text: 'Synes dere det er viktig å kunne dialekten der man bor? Hvorfor/hvorfor ikke?',
        },
        { id: 'ov-ss-6', text: 'Kan dere snakke sammen om hva som er bra med å bo i en liten by?' },
    ],
    synspunkt: [
        { id: 'ov-sy-1', text: 'Synes du det er viktig å kunne lage mat selv? Hvorfor/hvorfor ikke?' },
        { id: 'ov-sy-2', text: 'Hva er positivt og negativt med å jobbe hjemmefra?' },
        { id: 'ov-sy-3', text: 'Synes du alle bør kunne svømme? Hvorfor/hvorfor ikke?' },
        { id: 'ov-sy-4', text: 'Hva mener du skal til for å trives på en arbeidsplass?' },
        { id: 'ov-sy-5', text: 'Synes du det er bra at butikkene har åpent på søndager?' },
        { id: 'ov-sy-6', text: 'Hva er positivt og negativt med å flytte til et nytt land?' },
    ],
    paastand: [
        { id: 'ov-pa-1', text: 'Alle burde lære seg å sykle til jobben.' },
        { id: 'ov-pa-2', text: 'Det er bedre å leie enn å eie bolig.' },
        { id: 'ov-pa-3', text: 'Barn lærer mer av å være ute enn av å sitte inne.' },
        { id: 'ov-pa-4', text: 'Folk bruker for mye tid på sosiale medier.' },
        { id: 'ov-pa-5', text: 'Alle på en arbeidsplass burde snakke norsk sammen.' },
    ],
};
