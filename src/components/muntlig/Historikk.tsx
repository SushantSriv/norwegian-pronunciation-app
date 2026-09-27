import { useState } from 'react';
import { previousAt, type ExamRun } from '../../utils/examHistory';
import { dayKey, daysBetween } from '../../utils/period';
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
 * Consecutive days with at least one rehearsal, counting back from the latest.
 *
 * From the dates already stored, so nothing new is kept. It is the only number
 * in this mode that rewards coming back rather than performing, which is the
 * only thing about a rehearsal worth rewarding: the app cannot tell you whether
 * today's went better, and says so, but it can tell you that you turned up.
 */
function streak(history: ExamRun[]): number {
    if (!history.length) return 0;
    const days = [...new Set(history.map(run => dayKey(new Date(run.at).getTime())))].sort().reverse();
    let count = 1;
    for (let i = 1; i < days.length; i++) {
        if (daysBetween(days[i], days[i - 1]) !== 1) break;
        count++;
    }
    return count;
}

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
    /**
     * Deleting asks twice.
     *
     * It was a fifteen-pixel link at the top of a card, next to nothing else
     * tappable, and one tap ended every run the learner had recorded. A
     * confirmation is not ceremony here: the data cannot be recovered, because
     * it was never anywhere but this browser.
     */
    const [confirming, setConfirming] = useState(false);
    const atLevel = history.filter(run => run.nivaa === nivaa);
    if (atLevel.length === 0) return null;

    const latest = atLevel[0];
    const before = previousAt(history, nivaa);
    const days = streak(history);

    return (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">
                    Dine tidligere {nivaa}-prøver
                </h2>
                <button
                    onClick={() => {
                        if (confirming) onForget();
                        else setConfirming(true);
                    }}
                    onBlur={() => setConfirming(false)}
                    className={[
                        '-my-2 min-h-[44px] shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold underline underline-offset-2 transition',
                        confirming
                            ? 'text-amber-300 hover:text-amber-200'
                            : 'text-white/60 hover:text-white',
                    ].join(' ')}
                >
                    {confirming ? 'Trykk igjen for å slette' : 'Slett historikken'}
                </button>
            </div>

            {!before && (
                <p className="mt-2 text-[12px] leading-relaxed text-white/50">
                    Lagret. Kom tilbake i morgen og kjør {nivaa} igjen — da har appen noe å
                    sammenligne med, og det er den eneste sammenligningen den gjør.
                </p>
            )}

            {days > 1 && (
                <p className="mt-2 text-[12px] font-semibold text-amber-200/80">
                    🔥 {days} dager på rad
                </p>
            )}

            {before && latest.pauses !== null && before.pauses !== null && (
                <p className="mt-2 text-[12px] leading-relaxed text-white/50">
                    Forrige gang ({date(before.at)}): {nb(before.pauses)} pauser. I dag:{' '}
                    {nb(latest.pauses)}.{' '}
                    {latest.pauses === before.pauses
                        ? 'Like mange. Det betyr ikke at ingenting har endret seg — appen teller bare stillhet.'
                        : 'Appen vet hvilket tall som flyttet seg, ikke om det er bra — færre pauser kan være at du har slappet av, eller at du har sluttet å tenke deg om.'}
                </p>
            )}

            {atLevel.length > 1 && (
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
            )}

            <p className="mt-3 text-[11px] leading-relaxed text-white/30">
                Bare tallene over lagres, og bare i denne nettleseren. Verken opptak eller det du sa
                blir lagret, og ingenting sendes noe sted.
            </p>
        </div>
    );
}
