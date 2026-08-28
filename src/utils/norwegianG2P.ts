/**
 * Rule-based Norwegian Bokmål grapheme→phoneme conversion.
 *
 * The backend used phonemizer/eSpeak-NG for this, which cannot run on GitHub
 * Pages. Norwegian orthography is regular enough that a rule set covers the
 * common cases well, which is all the learner-facing feedback needs.
 *
 * This is deliberately an APPROXIMATION. It does not model pitch accent
 * (tonelag) or dialect variation, and it will be wrong on loanwords. It is a
 * teaching aid for "which sounds did you miss", not a reference transcription.
 *
 * The one structural thing it does model is compounding — see
 * `decomposeCompound` at the bottom of the file. Norwegian compounds are
 * written as one word, and transcribing them whole runs the vowel-length rules
 * straight across a seam where they do not apply.
 */

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y', 'æ', 'ø', 'å']);

/** Front vowels that palatalize a preceding k / g / sk. */
const PALATALIZING = ['i', 'y', 'ei', 'øy'];

const LONG_VOWEL: Record<string, string> = {
    a: 'ɑː', e: 'eː', i: 'iː', o: 'uː', u: 'ʉː', y: 'yː', æ: 'æː', ø: 'øː', å: 'oː',
};

const SHORT_VOWEL: Record<string, string> = {
    a: 'ɑ', e: 'e', i: 'i', o: 'ɔ', u: 'ʉ', y: 'y', æ: 'æ', ø: 'ø', å: 'ɔ',
};

const DIPHTHONGS: Record<string, string> = {
    ei: 'æɪ', øy: 'øʏ', au: 'æʉ', ai: 'ɑɪ',
};

const SIMPLE_CONSONANT: Record<string, string> = {
    b: 'b', c: 'k', d: 'd', f: 'f', g: 'g', h: 'h', j: 'j', k: 'k', l: 'l',
    m: 'm', n: 'n', p: 'p', q: 'k', r: 'r', s: 's', t: 't', v: 'v', w: 'v',
    x: 'ks', z: 's',
};

/**
 * High-frequency words whose pronunciation the rules cannot derive — mostly
 * silent letters and reduced function words. Checked before the rule walk.
 */
const IRREGULAR: Record<string, string> = {
    og: 'ɔ', jeg: 'jæɪ', det: 'deː', de: 'diː', meg: 'mæɪ', deg: 'dæɪ', seg: 'sæɪ',
    hva: 'vɑː', hvem: 'vem', hvor: 'vuːr', hvordan: 'vuːɖɑn', hvorfor: 'vuːrfɔr',
    hvis: 'vis', ikke: 'ikə', noe: 'nuːə', noen: 'nuːən', mye: 'myːə',
    er: 'æːr', har: 'hɑːr', var: 'vɑːr', skal: 'skɑl', vil: 'vil',
    dag: 'dɑːg', god: 'guː', med: 'meː', ved: 'veː', sted: 'steː',
    selv: 'sel', til: 'til', som: 'sɔm', han: 'hɑn', hun: 'hʉn',
};

function normalize(word: string): string {
    return word.toLowerCase().replace(/[^a-zæøå]/g, '');
}

const isVowel = (ch: string | undefined): boolean => !!ch && VOWELS.has(ch);

/** Count consonant letters directly following position `i`. */
function consonantRun(word: string, i: number): number {
    let n = 0;
    while (i + n < word.length && !isVowel(word[i + n])) n++;
    return n;
}

/** True if the text at `i` starts one of the palatalizing front vowels. */
function palatalizesAt(word: string, i: number): boolean {
    return PALATALIZING.some(v => word.startsWith(v, i));
}

/**
 * Convert one word to a bare IPA string (no stress marks or syllable
 * boundaries — the comparison in scoring.ts is character-level).
 */
