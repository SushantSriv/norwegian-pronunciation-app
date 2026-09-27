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
