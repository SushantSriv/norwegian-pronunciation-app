import { ACCENT_LABEL, ACCENT_SHAPE } from '../data/tonelag';
import { getPhonemeHint } from '../utils/pronunciationHints';
import { accuracy, weaknesses, type Profile, type SkillRecord } from '../utils/learningProfile';

interface Props {
    profile: Profile;
}

/** A skill worth showing, with the label a learner will recognise. */
interface Row {
    label: string;
    detail?: string;
    record: SkillRecord;
    rate: number;
}

const BAR_COLOUR = (rate: number) =>
    rate >= 0.85 ? 'bg-emerald-400' : rate >= 0.6 ? 'bg-amber-400' : 'bg-rose-400';

function rowsFor(profile: Profile): Row[] {
    const rows: Row[] = [];

    for (const [accent, record] of Object.entries(profile.accents)) {
        const rate = accuracy(record);
        if (rate === null) continue;
        const key = accent as keyof typeof ACCENT_LABEL;
        rows.push({
            label: ACCENT_LABEL[key] ?? accent,
            detail: ACCENT_SHAPE[key],
            record,
            rate,
        });
    }

    // The sounds with the most evidence behind them, worst first — a long tail
    // of once-tried phonemes is noise, not a profile.
    const phonemes = Object.entries(profile.phonemes)
        .map(([symbol, record]) => ({ symbol, record, rate: accuracy(record, 5) }))
        .filter((row): row is { symbol: string; record: SkillRecord; rate: number } => row.rate !== null)
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 6);

    for (const { symbol, record, rate } of phonemes) {
        rows.push({
            label: `/${symbol}/`,
            detail: getPhonemeHint(symbol),
            record,
            rate,
        });
    }

    const compound = accuracy(profile.compounds);
    if (compound !== null) {
        rows.push({ label: 'Compound words', record: profile.compounds, rate: compound });
    }

    return rows;
}

/**
 * What this learner, specifically, finds hard.
 *
 * Built entirely from their own attempts — which sounds keep coming out wrong,
 * which accent is not landing — and held in this browser. There is no account
 * behind it and nothing is uploaded; clearing site data erases it completely.
 */
export function ProfilePanel({ profile }: Props) {
    const rows = rowsFor(profile);
    const worst = weaknesses(profile)[0];

    if (!rows.length) {
        return (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Your Norwegian
                </p>
                <p className="mt-2">
                    Practise a few more phrases and this will show which sounds and which tonelag you
                    find hardest. It is worked out from your own attempts and stays in this browser.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/45">
                Your Norwegian
            </p>

            {worst && (
                <p className="mt-2 text-sm text-white/75">
                    Your weakest point right now is{' '}
                    <strong className="text-white">
                        {worst.kind === 'accent'
                            ? (ACCENT_LABEL[worst.key as keyof typeof ACCENT_LABEL] ?? worst.key)
                            : worst.kind === 'compound'
                              ? 'compound words'
                              : `/${worst.key}/`}
                    </strong>
                    , at {Math.round(worst.accuracy * 100)}% over {worst.attempts} attempts.
                </p>
            )}

            <ul className="mt-3 space-y-2">
                {rows.map(row => (
                    <li key={row.label}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="text-white/85">
                                {row.label}
                                {row.detail && (
                                    <span className="ml-2 text-xs text-white/35">{row.detail}</span>
                                )}
                            </span>
                            <span className="shrink-0 tabular-nums text-white/60">
                                {Math.round(row.rate * 100)}%
                            </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                                className={`h-full rounded-full ${BAR_COLOUR(row.rate)}`}
                                style={{ width: `${Math.round(row.rate * 100)}%` }}
                            />
                        </div>
                    </li>
                ))}
            </ul>

            <p className="mt-3 text-[11px] leading-relaxed text-white/35">
                Worked out from your own attempts and stored only in this browser. No account, no
                upload; clearing site data erases it.
            </p>
        </div>
    );
}
