/**
 * Seed inventory of Norwegian compound elements.
 *
 * Norwegian compounds freely and writes the result as one word, so a corpus
 * will always contain compounds that no pronunciation lexicon lists —
 * "skiftetøy", "hentetid", "vaskerommet". Splitting those into members we DO
 * know is what lets us give them a real transcription and, more importantly,
 * the right pitch accent.
 *
 * That split needs an inventory of possible members. Three sources feed it, in
 * descending order of trustworthiness:
 *
 *   1. The loaded NB Uttale dialect chunk — real data, used whenever it covers
 *      the member.
 *   2. `parts.<dialect>.json`, harvested from NB Uttale by
 *      scripts/build-pronunciation.mjs for exactly the members this corpus
 *      needs. Absent until someone regenerates with the 158 MB source at hand.
 *   3. This list — the words below, transcribed by the rule engine.
 *
 * So this is a SEED, not a lexicon: it answers "is this a Norwegian word that
 * can head a compound", nothing more. Entries are base forms as they appear as
 * a compound member (verbs in their -e stem: "vaske-", "hente-"), because that
 * is the shape compounding actually uses.
 *
 * Two kinds of word are deliberately absent:
 *
 *   - Anything under three letters, which the splitter rejects anyway and which
 *     matches far too much.
 *   - Unstressed verbal prefixes (be-, for-, an-, av-, opp-) . They look like
 *     compound members but behave nothing like them: "forsiktig" is
 *     fɔ.'ʃɪk.tɪ, stressed on the SECOND syllable, whereas a compound is always
 *     stressed on its first member. Treating them as members would move the
 *     stress to the wrong syllable and flip the accent with it.
 */

/**
 * Words usable as a compound member. Lower-case, base form, no inflection —
 * the final member of a compound carries the inflection and is matched
 * separately (see `inflectedForms` in pronunciationLexicon.ts).
 */
