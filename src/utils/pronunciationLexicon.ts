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
 * Words the lexicon does not carry now go through three stages rather than one:
 *
 *   1. lexicon  — a direct NB Uttale hit.
 *   2. compound — the word splits into members we do know. Norwegian forms
 *      compounds freely and writes them as one word, so no lexicon can keep up;
 *      "skiftetøy" is absent but "skifte" and "tøy" are not.
 *   3. rule     — the spelling rules, as before.
 *
 * Each dialect group is a separate chunk loaded on demand, so choosing one
 * costs a single ~24 KB gzipped fetch rather than bundling them all up front.
 */
import type { DialectId } from '../data/dialects';
import {
    compoundAccent,
    countSyllables,
    pitchAccentFor,
    type PitchAccent,
} from '../data/tonelag';
import { COMPOUND_ELEMENTS } from '../data/compoundElements';
import { decomposeCompound, wordToIPA, type CompoundPart } from './norwegianG2P';

/** [ipa, tone, pos] as emitted by the extraction script. */
type RawEntry = [string, 1 | 2 | null, string];
type RawLexicon = Record<string, RawEntry[]>;

// TypeScript widens the JSON tuples to (string | number)[][], so the module
// shape is taken as unknown and narrowed on assignment below.
const LOADERS: Record<DialectId, () => Promise<{ default: unknown }>> = {
    east: () => import('../data/pronunciation/east.json'),
    southwest: () => import('../data/pronunciation/southwest.json'),
    trondelag: () => import('../data/pronunciation/trondelag.json'),
};

/**
 * Compound-member chunks, when they exist.
 *
 * scripts/build-pronunciation.mjs emits `parts.<dialect>.json` — the sub-words
 * this corpus's unresolved compounds need, straight from NB Uttale. Those files
 * are only produced by a run against the 158 MB source, so they may well be
 * absent. A static import of a missing file is a build error; a glob that
 * matches nothing is an empty object, which is why this is globbed.
 */
const PART_LOADERS = import.meta.glob('../data/pronunciation/parts.*.json') as Record<
    string,
    () => Promise<{ default: unknown }>
>;

const loaded = new Map<DialectId, RawLexicon>();
const parts = new Map<DialectId, RawLexicon>();
const inFlight = new Map<DialectId, Promise<RawLexicon>>();

async function loadParts(id: DialectId): Promise<void> {
    const loader = PART_LOADERS[`../data/pronunciation/parts.${id}.json`];
    if (!loader) return;
    try {
        const mod = await loader();
        parts.set(id, mod.default as RawLexicon);
    } catch {
        // Optional data. Without it the seed element list still covers the
        // common members; there is nothing to recover from.
    }
}

