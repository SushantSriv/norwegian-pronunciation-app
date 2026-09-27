import type { CriteriaReport } from '../../utils/criteriaReport';

interface Props {
    report: CriteriaReport;
}

/**
 * The four criteria, laid out the way the vurderingsskjema lays them out.
 *
 * THIS CARD IS MOSTLY EMPTY ON PURPOSE. Three of the four rows are struck
 * through, because three of the four cannot be measured honestly from a free
 * answer, and the Resultat box at the bottom is shown disabled rather than left
 * out. A card with one row filled in would read as "the app checked one thing";
 * a card with the exam's own four rows and three of them crossed out reads as
 * what it is — most of this exam is not something an app can do.
 *
 * The struck-through rows are the point of the card, not an apology for it.
 */
export function Vurderingskort({ report }: Props) {
    return (
        <div className="mt-5 overflow-hidden rounded-xl border border-white/12 bg-white/[0.03]">
            <div className="border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">
                    Vurderingskriteriene
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-white/40">
                    De fire prøven vurderer. Du må være på nivået på alle fire for å bli plassert
                    der — det finnes ingen utregning som slår dem sammen.
                </p>
            </div>

            <ul className="divide-y divide-white/[0.07]">
                {report.rows.map(row => {
                    const measured = row.finding !== null;
                    return (
                        <li key={row.kriterium} className="px-4 py-3.5">
                            <div className="flex items-baseline gap-2.5">
                                <span
                                    className={[
                                        'text-sm font-bold',
                                        measured ? 'text-white' : 'text-white/35 line-through',
                                    ].join(' ')}
                                >
                                    {row.label}
                                </span>
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/30">
                                    {measured ? 'observert' : 'ikke målt her'}
                                </span>
                            </div>

                            <p className="mt-1 text-[12px] leading-relaxed text-white/40">
                                Prøven ser på: {row.provenSerPaa}
                            </p>

                            {row.finding && (
                                <p className="mt-2 text-sm leading-relaxed text-white/80">
                                    {row.finding}
                                </p>
                            )}
                            {row.footnote && (
                                <p className="mt-1.5 border-l-2 border-white/15 pl-2.5 text-[12px] leading-relaxed text-white/45">
                                    {row.footnote}
                                </p>
                            )}
                            {row.whyNot && (
                                <p className="mt-2 text-[12px] leading-relaxed text-white/50">
                                    {row.whyNot}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>

            {/*
              The result field, shown and unfillable.
              Leaving it out would be the kinder-looking choice and the worse
              one: a candidate who never sees the box does not learn that this
              is the box that decides, and that a person fills it in.
            */}
            <div className="border-t border-white/10 bg-white/[0.02] px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-white/45">Resultat</span>
                    <span
                        aria-disabled="true"
                        className="cursor-not-allowed select-none rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-sm text-white/25"
                    >
                        fylles ut av sensor
                    </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/35">
                    På prøven settes nivået av en eksaminator og en sensor som har hørt hele
                    samtalen. Appen har verken hørt samtaleoppgaven eller de tre kriteriene over, og
                    fyller derfor ikke ut noe her.
                </p>
            </div>
        </div>
    );
}
