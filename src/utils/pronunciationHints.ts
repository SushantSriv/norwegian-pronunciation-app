// IPA-basert forklaring av enkeltlyder, med engelsk referanseord der mulig
export const phonemeHints: Record<string, string> = {
    // Vowels
    // Vowels
    'i': 'Short “ee” sound, as in Norwegian “fisk” or English “bit”',
    'iː': 'Long “ee” sound, as in Norwegian “bil” or English “beet”',
    'y': 'Short front rounded “y”, as in “kyss” (no exact English equivalent)',
    'yː': 'Long front rounded “y”, as in “ly” (no English equivalent)',
    'ʉ': 'Short rounded front vowel, roughly like “ewe” without the y (no English equivalent)',
    'ʉː': 'Long rounded front vowel, as in “hus” (no English equivalent)',
    'u': 'Short “oo” sound, as in Norwegian “full” or English “put”',
    'uː': 'Long “oo” sound, as in “sol” or English “food”',
    'e': 'Short “e” sound, as in “rett” or English “bet”',
    'eː': 'Long “ay” sound, as in “se” or English “bait”',
    'ø': 'Short “ur” sound, as in “bør” (no exact English equivalent; like French “peu”)',
    'øː': 'Long “ur” sound, as in “øre” (no English equivalent)',
    'o': 'Short “oo”/“aw” sound, as in “sog” (no exact English equivalent; like “ought”)',
    'oː': 'Long “aw” sound, as in “båt” or English “law”',
    'æ': 'Short “a” sound, as in “vær” or English “cat”',
    'æː': 'Long “æ” sound, as in “bær”—a prolonged “cat” sound',
    'ɑ': 'Short open “a”, as in “mat” or British English “father”',
    'ɑː': 'Long open “a”, as in “tak” or English “spa”',

    // Reduced vowel
    'ə': 'Unstressed “uh” sound, as in the last syllable of “ikke” or English “sofa”',
    'ɔ': 'Short open “aw” sound, as in “norsk” or English “off”',

    // Diphthongs
    'æɪ': 'The “ay” glide in “hei” and “nei” — starts open, ends in a short i',
    'øʏ': 'The “øy” glide in “øye” — rounded throughout, no English equivalent',
    'æʉ': 'The “au” glide in “sau” — starts like “cat”, ends rounded',
    'ɑɪ': 'The “ai” glide in “kai” — like English “eye”',

    // Consonants
    'p': 'Unvoiced “p”, as in “penn” or English “pen”',
    'b': 'Voiced “b”, as in “ball” or English “ball”',
    't': 'Unvoiced “t”, as in “tak” or English “top”',
    'd': 'Voiced “d”, as in “da” or English “dog”',
    'k': 'Unvoiced “k”, as in “katt” or English “cat”',
    'g': 'Voiced “g”, as in “gå” or English “go”',
    'f': 'Unvoiced “f”, as in “far” or English “far”',
    'v': 'Voiced “v”, as in “vann” or English “van”',
    's': 'Unvoiced “s”, as in “sol” or English “sun”',
    'ʃ': '“sh” sound, as in “sju” or English “shoe”',
    'ç': 'Soft palatal “kj”, as in “kjøtt”—similar to German “ich”',
    'h': '“h” sound, as in “hus” or English “house”',
    'm': '“m” sound, as in “mus” or English “mouse”',
    'n': '“n” sound, as in “natt” or English “night”',
    'ŋ': '“ng” sound, as in “lang” or English “sing”',
    'r': 'Rolled or trilled “r” with the tongue tip—unlike English “r”',
    'l': 'Clear “l”, as in Norwegian “lam”—not the dark English “l”',
    'j': '“y” consonant, as in “ja” or English “yes”',
    'w': '“w” sound, rare in native words, as in “whisky”',
    'ʂ': 'Retroflex “sj” sound, as in eastern dialects—like Polish “sz”',
    'ʈ': 'Retroflex t, as in “trøtt”',
    'ɖ': 'Retroflex d, as in “lørdag”',
    'ɳ': 'Retroflex n, as in “barn” — tongue tip curled back',
    'ɭ': 'Retroflex l, as in “kveld” — tongue tip curled back',
};

