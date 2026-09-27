/**
 * What the examiner says, word for word.
 *
 * Transcribed from the official "Mal ... Til eksaminator" templates. These are
 * read aloud at the real exam — Vedlegg 4 says so: "I hvert oppgavesett står
 * det først informasjon til kandidatene. Les dette høyt for kandidatene før
 * prøven begynner." So the app reads them aloud too, rather than paraphrasing
 * into something friendlier. Recognising the wording is part of what a
 * rehearsal is for.
 *
 * Lines marked as notes are shown on screen and NEVER spoken: at the real exam
 * they are instructions to the examiner, not speech to the candidate. Speaking
 * them would teach a candidate to expect something they will not hear.
 */
import type { Nivaa } from './oppgaver';

/** The opening, read before anything else. Differs only in the task count. */
export const AAPNING: Record<Nivaa, string> = {
    'A1-A2':
        'Velkommen til denne prøven i muntlig kommunikasjon. Prøven har fire oppgaver. Dere skal snakke alene i tre oppgaver, og snakke sammen i én oppgave. Dere kan spørre hvis dere ikke forstår oppgavene.',
    'A2-B1':
        'Velkommen til denne prøven i muntlig kommunikasjon. Prøven har tre oppgaver. Dere skal snakke alene i to oppgaver, og snakke sammen i én oppgave. Dere kan spørre hvis dere ikke forstår oppgavene.',
    'B1-B2':
        'Velkommen til denne prøven i muntlig kommunikasjon. Prøven har tre oppgaver. Dere skal snakke alene i to oppgaver, og snakke sammen i én oppgave. Dere kan spørre hvis dere ikke forstår oppgavene.',
};

/**
 * The warm-up, on A2-B1 and B1-B2 only.
 *
 * The distinction this teaches is the single most useful thing in the mode: at
 * these levels talking about yourself is explicitly NOT assessed, while at
 * A1-A2 the same content is Oppgave A and counts. A candidate who has entered
 * at the wrong level often does not know that.
 */
export const OPPVARMING = {
    says: 'Før vi begynner med første oppgave: Vil dere begynne med å fortelle helt kort om dere selv? Du kan begynne.',
    note: 'Dette er en oppvarmingsøvelse som ikke skal være del av vurderingsgrunnlaget.',
};

/** Per-task framing, spoken before the prompt. */
export const INNLEDNING = {
    a1a2A:
        'I oppgave A skal dere snakke én og én. Dere får samme oppgave. Til den første kandidaten: Du kan begynne.',
    a1a2B:
        'I oppgave B skal dere få se et bilde og fortelle hva dere ser på bildet. Dere skal snakke én og én.',
    a1a2C: 'I oppgave C skal dere snakke sammen.',
    /** Used for the individual "one topic each" slots. */
    entemaHver:
        'I oppgave C skal dere snakke én og én om ett tema hver. Til den første kandidaten: Du kan begynne. Til den andre kandidaten: Du skal få en annen oppgave etterpå.',
    samtaleBeggeAktive:
        'I oppgave B skal dere snakke sammen. Det er viktig at dere begge er aktive i samtalen.',
    samtaleOppgittEmne:
        'I oppgave B skal dere snakke sammen om et oppgitt emne. Det er viktig at dere begge er aktive i samtalen.',
    argumentere:
        'I den siste oppgaven skal dere snakke alene i 2–3 minutter. Dere får høre en påstand, og så skal dere si hva dere synes om den og begrunne meningene deres. Etterpå får dere noen spørsmål til temaet.',
    tenketid: 'Har du forstått oppgaven? Du kan få litt tid til å tenke deg om og notere hvis du vil.',
    /** The turn-taking cue, which is most of what a pareksamen feels like. */
    duKanBegynne: 'Du kan begynne.',
};

/** Said after every task. */
export const AVSLUTNING_OPPGAVE = 'Som avslutning: Takk';

/**
 * Things the app states about itself rather than quoting.
 *
 * Kept here so every claim the mode makes sits in one file and can be read in
 * one go, rather than scattered through components where an overclaim could
 * hide.
 */
export const APP_SIER = {
    ikkeHkdir:
        'Dette er ikke et produkt fra HK-dir. Oppgavene og replikkene er sitert fra HK-dirs publiserte eksempler, med lenke til kilden.',
    ikkeEkteOppgaver:
        'Hver oppgave her er en HK-dir har publisert som eksempel. De virkelige oppgavene er konfidensielle — de skrives ut fra PAD en uke før prøveperioden og makuleres etterpå. Ingen app kan gi deg de ekte spørsmålene, og en som påstår det, gjetter.',
    ingenBilder:
        'Oppgave B krever et fargebilde av en scene med flere personer. Vi har ikke rettighetene til HK-dirs tegninger, og et feil bilde er en feil oppgave. Klokka og replikkene kjører, men bildet må du se i PDF-en fra HK-dir.',
    ingenPartner:
        'Samtaleoppgaven krever en annen kandidat. Vi later ikke som med en syntetisk stemme — en innspilt partner som alltid er enig, lærer deg feil ting.',
    aleneErLov:
        'Å ta prøven alene med eksaminator som samtalepartner er et anerkjent avvik, ikke en nødløsning vi fant på: «I noen tilfeller kan det av praktiske hensyn være nødvendig å la en kandidat ta prøven alene med eksaminator som samtalepartner.»',
    halvDupleks:
        'Appen lytter ikke mens den snakker. På den virkelige prøven kan eksaminator avbryte deg; her må hun bli ferdig først.',
    hvemForst:
        'Det er ikke publisert hvordan eksaminator velger hvem som begynner. Vi finner ikke på en regel — velg selv.',
    ingenTenketall:
        'Det er ikke offentliggjort hvor lang tid du får her, så vi finner ikke på et tall.',
    oppfolgingIkkePublisert:
        'På den virkelige prøven får du oppfølgingsspørsmål til denne påstanden. De er ikke publisert, og vi dikter dem ikke opp.',
    ingenOppfolgingPaaSamtalen:
        'På denne oppgaven stiller eksaminator ingen oppfølgingsspørsmål. De 5–7 minuttene er deres.',
    temaFaarDrive:
        'Det gjør ingenting om samtalen sklir bort fra temaet: «det er mindre viktig om temaet endrer seg bort fra det som ble gitt».',
    totaltid:
        'HK-dir publiserer varighet per oppgave og en totaltid på 20–25 minutter, men ingen minutt-for-minutt-fordeling. En B1–B2-prøve kan derfor gå over.',
};
