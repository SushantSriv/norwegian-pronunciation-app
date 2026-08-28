/**
 * Build compact per-dialect pronunciation data for the app's corpus from
 * NB Uttale (Språkbanken, CC0).
 *
 * Source columns: wordform,pos,feats,wordform_id,update_info,
 *                 nofabet_transcription,ipa_transcription,sampa_transcription
 *
 * Tone comes from the nofabet digits: the stressed vowel carries 1 (tone 1)
 * or 2 (tone 2); 0 is unstressed and 3 is secondary stress.
 *
 * Regenerating the data (only needed if the corpus changes):
 *
 *   curl -LO https://www.nb.no/sbfil/uttaleleksikon/nb_uttale_leksika.zip
 *   unzip nb_uttale_leksika.zip
 *   node scripts/build-pronunciation.mjs
 *
 * The 158 MB source is deliberately NOT committed; only the filtered output is.
 */
import { createReadStream, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

// Point this at the unzipped NB Uttale download (see the header comment).
const LEX_DIR = process.env.NB_UTTALE_DIR ?? './nb_uttale_leksika';
const OUT_DIR = fileURLToPath(new URL('../src/data/pronunciation/', import.meta.url));

const DIALECTS = {
    e: 'east',
    sw: 'southwest',
    w: 'west',
    t: 'trondelag',
    n: 'north',
};

// ---- corpus word list -----------------------------------------------------
// BOTH corpora, not just sentences.json. The practice pool is drawn from
// sentences.json for the general stages and occupations.json for the
// occupation ones (see poolForStage in src/data/stages.ts), and leaving the
// latter out meant every one of its 414 exclusive words — skiftetøy, hentetid,
// vernebriller, the whole workplace vocabulary — shipped with no lexicon entry
// at all.
const readJson = name => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));

const wanted = new Set();
const addPhrase = phrase => {
    for (const raw of phrase.split(/\s+/)) {
        const w = raw.toLowerCase().replace(/[^a-zæøå]/g, '');
        if (w) wanted.add(w);
    }
};
for (const items of Object.values(readJson('sentences.json').levels)) items.forEach(addPhrase);
for (const items of Object.values(readJson('occupations.json'))) items.forEach(addPhrase);

console.log('corpus words wanted:', wanted.size);

// ---- minimal CSV line parser (handles quoted fields) ----------------------
function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else inQuotes = false;
            } else cur += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') {
            out.push(cur);
            cur = '';
        } else cur += c;
    }
    out.push(cur);
    return out;
}

/**
 * How likely a part of speech is to be the sense a learner means. Proper names
 * are pushed last: 'Huset' as a surname should never outrank 'huset' the noun.
 */
const POS_RANK = ['NN', 'VB', 'JJ', 'AB', 'PN', 'DT', 'PP', 'CC', 'IN', 'RO', 'UO'];
function posRank(pos = '') {
    if (pos.startsWith('PM')) return 99;
    const i = POS_RANK.indexOf(pos.split('|')[0]);
    return i === -1 ? 50 : i;
}

/** Tone accent from the nofabet transcription, or null when unstressed. */
function toneFrom(nofabet) {
    for (const token of nofabet.split(/\s+/)) {
        const m = /([12])$/.exec(token);
        if (m) return Number(m[1]);
    }
    return null;
}

/**
 * One streaming pass over a dialect's CSV, keeping the rows `accept` wants.
 *
 * Returns wordform -> [{ pos, ipa, tone }]. The file is 158 MB, so the cheap
 * pre-filter on the first field runs before the full CSV parse.
 */
