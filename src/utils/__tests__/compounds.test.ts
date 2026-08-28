import { beforeAll, describe, expect, it } from 'vitest';
import { compoundToIPA, decomposeCompound, type MemberPredicate } from '../norwegianG2P';
import { compoundAccent } from '../../data/tonelag';
import {
    compoundPronunciationFor,
    loadDialect,
    pronunciationFor,
    stripProsody,
} from '../pronunciationLexicon';

/** A tiny fixed inventory, so the splitter is tested without the lexicon. */
const INVENTORY = new Set([
    'skifte', 'skift', 'tøy', 'hente', 'hent', 'tid', 'barn', 'hage', 'vaske',
    'vask', 'rom', 'arbeid', 'plass', 'lastebil', 'bil', 'last', 'laste',
    'kjøkken', 'benk', 'sykkel', 'sykle',
]);
const known: MemberPredicate = sub => INVENTORY.has(sub);

const asText = (word: string, isKnown: MemberPredicate = known) =>
    decomposeCompound(word, isKnown)
        ?.map(p => p.word + (p.link ? `+${p.link}` : ''))
        .join(' + ') ?? null;

describe('decomposeCompound', () => {
    it('splits a compound into its members', () => {
        expect(asText('skiftetøy')).toBe('skifte + tøy');
        expect(asText('hentetid')).toBe('hente + tid');
        expect(asText('arbeidsplass')).toBe('arbeid+s + plass');
        expect(asText('barnehage')).toBe('barn+e + hage');
    });

    it('prefers the longest members over a linked split of the same surface', () => {
        // "skiftetøy" could be skift+e+tøy; "skifte" is the real member, and the
        // difference decides the accent, since "skift" is monosyllabic.
        expect(asText('skiftetøy')).toBe('skifte + tøy');
        expect(asText('hentetid')).toBe('hente + tid');
    });

    it('recurses past two members', () => {
        expect(asText('arbeidsplasstøy')).toBe('arbeid+s + plass + tøy');
    });

    it('returns null when no split covers the whole word', () => {
        expect(asText('kylling')).toBeNull();
        expect(asText('skiftexyz')).toBeNull();
        // A known member plus an unknown remainder is not a decomposition.
        expect(asText('barnexyzzy')).toBeNull();
    });

    it('does not treat a known word as a compound of itself', () => {
        expect(asText('lastebil')).toBe('laste + bil');
        expect(asText('sykkel')).toBeNull();
    });

    it('rejects members shorter than the minimum', () => {
        const inventory: MemberPredicate = sub => ['ku', 'stall', 'kust'].includes(sub);
        expect(decomposeCompound('kustall', inventory)).toBeNull();
        expect(decomposeCompound('kustall', inventory, { minPartLength: 2 })).not.toBeNull();
    });

    it('honours the member-count ceiling', () => {
        expect(decomposeCompound('arbeidsplasstøy', known, { maxParts: 2 })).toBeNull();
        expect(decomposeCompound('arbeidsplasstøy', known, { maxParts: 3 })).toHaveLength(3);
    });

    it('lets the caller be stricter about non-final members', () => {
        // This is how the lexicon keeps prepositions from heading a compound.
        const both: MemberPredicate = sub => ['hente', 'hent', 'tid'].includes(sub);
        const finalOnly: MemberPredicate = (sub, isFinal) =>
            both(sub, isFinal) && (isFinal || !sub.startsWith('hent'));
        expect(asText('hentetid', both)).toBe('hente + tid');
        expect(asText('hentetid', finalOnly)).toBeNull();
    });

    it('is case- and punctuation-insensitive', () => {
        expect(asText('Skiftetøy!')).toBe('skifte + tøy');
    });
});

describe('compoundToIPA', () => {
    it('transcribes each member separately', () => {
        // Run whole, the rule walk sees a single consonant after the linking e
        // and lengthens it. Split, "hente" keeps its schwa.
        expect(compoundToIPA('hentetid', known)).toBe('hentətiː');
        expect(compoundToIPA('hentetid', known)).not.toBe('hentiːd');
    });

    it('voices the linking morphemes', () => {
        expect(compoundToIPA('arbeidsplass', known)).toContain('s');
        expect(compoundToIPA('barnehage', known)).toContain('ə');
    });

    it('returns null for a word that does not decompose', () => {
        expect(compoundToIPA('kylling', known)).toBeNull();
    });
});