export function wordToIPA(word: string): string {
    const w = normalize(word);
    if (!w) return '';
    if (IRREGULAR[w]) return IRREGULAR[w];

    let out = '';
    let i = 0;

    while (i < w.length) {
        const rest = w.length - i;
        const isLast = (len: number) => i + len === w.length;

        // ---- Unstressed final syllables (very common in Norwegian) --------
        if (isLast(2) && w.slice(i) === 'et' && i > 0) { out += 'ə'; break; }
        if (isLast(2) && w.slice(i) === 'er' && i > 0) { out += 'ər'; break; }
        if (isLast(2) && w.slice(i) === 'en' && i > 0) { out += 'ən'; break; }
        if (isLast(2) && w.slice(i) === 'ig' && i > 0) { out += 'i'; break; }
        if (isLast(1) && w[i] === 'e' && i > 0 && !isVowel(w[i - 1])) { out += 'ə'; break; }

        // ---- Consonant clusters (longest first) ---------------------------
        if (rest >= 3 && (w.startsWith('skj', i) || w.startsWith('stj', i))) { out += 'ʃ'; i += 3; continue; }
        if (rest >= 2 && w.startsWith('sj', i)) { out += 'ʃ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('sk', i) && palatalizesAt(w, i + 2)) { out += 'ʃ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('kj', i)) { out += 'ç'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('gj', i)) { out += 'j'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('hj', i)) { out += 'j'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('hv', i)) { out += 'v'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('ng', i)) { out += 'ŋ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('nk', i)) { out += 'ŋk'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('gn', i)) { out += 'ŋn'; i += 2; continue; }

        // Retroflexes: r + alveolar fuse into a single retroflex consonant.
        if (rest >= 2 && w.startsWith('rs', i)) { out += 'ʂ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('rt', i)) { out += 'ʈ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('rd', i)) { out += 'ɖ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('rn', i)) { out += 'ɳ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('rl', i)) { out += 'ɭ'; i += 2; continue; }

        // Silent d after l / n.
        if (rest >= 2 && w.startsWith('ld', i)) { out += 'ɭ'; i += 2; continue; }
        if (rest >= 2 && w.startsWith('nd', i)) { out += 'n'; i += 2; continue; }

        // Palatalized single k / g before a front vowel.
        if (w[i] === 'k' && palatalizesAt(w, i + 1)) { out += 'ç'; i += 1; continue; }
        if (w[i] === 'g' && palatalizesAt(w, i + 1)) { out += 'j'; i += 1; continue; }

        // ---- Diphthongs ---------------------------------------------------
        const diph = rest >= 2 ? DIPHTHONGS[w.slice(i, i + 2)] : undefined;
        if (diph) { out += diph; i += 2; continue; }

        // ---- Vowels -------------------------------------------------------
        if (isVowel(w[i])) {
            // A vowel is long when at most one consonant follows it (including
            // word-final); a doubled consonant shortens it.
            const run = consonantRun(w, i + 1);
            out += run <= 1 ? LONG_VOWEL[w[i]] : SHORT_VOWEL[w[i]];
            i += 1;
            continue;
        }

        // ---- Consonants ---------------------------------------------------
        // Silent word-final d after a vowel (god, med, ved).
        if (w[i] === 'd' && isLast(1) && isVowel(w[i - 1])) { i += 1; continue; }

        // Collapse doubled consonants to a single phoneme.
        if (w[i] === w[i + 1] && !isVowel(w[i])) { i += 1; continue; }

        out += SIMPLE_CONSONANT[w[i]] ?? '';
        i += 1;
    }

    return out;
}

/** Convert a whole phrase, preserving word boundaries as spaces. */
export function phraseToIPA(phrase: string): string {
    return phrase.split(/\s+/).map(wordToIPA).filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Compound decomposition
//
// Norwegian writes compounds as a single word and forms them freely, so any
// corpus outruns any lexicon: "skiftetøy", "hentetid", "vaskerommet". Splitting
// an unknown word into members we do know gives us two things the rules alone
// cannot — a transcription that does not run vowel-length rules across the
// seam, and the pitch accent, which is a property of the FIRST member.
//
// The splitter is deliberately inventory-agnostic: it asks a caller-supplied
// predicate whether a candidate member is a word. pronunciationLexicon.ts backs
// that with NB Uttale; tests back it with a handful of strings.
// ---------------------------------------------------------------------------

/**
 * A linking morpheme between two members.
 *
 * `-s-` (arbeid**s**plass) adds a consonant, `-e-` (barn**e**hage) adds a whole
 * unstressed syllable — which is why they are tracked separately rather than
 * being absorbed into the member: the extra syllable decides the pitch accent
 * when the first member is monosyllabic.
 */
export type CompoundLink = '' | 's' | 'e';

const LINKS: readonly CompoundLink[] = ['', 's', 'e'];

export interface CompoundPart {
    /** The member, as the inventory spells it. */
    word: string;
    /** Linking morpheme joining this member to the next; empty on the last. */
    link: CompoundLink;
}

/**
 * Whether `sub` is a usable member. `isFinal` is passed so a caller can be
 * stricter about non-final members — the last member carries the compound's
 * inflection ("rom" → "vaskerom**met**") and closed-class words such as "til"
 * or "for" must never head a compound, because they are unstressed prefixes
 * rather than members.
 */
export type MemberPredicate = (sub: string, isFinal: boolean) => boolean;

export interface CompoundOptions {
    /** Shortest accepted member. Below three letters the matches are noise. */
    minPartLength?: number;
    /** Deepest split attempted. Three covers essentially every real compound. */
    maxParts?: number;
}

/**
 * How good a candidate split is. Higher wins.
 *
 * Summing the SQUARE of each member's length is what makes this behave: it
 * prefers few long members over many short ones, so "skifte + tøy" (36+9) beats
 * "skift + e + tøy" (25+9), and "vaske + rommet" beats "vask + e + rommet".
 * That matters beyond tidiness — "skifte" is disyllabic and carries accent 2,
 * "skift" is monosyllabic and would hand the compound accent 1.
 */
function splitScore(parts: CompoundPart[]): number {
    let score = 0;
    for (const part of parts) {
        score += part.word.length * part.word.length;
        if (part.link) score -= 1;
    }
    return score - parts.length * 4;
}

/**
 * Split `word` into known members, or return null if it does not decompose.
 *
 * Recursive with memoisation on (offset, members left), so the whole search is
 * linear in the word length rather than exponential.
 */
export function decomposeCompound(
    word: string,
    isKnown: MemberPredicate,
    options: CompoundOptions = {}
): CompoundPart[] | null {
    const min = options.minPartLength ?? 3;
    const maxParts = options.maxParts ?? 3;
    const w = normalize(word);
    // Two members at minimum length is the shortest thing worth trying.
    if (w.length < min * 2) return null;

    const memo = new Map<string, CompoundPart[] | null>();

    /**
     * Best cover of w.slice(start) using at most `budget` members.
     *
     * `allowSingle` is false only at the top level. Without it a word that is
     * itself in the inventory would swallow its own split — the whole word
     * scores higher than any division of it, so "lastebil" would come back as
     * one member and the caller would never see "laste + bil".
     */
    function solve(start: number, budget: number, allowSingle: boolean): CompoundPart[] | null {
        if (budget < 1) return null;
        const key = `${start}:${budget}:${allowSingle}`;
        const cached = memo.get(key);
        if (cached !== undefined) return cached;

        let best: CompoundPart[] | null = null;

        // The remainder is the final member.
        const tail = w.slice(start);
        if (allowSingle && tail.length >= min && isKnown(tail, true)) {
            best = [{ word: tail, link: '' }];
        }

        // Or split a non-final member off the front and recurse.
        if (budget >= 2) {
            for (let end = start + min; end <= w.length - min; end++) {
                const head = w.slice(start, end);
                if (!isKnown(head, false)) continue;
                for (const link of LINKS) {
                    const next = end + link.length;
                    if (w.slice(end, next) !== link) continue;
                    // A link must be followed by a member, never end the word.
                    if (w.length - next < min) continue;
                    const rest = solve(next, budget - 1, true);
                    if (!rest) continue;
                    const candidate: CompoundPart[] = [{ word: head, link }, ...rest];
                    if (!best || splitScore(candidate) > splitScore(best)) best = candidate;
                }
            }
        }

        memo.set(key, best);
        return best;
    }

    const parts = solve(0, maxParts, false);
    // A single member is just the word itself, not a compound.
    return parts && parts.length >= 2 ? parts : null;
}

/** Phonemes a linking morpheme contributes on its own. */
const LINK_IPA: Record<CompoundLink, string> = { '': '', s: 's', e: 'ə' };

/**
 * Rule-based IPA for a compound, transcribing each member separately.
 *
 * Worth doing even without lexicon data: `wordToIPA` decides vowel length from
 * the consonants that follow, and across a compound seam those consonants
 * belong to the next member. Run whole, "hentetid" lengthens the linking e
 * because a single consonant follows it; run per member, "hente" keeps its
 * schwa. Returns null when the word does not decompose, so callers can fall
 * back to the plain rule walk.
 */
export function compoundToIPA(
    word: string,
    isKnown: MemberPredicate,
    options?: CompoundOptions
): string | null {
    const parts = decomposeCompound(word, isKnown, options);
    if (!parts) return null;
    return parts.map(part => wordToIPA(part.word) + LINK_IPA[part.link]).join('');
}
