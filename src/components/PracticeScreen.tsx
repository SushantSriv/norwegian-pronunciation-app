import { AnimatePresence, motion } from 'framer-motion';
import { ITEMS_TO_WIN, MAX_STRIKES, type Attempt } from '../hooks/usePracticeSession';
import type { Stage } from '../data/stages';
import { speakNorwegian } from '../utils/audioPlayback';
import { ScoreRing } from './ScoreRing';
import { PhonemeBreakdown } from './PhonemeBreakdown';

interface Props {
    stage: Stage;
    item: string;
    threshold: number;
    cleared: number;
    strikes: number;
    listening: boolean;
    interim: string;
    speechError: string | null;
    lastAttempt: Attempt | null;
    onListen: () => void;
    onStopListening: () => void;
    onNext: () => void;
    onQuit: () => void;
}

export function PracticeScreen({
    stage,
    item,
    threshold,
    cleared,
    strikes,
    listening,
    interim,
    speechError,
    lastAttempt,
    onListen,
    onStopListening,
    onNext,
    onQuit,
}: Props) {
    const livesLeft = MAX_STRIKES - strikes;
    // The session advances to the next item as soon as an attempt is graded, so
    // while feedback is up we must keep showing the phrase that was attempted —
    // otherwise the word-by-word breakdown belongs to a different sentence.
    const displayedItem = lastAttempt ? lastAttempt.expected : item;

    return (
        <div className="w-full rounded-2xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl sm:p-7">
            {/* ── Status bar ───────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden="true">
                        {stage.icon}
                    </span>
                    <div>
                        <p className="text-sm font-bold leading-tight text-white">{stage.name}</p>
                        <p className="text-xs text-white/50">{stage.cefr}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1" aria-label={`${livesLeft} lives remaining`}>
                        {Array.from({ length: MAX_STRIKES }).map((_, i) => (
                            <motion.span
                                key={i}
                                animate={i < livesLeft ? { scale: 1, opacity: 1 } : { scale: 0.75, opacity: 0.25 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                                className="text-lg"
                                aria-hidden="true"
                            >
                                {i < livesLeft ? '❤️' : '🖤'}
                            </motion.span>
                        ))}
                    </div>
                    <button
                        onClick={onQuit}
                        className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                    >
                        End run
                    </button>
                </div>
            </div>

            {/* ── Progress + rising bar ────────────────────────────────── */}
            <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-white/60">
                        Cleared <strong className="text-white">{cleared}</strong> / {ITEMS_TO_WIN}
                    </span>
                    <motion.span
                        key={threshold}
                        initial={{ scale: 1.25 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="font-semibold tabular-nums text-white/60"
                    >
                        Pass bar: {threshold}
                    </motion.span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/15">
                    <motion.div
                        className={`h-full rounded-full bg-gradient-to-r ${stage.accent}`}
                        // Without an explicit initial the bar paints at its
                        // natural (full) width for a frame before animating.
                        initial={{ width: 0 }}
                        animate={{ width: `${(cleared / ITEMS_TO_WIN) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                    />
                </div>
            </div>

            {/* ── The phrase ───────────────────────────────────────────── */}
            <div className="my-7 text-center">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Say this</p>
                <AnimatePresence mode="wait">
                    <motion.p
                        key={displayedItem}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.28 }}
                        className="text-2xl font-bold leading-snug text-white sm:text-3xl"
                    >
                        {displayedItem}
                    </motion.p>
                </AnimatePresence>

                <button
                    onClick={() => speakNorwegian(displayedItem)}
                    className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/20"
                >
                    <span aria-hidden="true">🔊</span> Hear it
                </button>
            </div>

            {/* ── Mic / feedback ───────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {lastAttempt ? (
                    <motion.div
                        key="feedback"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-4"
                        role="status"
                        aria-live="polite"
                    >
                        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
                            <ScoreRing score={lastAttempt.score} threshold={lastAttempt.threshold} label="score" />
                            <div className="text-center sm:text-left">
                                <p
                                    className={
                                        lastAttempt.passed
                                            ? 'text-xl font-extrabold text-emerald-300'
                                            : 'text-xl font-extrabold text-rose-300'
                                    }
                                >
                                    {lastAttempt.passed ? 'Cleared!' : 'Not quite'}
                                </p>
                                <p className="mt-1 text-sm text-white/60">
                                    Needed {lastAttempt.threshold} · you scored {lastAttempt.score.toFixed(0)}
                                </p>
                                <p className="mt-2 max-w-xs text-sm text-white/50">
                                    I heard: <em className="text-white/75">{lastAttempt.heard || 'nothing'}</em>
                                </p>
                            </div>
                        </div>

                        {/* Per-word chips */}
                        <div className="flex flex-wrap justify-center gap-2">
                            {lastAttempt.wordScores.map(word => (
                                <span
                                    key={word.index}
                                    className={
                                        word.status === 'equal'
                                            ? 'inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-sm font-medium text-emerald-200'
                                            : 'inline-flex items-center gap-1 rounded-full bg-rose-400/15 px-2.5 py-1 text-sm font-medium text-rose-200'
                                    }
                                >
                                    <span aria-hidden="true">{word.status === 'equal' ? '✓' : '✕'}</span>
                                    {word.word}
                                </span>
                            ))}
                        </div>

                        {/* Phoneme help for the words that missed */}
                        <div className="space-y-3">
                            {lastAttempt.wordScores
                                .filter(w => w.status !== 'equal')
                                .slice(0, 3)
                                .map(word => (
                                    <PhonemeBreakdown key={word.index} word={word} />
                                ))}
                        </div>

                        <button
                            onClick={onNext}
                            className="min-h-[52px] w-full rounded-xl bg-white text-lg font-bold text-slate-900 transition hover:bg-white/90"
                        >
                            Next →
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="mic"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center gap-4"
                    >
                        <button
                            onClick={listening ? onStopListening : onListen}
                            aria-label={listening ? 'Stop listening' : 'Start speaking'}
                            className={
                                listening
                                    ? 'mic-listening flex h-24 w-24 items-center justify-center rounded-full bg-rose-500 text-4xl text-white transition'
                                    : 'flex h-24 w-24 items-center justify-center rounded-full bg-white text-4xl text-slate-900 transition hover:scale-105'
                            }
                        >
                            <span aria-hidden="true">{listening ? '⏹' : '🎙️'}</span>
                        </button>

                        <div className="min-h-[3rem] text-center" role="status" aria-live="polite">
                            {listening ? (
                                <p className="text-sm text-white/70">
                                    Listening… {interim && <em className="text-white">{interim}</em>}
                                </p>
                            ) : (
                                <p className="text-sm text-white/50">Tap the mic, then say the phrase</p>
                            )}
                            {speechError && <p className="mt-1 text-sm text-amber-300">{speechError}</p>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