describe('compoundAccent', () => {
    it('inherits a polysyllabic head’s own accent', () => {
        // "data" is accent 1, and every data- compound in NB Uttale follows it,
        // so a flat "compounds are accent 2" default would get them all wrong.
        expect(compoundAccent({ accent: 'ACCENT_1', syllables: 2 }, '')).toBe('ACCENT_1');
        // "forskning" is accent 2.
        expect(compoundAccent({ accent: 'ACCENT_2', syllables: 2 }, '')).toBe('ACCENT_2');
        // The link makes no difference once the head has an accent to lend.
        expect(compoundAccent({ accent: 'ACCENT_1', syllables: 2 }, 's')).toBe('ACCENT_1');
    });

    it('defaults an unknown polysyllabic head to accent 2', () => {
        expect(compoundAccent({ accent: 'NONE', syllables: 3 }, '')).toBe('ACCENT_2');
    });

    it('gives an unlinked monosyllabic head accent 2', () => {
        // sollys, matvarer, halvtime, språkkompetanse — 21 of 21 in the chunk.
        expect(compoundAccent({ accent: 'ACCENT_1', syllables: 1 }, '')).toBe('ACCENT_2');
        // barn + e + hage
        expect(compoundAccent({ accent: 'ACCENT_1', syllables: 1 }, 'e')).toBe('ACCENT_2');
    });

    it('gives an -s-linked monosyllabic head accent 1', () => {
        // tid + s + bruk → 'tɪd.ˌsbrʉːk; likewise tidspunkt, tidsskrift,
        // driftskostnader, kravspesifikasjoner — 5 of 5 in the chunk.
        expect(compoundAccent({ accent: 'ACCENT_1', syllables: 1 }, 's')).toBe('ACCENT_1');
    });
});

