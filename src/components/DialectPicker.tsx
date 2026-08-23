import { DIALECTS, getDialect, type DialectId } from '../data/dialects';

interface Props {
    dialect: DialectId;
    onChange: (id: DialectId) => void;
    /** False while the dialect's pronunciation data is still downloading. */
    ready: boolean;
}

export function DialectPicker({ dialect, onChange, ready }: Props) {
    const active = getDialect(dialect);

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
                <label
                    htmlFor="dialect"
                    className="text-xs font-semibold uppercase tracking-wide text-white/45"
                >
                    Dialect
                </label>
                <select
                    id="dialect"
                    value={dialect}
                    onChange={e => onChange(e.target.value as DialectId)}
                    className="min-h-[36px] rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1 text-sm text-white"
                >
                    {DIALECTS.map(d => (
                        <option key={d.id} value={d.id}>
                            {d.name} — {d.where}
                        </option>
                    ))}
                </select>
                {!ready && (
                    <span className="text-[11px] text-white/35" role="status">
                        loading…
                    </span>
                )}
            </div>

            <p className="text-[11px] leading-relaxed text-white/35">{active.trait}</p>
        </div>
    );
}
