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
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'fs';
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
const corpus = JSON.parse(
    readFileSync(new URL('../src/data/sentences.json', import.meta.url), 'utf8')
).levels;

const wanted = new Set();
for (const items of Object.values(corpus)) {
    for (const item of items) {
        for (const raw of item.split(/\s+/)) {
            const w = raw.toLowerCase().replace(/[^a-zæøå]/g, '');
            if (w) wanted.add(w);
        }
    }
}
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

async function buildDialect(prefix, name) {
    const file = `${LEX_DIR}/${prefix}_written_pronunciation_lexicon.csv`;
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
        // Cheap pre-filter before the full parse: the wordform is the first field.
        const comma = line.indexOf(',');
        if (comma < 1) continue;
        const head = line.slice(0, comma).toLowerCase();
        if (!wanted.has(head)) continue;

        const cols = parseCsvLine(line);
        const [wordform, pos, , , , nofabet, ipa] = cols;
        const key = wordform.toLowerCase();
        if (!wanted.has(key) || !ipa) continue;

        const tone = toneFrom(nofabet ?? '');
        const list = entries.get(key) ?? [];
        // Same pronunciation under several inflection tags adds nothing.
        if (!list.some(e => e.ipa === ipa && e.pos === pos)) {
            list.push({ pos, ipa, tone });
        }
        entries.set(key, list);
    }

    // Compact shape: word -> [[ipa, tone, pos], ...], best sense first so a
    // consumer can just take [0] and ignore the rest.
    const compact = {};
    for (const [word, list] of [...entries].sort((a, b) => a[0].localeCompare(b[0]))) {
        const ranked = [...list].sort(
            (a, b) => posRank(a.pos) - posRank(b.pos) || (a.tone ?? 9) - (b.tone ?? 9)
        );
        compact[word] = ranked.map(e => [e.ipa, e.tone, (e.pos ?? '').split('|')[0]]);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    const path = `${OUT_DIR}/${name}.json`;
    writeFileSync(path, JSON.stringify(compact));
    const kb = (readFileSync(path).length / 1024).toFixed(0);
    console.log(
        `${name.padEnd(11)} words=${String(Object.keys(compact).length).padStart(5)}  ${kb} KB`
    );
    return Object.keys(compact).length;
}

for (const [prefix, name] of Object.entries(DIALECTS)) {
    await buildDialect(prefix, name);
}
console.log('done');