export async function loadDialect(id: DialectId): Promise<RawLexicon> {
    const ready = loaded.get(id);
    if (ready) return ready;

    const pending = inFlight.get(id);
    if (pending) return pending;

    const promise = LOADERS[id]()
        .then(async mod => {
            const data = mod.default as RawLexicon;
            loaded.set(id, data);
            inFlight.delete(id);
            // The member chunk is a bonus, never a reason to fail the load.
            await loadParts(id);
            compoundCache.clear();
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
    /** Whether this came from real data, a compound split, or our rules. */
    source: 'lexicon' | 'compound' | 'rule';
    /** The members a compound was built from, in order. Only for `compound`. */
    members?: string[];
}

const toAccent = (tone: 1 | 2 | null): PitchAccent =>
    tone === 1 ? 'ACCENT_1' : tone === 2 ? 'ACCENT_2' : 'NONE';

/** A direct hit in the dialect chunk, or in its compound-member chunk. */
function rawEntriesFor(key: string, dialect: DialectId): RawEntry[] | undefined {
    return loaded.get(dialect)?.[key] ?? parts.get(dialect)?.[key];
}

// ---------------------------------------------------------------------------
// Compound fallback
// ---------------------------------------------------------------------------

/**
 * Parts of speech that must never head a compound.
 *
 * "til", "for", "av" and their kind look like compound members and behave like
 * unstressed prefixes: "forsiktig" is fɔ.'ʃɪk.tɪ, stressed on the second
 * syllable, where a compound is always stressed on its first member. Splitting
 * there would move the stress and flip the accent with it.
 */
const CLOSED_CLASS = new Set(['PN', 'DT', 'PP', 'CC', 'IN', 'RO', 'UO']);

/**
 * Prefixes the part-of-speech tag cannot filter out.
 *
 * NB Uttale ranks "for" as a noun (fôr, fodder) and "opp" as a verb, so the
 * closed-class check waves both through and we get "forbedre" = for + bedre.
 * Worse than the bad seam is the accent: prefixed words are lexically
 * unpredictable — "oppgave" is accent 2, "oppdatering" accent 1, "tilfelle"
 * accent 2, "tilpasning" accent 1 — so there is nothing structural to derive.
 * They are left to the lexicon and, failing that, to the spelling rules.
 */
const PREFIXES = new Set([
    'an', 'av', 'be', 'er', 'for', 'ge', 'gjen', 'inn', 'med', 'ned', 'om',
    'opp', 'over', 'sam', 'til', 'under', 'unn', 'ut', 'ved',
]);

/**
 * Judged on the BEST-RANKED sense only. "for" also exists as a noun (fodder),
 * and asking whether any sense is open-class lets that rare reading wave the
 * preposition through — which is how "forbedre" ended up split as for+bedre.
 */
function isOpenClass(entries: RawEntry[]): boolean {
    const pos = entries[0][2] ?? '';
    return !CLOSED_CLASS.has(pos) && !pos.startsWith('PM');
}

/**
 * Inflectional endings the FINAL member of a compound can carry — the compound
 * inflects on its last member and nowhere else (vaskerom → vaskerom**met**).
 * Longest first so "ene" is tried before "e".
 */
const INFLECTIONS = ['ene', 'ens', 'ets', 'en', 'et', 'er', 'ne', 'te', 'a', 'e', 'r', 's', 't'];

/**
 * Base forms `surface` could be an inflection of, most likely first.
 *
 * Norwegian spelling doubles a final consonant before a vowel ending
 * (rom → rommet) and drops a stem-final -e before some endings
 * (kasse → kassa), so both are undone here.
 */
function baseFormsOf(surface: string): string[] {
    const out: string[] = [];
    for (const ending of INFLECTIONS) {
        if (!surface.endsWith(ending)) continue;
        const stem = surface.slice(0, -ending.length);
        if (stem.length < 3) continue;
        out.push(stem);
        const degeminated = stem.replace(/([bdfgklmnprstv])\1$/, '$1');
        if (degeminated !== stem && degeminated.length >= 3) out.push(degeminated);
        // kassa → kass → kasse
        out.push(stem + 'e');
    }
    return out;
}

/**
 * Whether `sub` can be a compound member for this dialect.
 *
 * Members must be open-class either way: a compound is built from nouns, verbs
 * and adjectives, and admitting function words produces splits like
 * "billetten" = bil + letten. The final member may be inflected, because that
 * is where a Norwegian compound carries its ending.
 */
function memberPredicate(dialect: DialectId) {
    const usable = (sub: string): boolean => {
        if (PREFIXES.has(sub)) return false;
        const entries = rawEntriesFor(sub, dialect);
        if (entries?.length) return isOpenClass(entries);
        return COMPOUND_ELEMENTS.has(sub);
    };

    return (sub: string, isFinal: boolean): boolean => {
        if (usable(sub)) return true;
        // Only the last member may be inflected.
        return isFinal && baseFormsOf(sub).some(usable);
    };
}

// NB Uttale marks the stressed syllable with ' (accent 1) or " (accent 2),
// secondary stress with ˌ, and separates syllables with '.'.
const PRIMARY_MARK = /['"]/;
const TONE_MARK: Record<PitchAccent, string> = { ACCENT_1: "'", ACCENT_2: '"', NONE: '' };

/** Replace a transcription's stress mark with `mark`, adding one if absent. */
function setPrimaryMark(ipa: string, mark: string): string {
    const at = ipa.search(PRIMARY_MARK);
    if (at < 0) return mark + ipa;
    return ipa.slice(0, at) + mark + ipa.slice(at + 1);
}

const stripSecondary = (ipa: string) => ipa.replace(/ˌ/g, '');
const stripAllStress = (ipa: string) => ipa.replace(/['"ˌ]/g, '');

/** Best available transcription for one member, and whether it is real data. */
function memberIpa(surface: string, dialect: DialectId): { ipa: string; fromLexicon: boolean } {
    const direct = rawEntriesFor(surface, dialect);
    if (direct?.length) return { ipa: direct[0][0], fromLexicon: true };
    return { ipa: wordToIPA(surface), fromLexicon: false };
}

/** The accent a member carries alone: real tone if we have it, else the rules. */
function memberAccent(surface: string, dialect: DialectId): PitchAccent {
    const direct = rawEntriesFor(surface, dialect);
    if (direct?.length) return toAccent(direct[0][1]);
    return pitchAccentFor(surface).accent;
}

/**
 * Stitch the members into one transcription.
 *
 * A Norwegian compound has exactly one primary stress, on the first member, and
 * a secondary stress on the last — "aksjeselskaper" is `'ɑk.ʃə.səl.ˌskɑː.pər`.
 * Members carry their own marks in the lexicon, so those are demoted or dropped
 * before joining.
 */
function joinMembers(
    members: CompoundPart[],
    accent: PitchAccent,
    dialect: DialectId
): { ipa: string; fromLexicon: number } {
    const chunks: string[] = [];
    let fromLexicon = 0;

    members.forEach((member, i) => {
        const { ipa, fromLexicon: real } = memberIpa(member.word, dialect);
        if (real) fromLexicon++;

        let marked: string;
        if (i === 0) marked = setPrimaryMark(stripSecondary(ipa), TONE_MARK[accent]);
        else if (i === members.length - 1) marked = setPrimaryMark(stripSecondary(ipa), 'ˌ');
        else marked = stripAllStress(ipa);

        // A -s- link fuses onto the member before it; a -e- link is its own
        // unstressed syllable.
        chunks.push(member.link === 's' ? marked + 's' : marked);
        if (member.link === 'e') chunks.push('ə');
    });

    return { ipa: chunks.join('.'), fromLexicon };
}

/**
 * Whether the word is just an inflected simplex, which must not be read as a
 * compound: "bordene" is bord + -ene, not "bor" + "dene", and "kontorene" is
 * kontor + -ene, not "konto" + "rene".
 *
 * The base has to be a word we know AND not itself decompose, so this does not
 * block a genuine compound that happens to be inflected — "legevakten" reduces
 * to "legevakt", which is lege + vakt, and stays on the compound path.
 */
function isInflectedSimplex(word: string, dialect: DialectId): boolean {
    const isMember = memberPredicate(dialect);
    return baseFormsOf(word).some(
        base => isMember(base, true) && splitMembers(base, dialect) === null
    );
}

/**
 * Find the members, preferring a two-part reading.
 *
 * Deeper splits are where an inventory this large starts over-generating:
 * "grunnpillarer" comes apart as grunn + pilla + rer, "klimascenarier" as
 * klimas + cen + arier. Every fragment there is a real Norwegian word, which is
 * why the inventory admits them and why no amount of tightening the inventory
 * helps. What separates those from the three-part splits that ARE right —
 * smart + hjem + enheter, data + vitenskaps + problemer — is that the genuine
 * ones are built from substantial words, not leftovers.
 *
 * So: take a two-part reading if one exists, and only go deeper when every
 * member is a word of real length.
 */
function splitMembers(word: string, dialect: DialectId): CompoundPart[] | null {
    const isMember = memberPredicate(dialect);
    return (
        decomposeCompound(word, isMember, { maxParts: 2 }) ??
        decomposeCompound(word, isMember, { maxParts: 3, minPartLength: 4 })
    );
}

const compoundCache = new Map<string, Pronunciation | null>();

/**
 * Pronounce a word by splitting it into members we know, or null if it does not
 * split. Exported for the tests, which pin the accent rules against real
 * NB Uttale compounds.
 */
export function compoundPronunciationFor(word: string, dialect: DialectId): Pronunciation | null {
    const key = normalize(word);
    if (!key) return null;

    const cacheKey = `${dialect}:${key}`;
    const cached = compoundCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const members = isInflectedSimplex(key, dialect) ? null : splitMembers(key, dialect);
    if (!members) {
        compoundCache.set(cacheKey, null);
        return null;
    }

    const head = members[0].word;
    const accent = compoundAccent(
        { accent: memberAccent(head, dialect), syllables: countSyllables(head) },
        members[0].link
    );
    const { ipa } = joinMembers(members, accent, dialect);

    const result: Pronunciation = {
        ipa,
        accent,
        alternatives: [],
        source: 'compound',
        members: members.map(m => m.word),
    };
    compoundCache.set(cacheKey, result);
    return result;
}

/**
 * Look a word up in the loaded dialect, falling back to a compound split and
 * then to the rule-based G2P. Synchronous: call loadDialect() first if you want
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

    const compound = compoundPronunciationFor(key, dialect);
    if (compound) return compound;

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
