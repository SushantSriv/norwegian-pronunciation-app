import { previousAt, type ExamRun } from '../../utils/examHistory';
import type { Nivaa } from '../../data/muntlig/oppgaver';

interface Props {
    history: ExamRun[];
    nivaa: Nivaa;
    onForget: () => void;
}

const date = (iso: string) =>
    new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });

const nb = (value: number, digits = 0) =>
    value.toLocaleString('nb-NO', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Your own past rehearsals.
 *
 * COMPARED TO NOBODY BUT YOURSELF, and at the same level only. The three levels
 * are different exams — three tasks against four, a conversation slot of five to
 * seven minutes against two to three — so a pause count from one says nothing
 * about the other, and a pause count from another learner says nothing at all.
 *
 * The change line deliberately does not call a direction good or bad. Fewer
 * pauses can be a candidate who has relaxed, or one who has stopped thinking
 * before they speak. The app knows which number moved; it does not know which
 * of those happened.
 */
export function Historikk({ history, nivaa, onForget }: Props) {
    const atLevel = history.filter(run => run.nivaa === nivaa);
    if (atLevel.length < 2) return null;

    const latest = atLevel[0];
    const before = previousAt(history, nivaa);

    return (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">
                    Dine tidligere {nivaa}-prøver
                </h2>
                <button
                    onClick={onForget}
                    className="shrink-0 text-[11px] font-semibold text-white/35 underline-offset-2 transition hover:text-white/70 hover:underline"
                >
                    Slett historikken
                </button>
            </div>

            {before && latest.pauses !== null && before.pauses !== null && (
                <p className="mt-2 text-[12px] leading-relaxed text-white/50">
                    Forrige gang ({date(before.at)}): {nb(before.pauses)} pauser. I dag:{' '}
                    {nb(latest.pauses)}.{' '}
                    {latest.pauses === before.pauses
                        ? 'Like mange. Det betyr ikke at ingenting har endret seg — appen teller bare stillhet.'
                        : 'Appen vet hvilket tall som flyttet seg, ikke om det er bra — færre pauser kan være at du har slappet av, eller at du har sluttet å tenke deg om.'}
                </p>
            )}

            <ul className="mt-3 space-y-1">
                {atLevel.slice(0, 8).map((run, index) => (
                    <li
                        // Two runs can share a timestamp to the second.
                        key={`${run.at}-${index}`}
                        className="flex items-baseline justify-between gap-3 text-[13px] tabular-nums text-white/55"
                    >
                        <span className="text-white/40">{date(run.at)}</span>
                        <span className="min-w-0 flex-1 truncate text-right">
                            {run.pauses === null ? 'ikke målt' : `${nb(run.pauses)} pauser`}
                            {run.speaking !== null && ` · ${nb(run.speaking)} s snakket`}
                            {` · ${nb(run.tokens)} ord`}
                        </span>
                    </li>
                ))}
            </ul>

            <p className="mt-3 text-[11px] leading-relaxed text-white/30">
                Bare tallene over lagres, og bare i denne nettleseren. Verken opptak eller det du sa
                blir lagret, og ingenting sendes noe sted.
            </p>
        </div>
    );
}