// Enkle tips for enkelte ord
export const adviceMap: Record<string, string> = {
    // Level 1 basics
    hei: "Say “hay” with the diphthong /æɪ/, not a hard “haj.”",
    takk: "Use a short, crisp /a/ and clear /k/—don’t say “tag.”",
    ja: "Hold a long open /ɑː/, like “aah.”",
    nei: "Use the diphthong /æɪ/, not “nai.”",
    mor: "Lightly trill or uvular-r, then a short /u/—not “moor.”",
    far: "Long /ɑː/ plus a clear r at the end—don’t drop the r.",
    sol: "Round your lips for a long /uː/, like “sool.”",
    hus: "Round /ʉː/ (not the English /huːs/).",
    mat: "Hold the vowel long /ɑː/, not as short as in “Matt.”",
    "god natt": "Silent d in “god” — pronounce as “go natt.”",

    // Level 2–3 (common function words)
    jeg: "Diphthong /jæɪ/, not “jegg.”",
    du: "Round /ʉː/—pucker your lips together.",
    det: "Short “e”, don’t over-articulate the t.",
    ikke: "Silent h, say “ikke” /ɪkə/, not “hikke.”",
    hva: "Pronounce “va”, the h is silent.",
    hvor: "Round /ʉ/ in the middle, finish with a light r.",
    når: "Open /oː/ + r, not “nårR.”",
    hvem: "Silent h, short /vɛm/.",
    hvordan: "Stress first syllable “HVOR-”, silent d at end.",
    fordi: "Stress the second syllable /diː/.",

    // Level 1–5 verbs & nouns
    liker: "Long i-sound /liːkər/. Don’t say “laiker.”",
    jobber: "Double b → short vowel “jobb-” plus a schwa-r.",
    leser: "Stress first syllable “LE-ser.”",
    prøver: "Ø-sound /øː/—round your lips.",
    spiser: "Long i /spiː-/—not “spisser.”",
    drikker: "Short i + double k /ˈdrikːər/.",
    kaffe: "Open /ɑ/ in both syllables: /kɑfə/.",
    vann: "Short a; double n makes the vowel short.",
    bok: "Round /uː/, not like English “book.”",
    film: "Short i; pronounce final m clearly.",
    sofa: "Say /ˈsuːfa/—stress the first syllable.",
    penger: "Soft g (“penn-yer”), not a hard /g/.",

    // plurals & small words
    oss: "Short, open /ɔs/, not “ås.”",
    dere: "Two syllables “de-re”, open e.",
    våre: "Open /oː/ in the first syllable.",
    mine: "Long /iː/ — “mi-ne”, not “main.”",
    dine: "Same pattern as “mine.”",

    // time expressions
    morgen: "Pronounce “mår-ren” /ˈmɔːrən/.",
    kveld: "Final -ld → retroflex /ɭ/.",
    lørdag: "ˈløːɖɑːg — retroflex d in the middle.",
    mandag: "Nasal /ɑn-/ plus a retroflex d.",
    torsdag: "“rs” → retroflex /ʂ/ as in “tåʂ-.”",

    // Level 4–7 common mistakes
    vanskelig: "Stress first syllable “VANS-kli”, not *vanskelig*.",
    hyggelig: "Y-sound /ʏ/ + retroflex ‘gl’: “HY-g-li.”",
    selvfølgelig: "Three syllables: “sel-FØL-ge-li.”",
    trøtt: "Retroflex /ʈrøtː/, round the tongue tip.",

    // polite small phrases
    "vær så snill": "R-s → retroflex /ʂ/: say “værʂ snill.”",
    "tusen takk": "Long /uː/ in “tusen,” pause before “takk.”",
    sykehus: "Two y-sounds /ˈʃyːkəhuːs/.",
    språk: "Open /oː/ + retroflex k: /sprɔːk/.",
    går: "Long /goːr/.",
    år: "Same vowel as “går.”",
    gjør: "Palatal j- + /øː/.",
    kjører: "Palatal ‘kj’ → /çøːrər/.",

    // “kj/sj” minimal pairs
    kjære: "Thin palatal /ç/ — not like “skjære.”",
    skjære: "Sj-sound /ʂ/ — made further back in the mouth.",

    // … fyll gjerne på videre etter behov …
};

// Returner tips for ord – hvis det finnes
export function getAdvice(word: string): string | undefined {
    return adviceMap[word.toLowerCase()];
}

// Returner forklaring på fonem – hvis vi har
export function getPhonemeHint(symbol: string): string | undefined {
    return phonemeHints[symbol];
}
