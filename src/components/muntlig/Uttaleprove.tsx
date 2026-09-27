import { useCallback, useState } from 'react';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useDialect } from '../../hooks/useDialect';
import { scoreAttempt, type AttemptScore } from '../../utils/scoring';
import type { Recognition } from '../../utils/speech';

/**
 * The one place in this mode where a pronunciation number is honest.
 *
 * The vurderingskort strikes out uttale, and the reason is not modesty: the app
 * scores pronunciation by comparing what you said against what you were
 * supposed to say, and a free exam answer has no "supposed to". So instead of
 * inventing a target — the transcript is the recogniser's guess, and scoring
 * against it would score the recogniser — this hands you a sentence to read
 * back. Now there is something real to compare against.
 *
 * Even so there is no composite here, only which words did not come through.
 * A figure out of a hundred, sitting in a summary of an exam rehearsal, is read
 * as a mark for the exam no matter what the caption says.
 *
 * It is still NOT the exam's uttale criterion. The exam asks whether a listener
 * understands you across a whole conversation; this asks whether one read
 * sentence matched a reference. A sentence read off a screen is also easier
 * than the same words found under pressure. Both of those are said on screen
 * rather than left for the learner to work out.
 */

/**
 * Sentences to read back.
 *
 * Everyday Norwegian at roughly the register of the exam, chosen so that every
 * word is one the lexicon knows — a word the lexicon has to guess at would be
 * scored against the rule engine's guess rather than against a reference, and
 * that is the same problem in a smaller box.
 */
const SETNINGER = [
    'Jeg tar bussen til jobben hver morgen.',
    'Vi skal spise middag klokka fem i dag.',
    'Hun bor i en liten leilighet i byen.',
    'Det var mye folk på butikken i går.',
    'Kan du fortelle meg hvor stasjonen er?',
    'Barna leker ute selv om det regner.',
];

const pick = (skip: string | null): string => {
    const options = SETNINGER.filter(line => line !== skip);
    return options[Math.floor(Math.random() * options.length)];
};

export function Uttaleprove() {
    const { toIpa, ready } = useDialect();
    const [setning, setSetning] = useState(() => pick(null));
    const [result, setResult] = useState<AttemptScore | null>(null);

    const onResult = useCallback(
        (recognition: Recognition) => setResult(scoreAttempt(setning, recognition.text, toIpa)),
        [setning, toIpa]
    );

    const voice = useVoiceInput({ onResult });

    const again = () => {
        setResult(null);
        setSetning(current => pick(current));
    };

    const missed = result?.wordScores.filter(word => word.status !== 'equal') ?? [];

    return (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">Uttaleprøve</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                Les setningen høyt. Her finnes det en fasit å sammenligne med, så tilbakemeldingen
                betyr noe — i motsetning til på et fritt svar. Men det er ikke prøvens
                uttalekriterium: prøven spør om en samtalepartner forstår deg gjennom en hel
                samtale, og en setning lest fra skjermen er lettere enn de samme ordene funnet
                under press. Derfor står det ingen sum her, bare hvilke ord som ikke kom fram.
            </p>

            <p className="mt-3.5 text-lg font-semibold leading-relaxed text-white">{setning}</p>

            {!result && (
                <button
                    onClick={() => void voice.start()}
                    disabled={voice.listening || voice.transcribing || !ready}
                    className="mt-3.5 min-h-[48px] w-full rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {voice.listening
                        ? 'Hører etter — trykk når du er ferdig'
                        : voice.transcribing
                          ? 'Regner ut …'
                          : 'Les setningen høyt'}
                </button>
            )}

            {voice.listening && (
                <button
                    onClick={voice.stop}
                    className="mt-2 min-h-[44px] w-full rounded-xl border border-white/20 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/10"
                >
                    Jeg er ferdig
                </button>
            )}

            {voice.interim && !result && (
                <p className="mt-2.5 text-sm italic text-white/45">{voice.interim}</p>
            )}

            {voice.error && <p className="mt-2.5 text-sm text-amber-300">{voice.error}</p>}

            {result && (
                <div className="mt-4">
                    {/*
                      Underlines as well as colour, and the sounds spelled out
                      below rather than hidden in a tooltip. A tooltip cannot be
                      opened by touch at all, and this screen used to tell people
                      to hover — on a phone, which is where most of them are.
                    */}
                    <p className="text-sm leading-relaxed">
                        {result.wordScores.map(word => (
                            <span
                                key={`${word.word}-${word.index}`}
                                className={
                                    word.status === 'equal'
                                        ? 'text-emerald-200'
                                        : word.score >= 0.6
                                          ? 'text-amber-200 underline decoration-dotted decoration-2 underline-offset-4'
                                          : 'text-rose-300 underline decoration-wavy decoration-2 underline-offset-4'
                                }
                            >
                                {word.word}
                                {word.status !== 'equal' && (
                                    <span className="sr-only">
                                        {word.score >= 0.6 ? ' (nesten)' : ' (kom ikke fram)'}
                                    </span>
                                )}{' '}
                            </span>
                        ))}
                    </p>

                    {missed.length === 0 ? (
                        <p className="mt-2.5 text-[12px] leading-relaxed text-white/45">
                            Hvert ord kom fram slik det skulle.
                        </p>
                    ) : (
                        <div className="mt-3 space-y-1.5">
                            <p className="text-[12px] text-white/45">
                                {missed.length} av {result.wordScores.length} ord kom ikke fram:
                            </p>
                            <ul className="space-y-1">
                                {missed.map(word => (
                                    <li
                                        key={`miss-${word.word}-${word.index}`}
                                        className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-white/60"
                                    >
                                        <span className="font-semibold text-white/85">
                                            {word.word}
                                        </span>
                                        {word.expectedIpa && (
                                            <span className="text-white/40">
                                                skal være <span className="text-white/70">
                                                    /{word.expectedIpa}/
                                                </span>
                                            </span>
                                        )}
                                        {word.heardIpa && (
                                            <span className="text-white/40">
                                                — hørt som <span className="text-white/70">
                                                    /{word.heardIpa}/
                                                </span>
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <button
                        onClick={again}
                        className="mt-3 min-h-[44px] w-full rounded-xl border border-white/20 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:bg-white/10"
                    >
                        En setning til
                    </button>
                </div>
            )}
        </div>
    );
}
