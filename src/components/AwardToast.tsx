import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PointsAward } from '../utils/learningPoints';
import { KIND_ICON } from '../utils/pointLabels';

interface Props {
    award: PointsAward | null;
    onDone: () => void;
}

/** Long enough to read three lines, short enough not to sit over the next phrase. */
const VISIBLE_MS = 4200;

/**
 * What the last attempt was worth, said out loud.
 *
 * The points are only motivating if the learner can see WHY they got them, at
 * the moment they got them. "+25" on its own is a slot machine; "+10 sterk
 * uttale, +15 mestret kjøkken" is feedback about what they just did well, and
 * it names the thing worth repeating.
 *
 * It never blocks: it sits out of the way of the score ring, dismisses itself,
 * and can be clicked away.
 */
export function AwardToast({ award, onDone }: Props) {
    useEffect(() => {
        if (!award) return;
        const timer = window.setTimeout(onDone, VISIBLE_MS);
        return () => window.clearTimeout(timer);
    }, [award, onDone]);

    return (
        <AnimatePresence>
            {award && award.total > 0 && (
                <motion.div
                    // A11y: announced politely, so a screen reader gets the award
                    // without it interrupting the pronunciation feedback.
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0, y: 24, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                    onClick={onDone}
                    className="pointer-events-auto fixed bottom-5 left-1/2 z-50 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 cursor-pointer rounded-2xl border border-white/15 bg-slate-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur sm:bottom-8"
                >
                    <div className="flex items-baseline gap-2">
                        <motion.span
                            initial={{ scale: 0.5 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.1 }}
                            className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-2xl font-black text-transparent"
                        >
                            +{award.total}
                        </motion.span>
                        <span className="text-sm font-semibold text-white/50">poeng</span>
                    </div>

                    <ul className="mt-2 space-y-1">
                        {award.lines.map((line, index) => (
                            <motion.li
                                key={`${line.kind}-${index}`}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.12 + index * 0.07 }}
                                className="flex items-center gap-2 text-sm text-white/75"
                            >
                                <span aria-hidden="true">{KIND_ICON[line.kind]}</span>
                                <span className="min-w-0 flex-1 truncate">{line.detail}</span>
                                <span className="shrink-0 font-bold tabular-nums text-white">
                                    +{line.points}
                                </span>
                            </motion.li>
                        ))}
                    </ul>

                    {award.capped && (
                        <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-snug text-amber-200/70">
                            Du har nådd dagens poengtak. Øvingen teller fortsatt — poengene starter
                            på nytt i morgen.
                        </p>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