export const COMPOUND_ELEMENTS: ReadonlySet<string> = new Set([
    // ---- Time -----------------------------------------------------------
    'dag', 'døgn', 'ettermiddag', 'formiddag', 'helg', 'høst', 'kveld', 'morgen',
    'natt', 'sommer', 'tid', 'time', 'uke', 'vinter', 'vår', 'måned', 'minutt',
    'sekund', 'frist', 'termin', 'periode', 'ferie', 'fridag', 'åpningstid',

    // ---- Home and everyday ----------------------------------------------
    'bad', 'bord', 'dør', 'gulv', 'hage', 'hjem', 'hus', 'hylle', 'kjeller',
    'kjøkken', 'kjøleskap', 'komfyr', 'lampe', 'loft', 'rom', 'seng', 'skap',
    'sofa', 'speil', 'stol', 'stue', 'tak', 'teppe', 'trapp', 'vask', 'vegg',
    'vindu', 'gardin', 'nøkkel', 'lås', 'håndtak',
    'glass', 'kniv', 'kopp', 'gaffel', 'tallerken', 'kanne', 'flaske', 'bøtte',
    'klut', 'kost', 'søppel', 'avfall', 'papir', 'pose', 'sekk', 'eske',

    // ---- Food ------------------------------------------------------------
    'brød', 'drikke', 'fisk', 'frokost', 'kaffe', 'kake', 'kjøtt', 'mat',
    'melk', 'middag', 'lunsj', 'ost', 'suppe', 'vann', 'saft', 'sukker', 'salt',
    'grønnsak', 'frukt', 'dessert', 'porsjon',

    // ---- Clothing and protective gear ------------------------------------
    'arbeidstøy', 'bukse', 'briller', 'frakk', 'genser', 'hanske', 'hjelm',
    'jakke', 'kjeledress', 'sko', 'sokk', 'støvel', 'tøy', 'vern', 'verne',
    'vest', 'klær', 'hørsel', 'ører', 'maske',

    // ---- Body and health -------------------------------------------------
    'apotek', 'arm', 'bandasje', 'ben', 'blod', 'feber', 'fot', 'hode', 'hånd',
    'journal', 'kropp', 'lege', 'legevakt', 'medisin', 'pasient', 'pleie',
    'prøve', 'puls', 'resept', 'rygg', 'skade', 'smerte', 'sykdom', 'syke',
    'sykepleier', 'tablett', 'tann', 'trykk', 'øye', 'behandling', 'diagnose',

    // ---- Work and workplace ----------------------------------------------
    'arbeid', 'ansatt', 'avdeling', 'avtale', 'bedrift', 'butikk', 'firma',
    'jobb', 'kollega', 'kontor', 'kunde', 'lager', 'ledelse', 'leder', 'lønn',
    'medarbeider', 'møte', 'pause', 'personal', 'sjef', 'skift', 'skifte',
    'stilling', 'vakt', 'verksted', 'yrke', 'oppgave', 'rutine', 'instruks',
    'kontrakt', 'faktura', 'kvittering', 'ordre', 'bestilling', 'tilbud',
    'regning', 'budsjett', 'kostnad', 'inntekt', 'lønnsomhet',

    // ---- Logistics and transport -----------------------------------------
    'bil', 'buss', 'båt', 'fly', 'frakt', 'gods', 'last', 'laste', 'lastebil',
    'levering', 'leveranse', 'palle', 'rute', 'sending', 'tog', 'transport',
    'truck', 'vogn', 'container', 'terminal', 'sjåfør', 'kilometer',

    // ---- Building trades --------------------------------------------------
    'betong', 'bjelke', 'bolt', 'brett', 'drill', 'flis', 'gips', 'hammer',
    'kran', 'maling', 'mur', 'planke', 'sag', 'sement', 'skrue', 'spiker',
    'stein', 'stige', 'stillas', 'tegning', 'tre', 'verktøy', 'bygg', 'bygge',
    'anlegg', 'material', 'plate', 'rør', 'kabel', 'stål',

    // ---- School, language, general nouns ----------------------------------
    'barn', 'bok', 'brev', 'by', 'del', 'dokument', 'elev', 'familie', 'far',
    'film', 'foreldre', 'gang', 'gate', 'grense', 'grunn', 'gruppe', 'hjelp',
    'ide', 'innhold', 'kart', 'kasse', 'kilde', 'klasse', 'klokke',
    'kort', 'krav', 'kurs', 'land', 'lyd', 'lys', 'lærer', 'liste', 'mor',
    'mål', 'navn', 'nivå', 'nummer', 'område', 'ord', 'penger', 'plan', 'plass',
    'post', 'pris', 'punkt', 'ramme', 'rapport', 'regel', 'regn', 'rekke',
    'ressurs', 'ring', 'sak', 'side', 'skole', 'skilt', 'sol', 'spor', 'språk',
    'sted', 'stund', 'stykke', 'støv', 'størrelse', 'svar', 'telefon', 'tekst',
    'tema', 'tur', 'vare', 'vei', 'vekt', 'venn', 'verdi', 'vær', 'år',
    'student', 'veiledning', 'samling', 'medlem', 'partner', 'leverandør',

    // ---- Technology and data ----------------------------------------------
    'algoritme', 'analyse', 'arkitektur', 'base', 'data', 'database', 'drift',
    'fil', 'funksjon', 'informasjon', 'kapasitet', 'kode', 'kompetanse',
    'kvalitet', 'løsning', 'maskin', 'metode', 'modell', 'nett', 'nettverk',
    'program', 'programvare', 'prosess', 'prosjekt', 'server', 'sikkerhet',
    'skjema', 'skjerm', 'struktur', 'system', 'teknologi', 'tilgang', 'tjeneste',
    'utstyr', 'versjon', 'ytelse', 'enhet', 'test', 'feil', 'risiko', 'sky',
    'passord', 'konto', 'bruker', 'utvikling', 'endring', 'innsikt',

    // ---- Verb stems that head compounds ------------------------------------
    // The -e stem, which is the form compounding uses: vaske-, hente-, skifte-.
    'bestille', 'betale', 'bruke', 'bygge', 'bære', 'dekke', 'dele', 'dusje',
    'feie', 'fylle', 'føre', 'handle', 'hente', 'hjelpe', 'kjøre', 'klippe',
    'koke', 'lage', 'lese', 'levere', 'lære', 'male', 'montere', 'måle',
    'pakke', 'pusse', 'regne', 'rydde', 'sende', 'skrive', 'sortere', 'spise',
    'steke', 'stelle', 'støpe', 'sveise', 'tegne', 'teste', 'tørke', 'vaske',
    'vente', 'øve', 'sjekke', 'tømme', 'løfte', 'flytte',

    // ---- Adjectives and quantifiers used as first members -------------------
    'full', 'gammel', 'god', 'halv', 'hel', 'høy', 'kald', 'kort', 'lang',
    'lav', 'lett', 'ren', 'sann', 'sikker', 'smart', 'stor', 'tom', 'tung',
    'tørr', 'varm', 'vond', 'ledig', 'travel', 'trygg',

    // ---- Adverbial first members (stressed, unlike the verbal prefixes) ------
    'hjemme', 'borte', 'sammen', 'ekstra', 'selv',
]);

/** True when `word` is a member we are willing to build a compound out of. */
export const isCompoundElement = (word: string): boolean => COMPOUND_ELEMENTS.has(word);
