import { useState } from 'react';
import { motion } from 'framer-motion';
import { AboutDialog } from './AboutDialog';
import { stagesInTrack, WEAKNESS_STAGE, type Stage, type Track } from '../data/stages';
import { ITEMS_TO_WIN, MAX_STRIKES } from '../hooks/usePracticeSession';

interface Props {
    bests: Record<string, number>;
    /**
     * Whether the adaptive drill has anything to drill. It stays hidden until
     * the learner's record names a weakness, because a drill for a problem you
     * may not have is worse than no drill.
     */
    canDrillWeaknesses: boolean;
    onPick: (stage: Stage) => void;
}

const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const card = {
    hidden: { opacity: 0, y: 34, scale: 0.95 },
    show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: 'spring' as const, stiffness: 270, damping: 24 },
    },
};

/** The picker is split so workplace language is findable, not buried. */
const SECTIONS: { track: Track; title: string; subtitle: string }[] = [
    { track: 'weakness', title: 'For deg', subtitle: 'built from your own attempts' },
    { track: 'general', title: 'Generelt', subtitle: 'everyday Norwegian, A1 to B2' },
    { track: 'occupation', title: 'Yrkesnorsk', subtitle: 'language for your line of work' },
];

const sectionStagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
    hidden: { opacity: 0, y: -18 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 200, damping: 22 } },
};

export function StageSelect({ bests, canDrillWeaknesses, onPick }: Props) {
    const stagesFor = (track: Track): Stage[] =>
        track === 'weakness'
            ? canDrillWeaknesses
                ? [WEAKNESS_STAGE]
                : []
            : stagesInTrack(track);

    const [aboutOpen, setAboutOpen] = useState(false);
    return (
        <motion.div initial="hidden" animate="show" variants={container} className="w-full">
            <motion.header variants={fadeUp} className="mb-10 text-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-xs font-semibold text-white/70 backdrop-blur"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    Live pronunciation scoring
                </motion.div>

                <motion.h1
                    className="bg-gradient-to-b from-white via-white to-sky-200/70 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow-[0_2px_20px_rgba(56,189,248,0.25)] sm:text-6xl"
                    initial={{ letterSpacing: '0.16em', opacity: 0, y: 10 }}
                    animate={{ letterSpacing: '-0.03em', opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                >
                    Norsk uttale
                </motion.h1>

                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
                    Pick a level and say each phrase out loud. Clear{' '}
                    <strong className="font-semibold text-white">{ITEMS_TO_WIN}</strong> before you lose{' '}
                    <strong className="font-semibold text-white">{MAX_STRIKES}</strong> lives — and the bar
                    climbs with every one you get right.
                </p>
            </motion.header>

            {SECTIONS.filter(section => stagesFor(section.track).length > 0).map(section => (
                <motion.section
                    key={section.track}
                    variants={sectionStagger}
                    className="mb-9 last:mb-0"
                >
                    <motion.div variants={card} className="mb-3 flex items-baseline gap-3">
                        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-white/70">
                            {section.title}
                        </h2>
                        <span className="text-xs text-white/35">{section.subtitle}</span>
                    </motion.div>

                    <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {stagesFor(section.track).map(stage => {
                            const best = bests[stage.id] ?? 0;
                            const mastered = best >= ITEMS_TO_WIN;

                            return (
                        <motion.button
                            key={stage.id}
                            variants={card}
                            whileHover={{ y: -8 }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            onClick={() => onPick(stage)}
                            className="glass group relative flex h-full flex-col overflow-hidden rounded-2xl p-5 text-left transition-[border-color,box-shadow] duration-300 hover:border-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                        >
                            {/* Accent rail + hover wash */}
                            <div
                                className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${stage.accent}`}
                                aria-hidden="true"
                            />
                            <div
                                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${stage.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.13]`}
                                aria-hidden="true"
                            />
                            {/* Corner glow that blooms on hover */}
                            <div
                                className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${stage.accent} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-40`}
                                aria-hidden="true"
                            />

                            <div className="relative flex items-start justify-between gap-3">
                                <motion.span
                                    className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-lg ${stage.accent}`}
                                    aria-hidden="true"
                                    whileHover={{ rotate: [0, -10, 8, 0], scale: 1.12 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    {stage.icon}
                                </motion.span>
                                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white/75">
                                    {stage.cefr}
                                </span>
                            </div>

                            <h2 className="relative mt-4 text-lg font-bold text-white">{stage.name}</h2>
                            <p className="relative mt-1.5 text-sm leading-relaxed text-white/55">
                                {stage.blurb}
                            </p>

                            <div className="relative mt-auto flex items-center justify-between gap-2 pt-5 text-xs">
                                <span className="text-white/40">Bar starts at {stage.baseThreshold}</span>
                                {best > 0 && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{
                                            type: 'spring',
                                            stiffness: 400,
                                            damping: 14,
                                            delay: 0.35,
                                        }}
                                        className={
                                            mastered
                                                ? 'shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 font-bold text-amber-200 ring-1 ring-amber-300/30'
                                                : 'shrink-0 font-semibold text-white/60'
                                        }
                                    >
                                        {mastered ? '★ Mastered' : `Best ${best}/${ITEMS_TO_WIN}`}
                                    </motion.span>
                                )}
                            </div>
                                </motion.button>
                            );
                        })}
                    </div>
                </motion.section>
            ))}

            <motion.div variants={card} className="mt-9 space-y-1.5 text-center text-xs text-white/30">
                <p>Chrome, Edge &amp; Safari · free · no account</p>
                <p>
                    <button
                        onClick={() => setAboutOpen(true)}
                        className="underline decoration-white/25 underline-offset-2 transition hover:text-white/60"
                    >
                        About this app &amp; how to use it
                    </button>
                </p>
                <p>
                    <a
                        href="https://github.com/SushantSriv/norwegian-pronunciation-app/issues/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-white/25 underline-offset-2 transition hover:text-white/60"
                    >
                        Something wrong? Tell me
                    </a>
                </p>
            </motion.div>

            <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
        </motion.div>
    );
}