async function scanLexicon(file, accept) {
    const entries = new Map();
    const rl = createInterface({
        input: createReadStream(file, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });

    let first = true;
    for await (const line of rl) {
        if (first) {
            first = false;
            continue;
        }
        const comma = line.indexOf(',');
        if (comma < 1) continue;
        if (!accept(line.slice(0, comma).toLowerCase())) continue;

        const [wordform, pos, , , , nofabet, ipa] = parseCsvLine(line);
        const key = wordform.toLowerCase();
        if (!accept(key) || !ipa) continue;

        const tone = toneFrom(nofabet ?? '');
        const list = entries.get(key) ?? [];
        // Same pronunciation under several inflection tags adds nothing.
        if (!list.some(e => e.ipa === ipa && e.pos === pos)) list.push({ pos, ipa, tone });
        entries.set(key, list);
    }
    return entries;
}

/**
 * Compact shape: word -> [[ipa, tone, pos], ...], best sense first so a
 * consumer can just take [0] and ignore the rest.
 */
function compactify(entries, only) {
    const compact = {};
    const rows = [...entries].filter(([word]) => !only || only.has(word));
    for (const [word, list] of rows.sort((a, b) => a[0].localeCompare(b[0]))) {
        const ranked = [...list].sort(
            (a, b) => posRank(a.pos) - posRank(b.pos) || (a.tone ?? 9) - (b.tone ?? 9)
        );
        compact[word] = ranked.map(e => [e.ipa, e.tone, (e.pos ?? '').split('|')[0]]);
    }
    return compact;
}

function write(name, compact) {
    mkdirSync(OUT_DIR, { recursive: true });
    const serialised = JSON.stringify(compact);
    writeFileSync(OUT_DIR + name + '.json', serialised);
    console.log(
        `${name.padEnd(16)} words=${String(Object.keys(compact).length).padStart(5)}  ` +
            `${(serialised.length / 1024).toFixed(0)} KB`
    );
    return serialised;
}

const csvFor = prefix => `${LEX_DIR}/${prefix}_written_pronunciation_lexicon.csv`;

// ---- compound members -----------------------------------------------------
//
// Norwegian writes compounds as one word and forms them freely, so a corpus
// always outruns a lexicon: NB Uttale lists "skifte" and "tøy" but not
// "skiftetøy". src/utils/norwegianG2P.ts splits those at runtime, which needs
// an inventory of members — harvested here, for exactly the words the first
// pass could not resolve.

const MIN_MEMBER = 3;
const LINKS = ['', 's', 'e'];

/**
 * The members of one complete cover of `word`, or null if it does not cover.
 *
 * A deliberately simplified mirror of `decomposeCompound` in
 * src/utils/norwegianG2P.ts: the script only has to decide WHICH sub-words to
 * ship, and the runtime picks the best split among them. Longest head first, so
 * a cover that exists is the same one the runtime would prefer.
 */
function coveringMembers(word, attested, depth = 3) {
    if (depth < 1) return null;
    if (depth >= 2) {
        for (let end = word.length - MIN_MEMBER; end >= MIN_MEMBER; end--) {
            const head = word.slice(0, end);
            if (!attested.has(head)) continue;
            for (const link of LINKS) {
                const next = end + link.length;
                if (word.slice(end, next) !== link) continue;
                const rest = coveringMembers(word.slice(next), attested, depth - 1);
                if (rest) return [head, ...rest];
            }
        }
    }
    return word.length >= MIN_MEMBER && attested.has(word) ? [word] : null;
}

/**
 * A second pass, collecting the sub-words that let the unresolved corpus words
 * decompose. Candidates are every substring of an unresolved word; the pass
 * keeps whichever of them NB Uttale actually lists, and the cover check then
 * throws away the ones that do not participate in a whole split — an inventory
 * full of accidental substrings would only give the runtime splitter junk to
 * split on.
 */
async function buildParts(prefix, name, unresolved) {
    const candidates = new Set();
    for (const word of unresolved) {
        for (let i = 0; i + MIN_MEMBER <= word.length; i++) {
            for (let j = i + MIN_MEMBER; j <= word.length; j++) candidates.add(word.slice(i, j));
        }
    }

    const entries = await scanLexicon(csvFor(prefix), key => candidates.has(key));
    const attested = new Set(entries.keys());

    const used = new Set();
    let covered = 0;
    for (const word of unresolved) {
        const members = coveringMembers(word, attested);
        if (!members) continue;
        covered++;
        members.forEach(m => used.add(m));
    }
    console.log(`${name.padEnd(16)} ${covered}/${unresolved.length} unresolved words now decompose`);

    return write('parts.' + name, compactify(entries, used));
}

async function buildDialect(prefix, name) {
    const entries = await scanLexicon(csvFor(prefix), key => wanted.has(key));
    return { serialised: write(name, compactify(entries)), resolved: new Set(entries.keys()) };
}

/**
 * Several NB Uttale areas transcribe this corpus identically - the areas do
 * differ across the full 785k vocabulary, but not within these ~1,780 words.
 * Writing byte-identical files would ship dead chunks and let the UI offer
 * choices that change nothing, so duplicates are reported and skipped.
 */
const written = new Map();
for (const [prefix, name] of Object.entries(DIALECTS)) {
    const { serialised, resolved } = await buildDialect(prefix, name);
    const twin = written.get(serialised);
    if (twin) {
        rmSync(OUT_DIR + name + '.json');
        console.log(name.padEnd(16) + 'identical to ' + twin + ' - skipped');
        continue;
    }
    written.set(serialised, name);

    const unresolved = [...wanted].filter(w => !resolved.has(w) && w.length >= MIN_MEMBER * 2);
    await buildParts(prefix, name, unresolved);
}
console.log('done');
