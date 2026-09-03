/**
 * Norwegian pitch accent (tonelag / tonem).
 *
 * Norwegian distinguishes two pitch accents, and getting them wrong is one of
 * the clearest markers of a non-native speaker — they carry meaning:
 *
 *   bønder (farmers)  = accent 1     bønner (beans)     = accent 2
 *   hender (hands)    = accent 1     hender (happens)   = accent 2
 *
 * IMPORTANT SCOPE. Accent realisation is dialect-specific and this models
 * ONLY Urban East Norwegian (Oslo), which is what the Bokmål corpus and the
 * reference voices target. Bergen and parts of Nordland realise these
 * differently, and some dialects neutralise the distinction entirely. The
 * contours below are a learner-facing simplification of the standard
 * L*H / H*LH description, not a phonological transcription.
 */

import type { CompoundLink } from '../utils/norwegianG2P';

export type PitchAccent = 'ACCENT_1' | 'ACCENT_2' | 'NONE';

export interface AccentInfo {
    accent: PitchAccent;
    /** Curated entries are hand-checked; rule entries are derived and fallible. */
    source: 'curated' | 'rule';
    syllables: number;
}

const VOWELS = 'aeiouyæøå';
/** Vowel sequences that form a single syllable nucleus. */
const DIPHTHONGS = ['ei', 'øy', 'au', 'ai', 'oi'];

const normalize = (word: string) => word.toLowerCase().replace(/[^a-zæøå]/g, '');

/**
 * Count syllables by counting vowel nuclei, treating diphthongs as one.
 * Good enough for accent assignment, which only needs "one vs more than one".
 */
export function countSyllables(word: string): number {
    const w = normalize(word);
    let count = 0;
    let i = 0;
    while (i < w.length) {
        if (!VOWELS.includes(w[i])) {
            i += 1;
            continue;
        }
        count += 1;
        // Consume the whole nucleus: a diphthong, or a run of identical vowels.
        const diphthong = DIPHTHONGS.find(d => w.startsWith(d, i));
        if (diphthong) {
            i += diphthong.length;
        } else {
            i += 1;
            while (i < w.length && VOWELS.includes(w[i]) && w[i] === w[i - 1]) i += 1;
        }
    }
    return count;
}

/**
 * Hand-checked accents, for words the rules get wrong. Mostly historically
 * monosyllabic words that gained a syllable, which keep accent 1 despite now
 * being polysyllabic.
 */
const CURATED: Record<string, PitchAccent> = {
    // Classic minimal pairs — the accent is the only thing distinguishing them.
    bønder: 'ACCENT_1', // farmers
    bønner: 'ACCENT_2', // beans / prayers
    tanken: 'ACCENT_1', // the tank  (tank + definite)
    hender: 'ACCENT_1', // hands     (hånd/hender)

    // Historically monosyllabic, still accent 1.
    andre: 'ACCENT_1',
    andres: 'ACCENT_1',
    landet: 'ACCENT_1',
    vannet: 'ACCENT_1',

    // Common loanwords with final stress take accent 1.
    hotell: 'ACCENT_1',
    kafé: 'ACCENT_1',
    kafe: 'ACCENT_1',
    stasjon: 'ACCENT_1',
    sesong: 'ACCENT_1',
    person: 'ACCENT_1',
    idé: 'ACCENT_1',
    ide: 'ACCENT_1',
};

/** Definite/possessive suffixes that do not by themselves create accent 2. */
const DEFINITE_SUFFIXES = ['en', 'et', 'a', 'ene', 'ens', 'ets'];

/**
 * Which accent a word carries.
 *
 * The rules, in order:
 *  1. A curated entry always wins.
 *  2. One syllable carries no tonal contrast at all — reported as accent 1,
 *     since that is how it patterns, but there is nothing to contrast with.
 *  3. A monosyllabic stem plus a definite ending keeps accent 1
 *     (bil → bilen, hus → huset). This covers a large share of the corpus.
 *  4. Everything else polysyllabic defaults to accent 2, which is the
 *     majority case for native Norwegian words.
 */
export function pitchAccentFor(word: string): AccentInfo {
    const w = normalize(word);
    const syllables = countSyllables(w);

    if (!w) return { accent: 'NONE', source: 'rule', syllables: 0 };

    const curated = CURATED[w];
    if (curated) return { accent: curated, source: 'curated', syllables };

    if (syllables <= 1) return { accent: 'ACCENT_1', source: 'rule', syllables };

    for (const suffix of DEFINITE_SUFFIXES) {
        if (!w.endsWith(suffix)) continue;
        const stem = w.slice(0, -suffix.length);
        // A doubled final consonant is just orthography (vann → vannet).
        const bare = stem.replace(/([bdfgklmnprstv])\1$/, '$1');
        if (bare && countSyllables(bare) <= 1) {
            return { accent: 'ACCENT_1', source: 'rule', syllables };
        }
    }

    return { accent: 'ACCENT_2', source: 'rule', syllables };
}

