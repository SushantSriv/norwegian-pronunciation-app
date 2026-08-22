import { motion } from 'framer-motion';
import type { Outcome } from '../hooks/usePracticeSession';
import { ITEMS_TO_WIN } from '../hooks/usePracticeSession';
import type { Stage } from '../data/stages';
import { getAdvice } from '../utils/pronunciationHints';
import { ScoreRing } from './ScoreRing';

interface Summary {
    avgScore: number;
    attempts: number;
    cleared: number;
    missedWords: { word: string; count: number }[];
}

interface Props {
    stage: Stage;
    outcome: Outcome;
    summary: Summary;
    onRetry: () => void;
    onChangeStage: () => void;
}

export function ResultsScreen({ stage, outcome, summary, onRetry, onChangeStage }: Props) {
    const won = outcome === 'completed';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            className="w-full rounded-2xl border border-white/15 bg-slate-900/55 p-6 text-center backdrop-blur-xl sm:p-8"
        >
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 16 }}
                className="text-5xl"
                aria-hidden="true"
            >
                {won ? '🏆' : '💪'}
            </motion.div>

            <h2 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">
                {won ? 'Stage cleared!' : 'Out of lives'}
            </h2>
            <p className="mt-2 text-sm text-white/65">
                {won
                    ? `You cleared all ${ITEMS_TO_WIN} phrases in ${stage.name}.`
                    : `You cleared ${summary.cleared} of ${ITEMS_TO_WIN} in ${stage.name}. Close — go again.`}
            </p>

            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
                <ScoreRing score={summary.avgScore} threshold={stage.baseThreshold} label="avg score" />

                <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-left">
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-white/45">Cleared</dt>
                        <dd className="text-xl font-bold text-white">
                            {summary.cleared}
                            <span className="text-sm font-normal text-white/40">/{ITEMS_TO_WIN}</span>
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-white/45">Attempts</dt>
                        <dd className="text-xl font-bold text-white">{summary.attempts}</dd>
                    </div>
                </dl>
            </div>

            {summary.missedWords.length > 0 && (
                <div className="mt-7 text-left">
                    <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-white/60">
                        Words to drill
                    </h3>
                    <ul className="space-y-2">
                        {summary.missedWords.slice(0, 6).map(({ word, count }) => (
                            <li
                                key={word}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                            >
                                <span className="font-semibold text-white">{word}</span>
                                {count > 1 && <span className="ml-1 text-xs text-white/40">×{count}</span>}
                                <span className="block text-white/60">
                                    {getAdvice(word) ?? 'Say it slowly, then speed up once it feels natural.'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                    onClick={onRetry}
                    className="min-h-[48px] flex-1 rounded-xl bg-white text-base font-bold text-slate-900 transition hover:bg-white/90"
                >
                    Try again
                </button>
                <button
                    onClick={onChangeStage}
                    className="min-h-[48px] flex-1 rounded-xl border border-white/25 text-base font-semibold text-white transition hover:bg-white/10"
                >
                    Pick another level
                </button>
            </div>
        </motion.div>
    );
}
