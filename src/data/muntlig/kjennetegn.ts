/**
 * What each level sounds like, in HK-dir's own words.
 *
 * The vurderingskort is honest about what it cannot measure, and that left it
 * saying nothing at all about what a good answer IS. A candidate who has just
 * rehearsed wants to know what they are aiming at, and there is a published
 * answer to that: the kjennetegn på måloppnåelse for muntlige ferdigheter,
 * one descriptor per criterion per CEFR level.
 *
 * Every string below is quoted verbatim from HK-dir's competence package. None
 * of it is written here, for the same reason none of the exam tasks are: the
 * whole value of showing a candidate what B1 sounds like is that it is what
 * the people marking them were given.
 *
 * WHY BOTH LEVELS. Each exam covers a span — A1–A2, A2–B1, B1–B2 — and the
 * useful thing is not one descriptor but the pair: what separates the lower
 * band from the upper one is exactly the distance a candidate is trying to
 * cover. Showing only the target would hide the step.
 *
 * ONE TRANSCRIPTION NOTE: the source page spells "enkeltstående" in the A1
 * ordforråd line with a typo. It is corrected here, and nothing else is.
 */
import type { Kriterium } from '../../utils/criteriaReport';
import type { Nivaa } from './oppgaver';

export type CefrTrinn = 'A1' | 'A2' | 'B1' | 'B2';

export const KJENNETEGN_KILDE = {
    label: 'HK-dirs kjennetegn på måloppnåelse, muntlige ferdigheter',
    url: 'https://kompetansepakker.hkdir.no/norsk/den-nye-lareplanen/kjennetegn-pa-maloppnaelse/',
};

export const KJENNETEGN: Record<CefrTrinn, Record<Kriterium, string>> = {
    A1: {
        flyt: 'Deltakeren produserer svært korte, isolerte ytringer som for det meste er faste, innøvde fraser.',
        uttale:
            'Deltakerens uttale er svært påvirket av andre språk han/hun snakker, men deltakeren kan gjøre seg forstått hvis samtalepartneren anstrenger seg.',
        ordforrad:
            'Deltakeren har et elementært repertoar av enkeltstående ord og uttrykksmåter knyttet til egen person og kjente situasjoner i dagliglivet.',
        grammatikk: 'Deltakeren bruker noen få, innøvde, grunnleggende grammatiske strukturer.',
    },
    A2: {
        flyt: 'Deltakeren produserer sammenhengende tale, men tar mange pauser for å lete etter ord og formuleringer.',
        uttale:
            'Deltakerens uttale er stort sett forståelig selv om påvirkningen fra andre språk han/hun snakker, er tydelig.',
        ordforrad:
            'Deltakeren har et ordforråd som er tilstrekkelig for enkel kommunikasjon i dagligdagse og forutsigbare situasjoner.',
        grammatikk:
            'Deltakeren bruker noen grunnleggende grammatiske strukturer riktig, slik at det vanligvis er klart hva han/hun prøver å uttrykke.',
    },
    B1: {
        flyt: 'Deltakeren uttrykker seg med rimelig god flyt, men reparasjoner og leting etter ord, formuleringer og korrekte former forekommer.',
        uttale:
            'Deltakerens uttale er så god at det stort sett er lett å forstå det som blir sagt, selv om uttalen kan være påvirket av andre språk han/hun snakker.',
        ordforrad:
            'Deltakeren har et stort nok ordforråd til å kommunisere om de fleste emner de må forholde seg til i hverdagen.',
        grammatikk:
            'Deltakeren har et forholdsvis godt grep om grunnleggende grammatiske strukturer og bruker også noen utbygde fraser og leddsetninger på en forståelig måte.',
    },
    B2: {
        flyt: 'Deltakeren uttrykker seg spontant og med grei flyt, uten forstyrrende pauser. Nøling kan forekomme når deltakeren leter etter ord og formuleringer.',
        uttale:
            'Deltakerens uttale er så god at det er lett å forstå det som blir sagt. Påvirkning fra andre språk han/hun snakker, forekommer, men det har liten eller ingen betydning for forståeligheten.',
        ordforrad:
            'Deltakeren har et stort ordforråd innen sitt eget felt og de fleste allmenne emner. Deltakeren varierer formuleringene og kommuniserer med stor grad av leksikalsk presisjon.',
        grammatikk:
            'Deltakeren har et godt grep om grunnleggende grammatiske strukturer, og gjør ikke feil som fører til misforståelser. Deltakeren varierer setningstyper og bruker en del komplekse setninger på en vellykket måte.',
    },
};

/** The two CEFR steps an exam level spans, lower first. */
export const TRINN_FOR: Record<Nivaa, [CefrTrinn, CefrTrinn]> = {
    'A1-A2': ['A1', 'A2'],
    'A2-B1': ['A2', 'B1'],
    'B1-B2': ['B1', 'B2'],
};
