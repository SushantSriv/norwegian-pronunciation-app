import { motion } from 'framer-motion';
import { STAGES, type Stage } from '../data/stages';
import { ITEMS_TO_WIN, MAX_STRIKES } from '../hooks/usePracticeSession';

interface Props {
    bests: Record<string, number>;
    onPick: (stage: Stage) => void;
}

const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
};
const card = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

export function StageSelect({ bests, onPick }: Props) {
    return (
        <motion.div initial="hidden" animate="show" variants={container} className="w-full">
            <motion.header variants={card} className="mb-8 text-center">
                <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                    Norsk uttale
                </h1>
                <p className="mx-auto mt-3 max-w-lg text-sm text-white/70 sm:text-base">
                    Pick your level, then say each phrase out loud. Clear{' '}
                    <strong className="text-white">{ITEMS_TO_WIN}</strong> of them before you run out of{' '}
                    <strong className="text-white">{MAX_STRIKES}</strong> lives — and the bar gets higher as
                    you go.
                </p>
            </motion.header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {STAGES.map(stage => {
                    const best = bests[stage.id] ?? 0;
                    return (
                        <motion.button
                            key={stage.id}
                            variants={card}
                            whileHover={{ y: -6, transition: { duration: 0.18 } }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => onPick(stage)}
                            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900/55 p-5 text-left backdrop-blur-xl transition-colors hover:border-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        >
                            <div
                                className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stage.accent}`}
                                aria-hidden="true"
                            />

                            <div className="flex items-start justify-between gap-3">
                                <span className="text-3xl" aria-hidden="true">
                                    {stage.icon}
                                </span>
                                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-bold text-white/80">
                                    {stage.cefr}
                                </span>
                            </div>

                            <h2 className="mt-3 text-lg font-bold text-white">{stage.name}</h2>
                            <p className="mt-1 text-sm leading-relaxed text-white/65">{stage.blurb}</p>

                            <div className="mt-auto flex items-center justify-between pt-4 text-xs text-white/50">
                                <span>Pass bar starts at {stage.baseThreshold}</span>
                                {best > 0 && (
                                    <span className="font-semibold text-amber-300">
                                        Best {best}/{ITEMS_TO_WIN}
                                    </span>
                                )}
                            </div>
                        </motion.button>
                    );
                })}
            </div>
        </motion.div>
    );
}
