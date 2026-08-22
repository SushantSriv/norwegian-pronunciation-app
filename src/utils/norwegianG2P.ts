/**
 * Rule-based Norwegian Bokmål grapheme→phoneme conversion.
 *
 * The backend used phonemizer/eSpeak-NG for this, which cannot run on GitHub
 * Pages. Norwegian orthography is regular enough that a rule set covers the
 * common cases well, which is all the learner-facing feedback needs.
 *
 * This is deliberately an APPROXIMATION. It does not model pitch accent
 * (tonelag), compound-word stress, or dialect variation, and it will be wrong
 * on loanwords. It is a teaching aid for "which sounds did you miss", not a
 * reference transcription.
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
