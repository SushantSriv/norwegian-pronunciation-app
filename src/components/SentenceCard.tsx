import { motion } from 'framer-motion';
import type { WordScore } from '../types/Scoring';

const wordVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: { scale: 1, opacity: 1 },
    zoom: { scale: [1, 1.6, 1], opacity: [1, 1, 1] },
};

interface Props {
    label: string;
    expected: string;
    wordScores: WordScore[] | null;
    zoomIndex: number;
    activeWordIndex: number | null;
    onWordClick: (index: number, word: string, isBad: boolean) => void;
}

const cleanWord = (w: string) => w.replace(/[?.!]/g, '');

export function SentenceCard({ label, expected, wordScores, zoomIndex, activeWordIndex, onWordClick }: Props) {
    const words = expected ? expected.split(/\s+/) : [];
    const scoreByIndex = new Map((wordScores ?? []).map(w => [w.index, w]));

    return (
        <div className="my-6 w-full max-w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center shadow-sm sm:px-6">
            <div className="mb-2 text-sm font-semibold text-slate-700 sm:text-base">{label}</div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {words.map((w, i) => {
                    const clean = cleanWord(w);
                    const entry = scoreByIndex.get(i);
                    const isBad = !!entry && entry.status !== 'equal';
                    const isGood = !!entry && entry.status === 'equal';
                    const isActive = activeWordIndex === i;

                    return (
                        <motion.span
                            key={i}
                            variants={wordVariants}
                            initial="hidden"
                            animate={i === zoomIndex ? 'zoom' : 'visible'}
                            transition={{ duration: 0.6 }}
                            role="button"
                            tabIndex={0}
                            aria-label={isBad ? `${clean}, mispronounced, show tip` : `${clean}, hear pronunciation`}
                            onClick={() => onWordClick(i, clean, isBad)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') onWordClick(i, clean, isBad);
                            }}
                            className={[
                                'inline-flex cursor-pointer items-center gap-1 rounded px-1 text-xl font-medium sm:text-2xl',
                                isBad
                                    ? 'bg-red-50 font-bold text-red-500 underline decoration-2 underline-offset-2'
                                    : isGood
                                      ? 'text-emerald-600'
                                      : 'text-brand-500',
                                isActive ? 'ring-2 ring-amber-400' : '',
                            ].join(' ')}
                        >
                            {isBad && <span aria-hidden="true">⚠️</span>}
                            {w}
                        </motion.span>
                    );
                })}
            </div>
        </div>
    );
}