describe('compound pronunciation against the east lexicon', () => {
    beforeAll(async () => {
        await loadDialect('east');
    });

    it('resolves words the lexicon does not carry', () => {
        // NB Uttale has "skifte" and it has "tøy"; it does not have
        // "skiftetøy", and no lexicon could, because Norwegian forms compounds
        // freely. Both members come back as real data here.
        const p = pronunciationFor('skiftetøy', 'east');
        expect(p.source).toBe('compound');
        expect(p.members).toEqual(['skifte', 'tøy']);
        expect(p.ipa).toBe('"ʃɪf.tə.ˌtœ͡ʏ');

        const hente = pronunciationFor('hentetid', 'east');
        expect(hente.members).toEqual(['hente', 'tid']);
        expect(hente.ipa).toBe('"hɛn.tə.ˌtɪː');
    });

    it('puts accent 2 on a compound with a polysyllabic native head', () => {
        // "skifte" and "hente" are disyllabic native words: accent 2, and the
        // compound inherits it.
        expect(pronunciationFor('skiftetøy', 'east').accent).toBe('ACCENT_2');
        expect(pronunciationFor('hentetid', 'east').accent).toBe('ACCENT_2');
        expect(pronunciationFor('vaskerommet', 'east').accent).toBe('ACCENT_2');
    });

    it('marks the primary stress on the first member and demotes the last', () => {
        const ipa = pronunciationFor('skiftetøy', 'east').ipa;
        // " is the accent-2 mark; it must open the word, and the last member
        // must carry secondary stress rather than a second primary.
        expect(ipa.startsWith('"')).toBe(true);
        expect(ipa).toContain('ˌ');
        expect(ipa.split('"').length - 1).toBe(1);
        expect(ipa).not.toContain("'");
    });

    it('keeps the phonemes comparable with the rest of the pipeline', () => {
        // Scoring strips prosody; what is left must be bare phonemes.
        const bare = stripProsody(pronunciationFor('skiftetøy', 'east').ipa);
        expect(bare).not.toMatch(/['"ˌ.]/);
        expect(bare.length).toBeGreaterThan(4);
    });

    it('lets the final member carry the inflection', () => {
        // A compound inflects on its last member and nowhere else, so the
        // splitter has to match "rommet" against "rom" and "tøyet" against
        // "tøy". Both of these are in the lexicon outright now, so ask the
        // compound path directly rather than through the whole-word lookup.
        expect(compoundPronunciationFor('vaskerommet', 'east')?.members).toEqual([
            'vaske',
            'rommet',
        ]);
        expect(compoundPronunciationFor('regntøyet', 'east')?.members).toEqual(['regn', 'tøyet']);
        // And through the real path, on words the lexicon does not carry.
        expect(pronunciationFor('kursinnholdet', 'east').members).toEqual(['kurs', 'innholdet']);
        expect(pronunciationFor('integrasjonstestene', 'east').members).toEqual([
            'integrasjons',
            'testene',
        ]);
    });

    it('does not read an inflected simplex as a compound', () => {
        // "bordene" is bord + -ene, not "bor" + "dene"; "kontorene" is
        // kontor + -ene, not "konto" + "rene"; "skriveren" is skriver + -en.
        for (const word of ['bordene', 'kontorene', 'skriveren']) {
            expect(compoundPronunciationFor(word, 'east')).toBeNull();
        }
        // But an inflected COMPOUND still decomposes, because its base does:
        // "legevakten" reduces to "legevakt", which is lege + vakt.
        expect(compoundPronunciationFor('legevakten', 'east')?.members).toEqual(['lege', 'vakten']);
    });

    it('rejects a member with no vowel in it', () => {
        // NB Uttale lists spelled-out abbreviations, so the member inventory
        // contains strings like "rds" — transcribed as the letters read aloud.
        // Without the check, "dashboards" came apart as dash + boa + rds and
        // the learner was shown the end of the word spelled out.
        expect(pronunciationFor('dashboards', 'east').source).toBe('rule');
    });

    it('only splits three ways when every member is a substantial word', () => {
        // Left to its own devices the splitter reads "grunnpillarer" as
        // grunn + pilla + rer. Every fragment is a real Norwegian word, which
        // is why the inventory admits them, so the length floor is what
        // separates these from the three-part splits that are genuine.
        expect(pronunciationFor('grunnpillarer', 'east').source).toBe('rule');
        expect(pronunciationFor('smarthjemenheter', 'east').members).toEqual([
            'smart',
            'hjem',
            'enheter',
        ]);
    });

    it('refuses to split on an unstressed prefix', () => {
        // "for" is ranked a noun in NB Uttale (fôr), so the part-of-speech
        // filter alone would let for + bedre through — and prefixed words carry
        // a lexical accent that no structural rule can predict.
        for (const word of ['forbedre', 'forklare', 'tilpasser', 'oppdatering']) {
            expect(compoundPronunciationFor(word, 'east')).toBeNull();
        }
    });

    it('leaves genuinely unanalysable words to the rule engine', () => {
        expect(pronunciationFor('kylling', 'east').source).toBe('rule');
        expect(pronunciationFor('zzzqqq', 'east').source).toBe('rule');
    });

    it('never shadows a real lexicon entry', () => {
        // "morgen" is in the lexicon; the compound path must not get a look in.
        expect(pronunciationFor('morgen', 'east').source).toBe('lexicon');
    });

    /**
     * The strongest check available without new data: NB Uttale already lists
     * plenty of compounds, so we can decompose one, predict its accent from its
     * members alone, and compare with the tone the lexicon actually records.
     */
    it.each([
        'datasett',
        'datalagring',
        'datagrunnlag',
        'dataanalyse',
        'brukerbehov',
        'datamaskinen',
        'forskningsprosjekter',
        'forskningssamarbeid',
        'prosjektarbeid',
        'prosjektledelse',
        'kvalitetskontroll',
        'arbeidsmarkedet',
        'kostnadseffektiviteten',
        'samfunnsøkonomiske',
        'avkastningskrav',
        'responstid',
        'tidsbruk',
        'driftskostnader',
        'endringsledelse',
        'helsedata',
    ])('predicts the recorded tone of %s from its members alone', word => {
        const recorded = pronunciationFor(word, 'east');
        expect(recorded.source).toBe('lexicon');
        const predicted = compoundPronunciationFor(word, 'east');
        expect(predicted).not.toBeNull();
        expect(predicted?.accent).toBe(recorded.accent);
    });
});
