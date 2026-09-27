import { useMemo, useState } from 'react';
import { alignWords } from '../../utils/scoring';

interface Answer {
    segmentId: string;
    title: string;
    letter?: string;
    transcript: string;
}

interface Props {
    answers: Answer[];
}

/**
 * Checking your own grammar, because the app cannot check it for you.
 *
 * The reason is worth stating plainly rather than hiding behind "coming soon":
 * the browser's speech service writes what it thinks you MEANT. Its language
 * model fixes endings, agreement and word order on the way past, so by the time
 * a transcript exists the grammar error may be gone. An app that counted errors
 * in that transcript would be grading the recogniser, not the candidate.
 *
 * What is left that is genuinely useful: you rewrite the sentence the way you
 * believe it should be, and the words you changed are marked. Nobody scores it,
 * nothing is stored, and the act of rewriting is the exercise.
 */
export function Selvsjekk({ answers }: Props) {
    const usable = answers.filter(answer => answer.transcript.trim().length > 0);
    if (!usable.length) return null;

    return (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">
                Rett deg selv
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                Taletjenesten skriver det den tror du mente, og retter endelser og ordstilling på
                veien — så teksten under kan allerede være penere enn det du sa. Skriv om setningen
                slik du mener den skal være. Ordene du endrer blir markert. Ingen retter det, og
                ingenting lagres.
            </p>

            <div className="mt-4 space-y-4">
                {usable.map(answer => (
                    <Rewrite key={answer.segmentId} answer={answer} />
                ))}
            </div>
        </div>
    );
}

function Rewrite({ answer }: { answer: Answer }) {
    const [mine, setMine] = useState(answer.transcript);
    const touched = mine.trim() !== answer.transcript.trim();

    const marked = useMemo(() => {
        if (!touched) return null;
        const heard = answer.transcript.trim().split(/\s+/).filter(Boolean);
        const written = mine.trim().split(/\s+/).filter(Boolean);
        return alignWords(heard, written).map((chunk, index) => ({
            key: `${chunk.kind}-${index}`,
            kind: chunk.kind,
            word: chunk.hypIdx !== null ? written[chunk.hypIdx] : heard[chunk.refIdx ?? 0],
        }));
    }, [touched, mine, answer.transcript]);

    return (
        <div>
            <p className="text-[13px] font-semibold text-white/60">
                {answer.letter ? `Oppgave ${answer.letter} · ` : ''}
                {answer.title}
            </p>

            <label className="sr-only" htmlFor={`rewrite-${answer.segmentId}`}>
                Skriv om svaret ditt
            </label>
            <textarea
                id={`rewrite-${answer.segmentId}`}
                value={mine}
                onChange={event => setMine(event.target.value)}
                rows={3}
                spellCheck={false}
                className="mt-1.5 w-full resize-y rounded-lg border border-white/12 bg-white/[0.04] p-3 text-sm leading-relaxed text-white/85 outline-none transition focus:border-white/35 focus-visible:ring-2 focus-visible:ring-sky-300/50"
            />

            {marked && (
                <p className="mt-2 text-sm leading-relaxed">
                    {marked.map(item => (
                        <span
                            key={item.key}
                            className={
                                item.kind === 'equal'
                                    ? 'text-white/45'
                                    : item.kind === 'delete'
                                      ? 'text-rose-300/60 line-through'
                                      : 'text-emerald-200'
                            }
                        >
                            {item.word}{' '}
                        </span>
                    ))}
                </p>
            )}
        </div>
    );
}