// ---------------------------------------------------------------------------
// Compound accent
// ---------------------------------------------------------------------------

/** What `compoundAccent` needs to know about a compound's first member. */
export interface CompoundHead {
    /** The accent the member carries on its own, or NONE if unknown. */
    accent: PitchAccent;
    syllables: number;
}

/**
 * Which accent a compound carries, given its first member and the linking
 * morpheme after it.
 *
 * The textbook line is "compounds take accent 2", and it is wrong often enough
 * to matter. These rules were measured against every compound NB Uttale marks
 * with a secondary stress in the east chunk (351 words), restricted to the ones
 * that genuinely decompose:
 *
 *   - A POLYSYLLABIC first member hands the compound its own accent. "data" is
 *     accent 1, so "datasett", "datalagring" and "dataanalyse" are all accent 1
 *     — a flat accent-2 default gets every one of them wrong. "forskning" is
 *     accent 2, so "forskningsprosjekter" is accent 2. (52 words, 45 correct;
 *     every miss is a head the lexicon does not carry, so its accent came from
 *     the spelling rules rather than data.)
 *
 *   - A MONOSYLLABIC first member has no accent of its own to lend — one
 *     syllable carries no tonal contrast — so the link decides, and it does so
 *     without a single exception in the sample:
 *
 *       no link, 21 words, all accent 2   sollys, matvarer, halvtime, grunnlag,
 *                                         språkkompetanse, planlagt, sanntid
 *       -s- link,  5 words, all accent 1  tidsbruk, tidspunkt, tidsskrift,
 *                                         driftskostnader, kravspesifikasjoner
 *
 *     The -s- closes the first syllable with a heavy cluster, leaving the
 *     accent-2 contour nowhere to fall through.
 *
 * What this deliberately does NOT cover is prefixed words — "tilpasning",
 * "oppdatering", "forberedelse". They look like compounds and behave nothing
 * like them: the accent is lexical, not structural ("oppgave" is accent 2,
 * "oppdatering" accent 1). pronunciationLexicon.ts keeps them out of the
 * splitter instead of guessing here.
 */
export function compoundAccent(head: CompoundHead, link: CompoundLink): PitchAccent {
    if (head.syllables > 1) {
        return head.accent === 'NONE' ? 'ACCENT_2' : head.accent;
    }
    return link === 's' ? 'ACCENT_1' : 'ACCENT_2';
}

export interface ContourPoint {
    /** Position through the word, 0 to 1. */
    t: number;
    /** Pitch relative to the speaker's own median, in semitones. */
    semitones: number;
}

/**
 * Idealised target contours, in semitones relative to the speaker's median so
 * they can be overlaid on any voice regardless of its absolute pitch.
 *
 * Accent 1 (L*H): low through the stressed syllable, then rising — one peak.
 * Accent 2 (H*LH): a high onset, a fall, then a rise — heard as two peaks.
 */
const CONTOURS: Record<Exclude<PitchAccent, 'NONE'>, ContourPoint[]> = {
    ACCENT_1: [
        { t: 0, semitones: -2.5 },
        { t: 0.3, semitones: -3 },
        { t: 0.6, semitones: 0 },
        { t: 0.85, semitones: 2.8 },
        { t: 1, semitones: 3.2 },
    ],
    ACCENT_2: [
        { t: 0, semitones: 1.8 },
        { t: 0.15, semitones: 2.4 },
        { t: 0.45, semitones: -2.8 },
        { t: 0.7, semitones: -1.2 },
        { t: 0.9, semitones: 2.2 },
        { t: 1, semitones: 3 },
    ],
};

export function targetContour(accent: PitchAccent): ContourPoint[] {
    if (accent === 'NONE') return [];
    return CONTOURS[accent];
}

export const ACCENT_LABEL: Record<PitchAccent, string> = {
    ACCENT_1: 'Tonelag 1',
    ACCENT_2: 'Tonelag 2',
    NONE: '—',
};

/**
 * The melody in three words, for people who have never met the term.
 *
 * "Tonelag 2" means nothing to a beginner, and a badge that says only that
 * teaches nothing. The Norwegian name is kept — it is what every textbook and
 * every teacher will call it — but it never appears alone.
 */
export const ACCENT_SHAPE: Record<PitchAccent, string> = {
    ACCENT_1: 'one rise',
    ACCENT_2: 'fall, then rise',
    NONE: '',
};

/**
 * A minimal pair for each accent: two words spelled the same where the melody
 * is the only difference. Nothing explains tonelag as quickly as one of these.
 */
export const ACCENT_EXAMPLE: Record<PitchAccent, string> = {
    ACCENT_1: 'bønder (farmers)',
    ACCENT_2: 'bønner (beans)',
    NONE: '',
};

export const ACCENT_HINT: Record<PitchAccent, string> = {
    ACCENT_1: 'Start low and rise — a single climb through the word.',
    ACCENT_2: 'Start high, dip, then rise again — two peaks, not one.',
    NONE: '',
};
