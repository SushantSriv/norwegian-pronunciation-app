/**
 * Real Norwegian pronunciation data, from NB Uttale (Språkbanken, CC0).
 *
 * This replaces guesswork with measured data for the words it covers. Two
 * things previously came from heuristics and were demonstrably wrong on real
 * words:
 *
 *   - IPA, from the rule-based G2P in norwegianG2P.ts
 *   - Pitch accent (tonelag), from the syllable rules in data/tonelag.ts
 *
 * Both remain as the fallback for words the lexicon does not carry (proper
 * nouns, rarer inflections) — roughly 11% of the corpus.
 *
 * Each dialect is a separate chunk loaded on demand, so choosing one costs a
 * ~60 KB fetch rather than bundling all five up front.
 */
import type { DialectId } from '../data/dialects';
import { pitchAccentFor, type PitchAccent } from '../data/tonelag';
import { wordToIPA } from './norwegianG2P';

/** [ipa, tone, pos] as emitted by the extraction script. */
type RawEntry = [string, 1 | 2 | null, string];
type RawLexicon = Record<string, RawEntry[]>;

// TypeScript widens the JSON tuples to (string | number)[][], so the module
// shape is taken as unknown and narrowed on assignment below.
const LOADERS: Record<DialectId, () => Promise<{ default: unknown }>> = {
    east: () => import('../data/pronunciation/east.json'),
    southwest: () => import('../data/pronunciation/southwest.json'),
    west: () => import('../data/pronunciation/west.json'),
    trondelag: () => import('../data/pronunciation/trondelag.json'),
    north: () => import('../data/pronunciation/north.json'),
};

const loaded = new Map<DialectId, RawLexicon>();
const inFlight = new Map<DialectId, Promise<RawLexicon>>();

export async function loadDialect(id: DialectId): Promise<RawLexicon> {
    const ready = loaded.get(id);
    if (ready) return ready;

    const pending = inFlight.get(id);
    if (pending) return pending;

    const promise = LOADERS[id]()
        .then(mod => {
            const data = mod.default as RawLexicon;
            loaded.set(id, data);
            inFlight.delete(id);
            return data;
        })
        .catch(() => {
            // A failed chunk must not wedge the app; fall back to the rules.
            inFlight.delete(id);
            return {} as RawLexicon;
        });

    inFlight.set(id, promise);
    return promise;
}

/** True once a dialect's data is in memory and lookups will hit it. */
export const isDialectLoaded = (id: DialectId): boolean => loaded.has(id);

const normalize = (word: string) => word.toLowerCase().replace(/[^a-zæøå]/g, '');

export interface Pronunciation {
    /** Broad IPA. Lexicon entries carry stress and syllable marks. */
    ipa: string;
    accent: PitchAccent;
    /** Part of speech, when the lexicon supplied one. */
    pos?: string;
    /** Alternative senses, e.g. the noun/verb split on "avtale". */
    alternatives: { ipa: string; accent: PitchAccent; pos?: string }[];
    /** Whether this came from real data or from our fallback rules. */
    source: 'lexicon' | 'rule';
}

const toAccent = (tone: 1 | 2 | null): PitchAccent =>
    tone === 1 ? 'ACCENT_1' : tone === 2 ? 'ACCENT_2' : 'NONE';

/**
 * Look a word up in the loaded dialect, falling back to the rule-based G2P
 * and syllable heuristics. Synchronous: call loadDialect() first if you want
 * lexicon coverage, otherwise this quietly returns rule-derived data.
 */
export function pronunciationFor(word: string, dialect: DialectId): Pronunciation {
    const key = normalize(word);
    if (!key) {
        return { ipa: '', accent: 'NONE', alternatives: [], source: 'rule' };
    }

    const entries = loaded.get(dialect)?.[key];
    if (entries?.length) {
        const [primaryIpa, primaryTone, primaryPos] = entries[0];
        return {
            ipa: primaryIpa,
            accent: toAccent(primaryTone),
            pos: primaryPos || undefined,
            alternatives: entries.slice(1).map(([ipa, tone, pos]) => ({
                ipa,
                accent: toAccent(tone),
                pos: pos || undefined,
            })),
            source: 'lexicon',
        };
    }

    return {
        ipa: wordToIPA(key),
        accent: pitchAccentFor(key).accent,
        alternatives: [],
        source: 'rule',
    };
}

/**
 * Strip stress and syllable marks, leaving bare phonemes.
 *
 * Lexicon IPA carries a leading stress/tone mark (' for accent 1, " for
 * accent 2), secondary stress, and syllable dots. The scoring comparison in
 * scoring.ts works on bare phoneme strings, and our fallback G2P emits none of
 * these marks, so they must come off for the two sources to be comparable.
 */
export function stripProsody(ipa: string): string {
    return ipa.replace(/[ˈˌ'".ˑ]/g, '');
}
