import { getAdvice } from '../utils/pronunciationHints';

interface Summary {
    avgScore: number;
    total: number;
    goodCount: number;
    missedWords: string[];
}

interface Props {
    userName: string;
    summary: Summary;
    onRestart: () => void;
}

export function SessionSummary({ userName, summary, onRestart }: Props) {
    return (
        <div className="mx-auto my-8 max-w-xl rounded-xl bg-white p-6 shadow-lg sm:p-8">
            <h2 className="mb-4 text-2xl font-bold text-slate-800">
                👏 Great job, <span className="text-brand-600">{userName}</span>!
            </h2>
            <p className="mb-1 text-slate-700">
                You completed <strong>{summary.total}</strong> sentences.
            </p>
            <p className="mb-1 text-emerald-700">
                ✅ <strong>{summary.goodCount}</strong> correct pronunciations.
            </p>
            <p className="mb-1 text-red-700">
                ❌ Missed: {summary.missedWords.length > 0 ? summary.missedWords.join(', ') : 'None!'}
            </p>
            <p className="mb-4 text-slate-700">
                📊 Average score: <strong>{summary.avgScore.toFixed(0)}/100</strong>
            </p>

            {summary.missedWords.length > 0 && (
                <>
                    <h3 className="mt-6 mb-2 text-lg font-semibold text-slate-800">🔁 Next steps</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                        {summary.missedWords.map(w => (
                            <li key={w}>
                                <strong>{w}</strong>: {getAdvice(w) || 'Keep practicing.'}
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <button
                onClick={onRestart}
                className="mt-8 min-h-[44px] rounded-md bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
            >
                🔄 Start Over
            </button>
        </div>
    );
}
