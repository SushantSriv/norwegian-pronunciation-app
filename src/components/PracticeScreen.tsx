import { AnimatePresence, motion } from 'framer-motion';
import { ITEMS_TO_WIN, MAX_STRIKES, type Attempt } from '../hooks/usePracticeSession';
import type { Stage } from '../data/stages';
import { ScoreRing } from './ScoreRing';
import { PhonemeBreakdown } from './PhonemeBreakdown';
import { CompareAudio } from './CompareAudio';
import { MelodyView } from './MelodyView';
import { VoiceVisualizer } from './VoiceVisualizer';
import { VoicePicker } from './VoicePicker';
import { DialectPicker } from './DialectPicker';
import { SpeechTrouble } from './SpeechTrouble';
import type { DialectId } from '../data/dialects';
import type { Pronunciation } from '../utils/pronunciationLexicon';
import { useRecordingAnalysis } from '../hooks/useRecordingAnalysis';
import { useSpokenPhrase } from '../hooks/useSpokenPhrase';

interface Props {
    stage: Stage;
    item: string;
    threshold: number;
    cleared: number;
    strikes: number;
    streak: number;
    listening: boolean;
    interim: string;
    speechError: string | null;
    lastAttempt: Attempt | null;
    recordingUrl: string | null;
    recordingAvailable: boolean;
    analyserRef: React.RefObject<AnalyserNode | null>;
    voices: SpeechSynthesisVoice[];
    activeVoiceURI?: string;
    onChooseVoice: (uri: string) => void;
    rate: number;
    onRateChange: (rate: number) => void;
    dialect: DialectId;
    onDialectChange: (id: DialectId) => void;
    dialectReady: boolean;
    lookup: (word: string) => Pronunciation;
    onListen: () => void;
    onStopListening: () => void;
    onNext: () => void;
    onQuit: () => void;
}

const revealStack = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const revealItem = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 280, damping: 24 } },
};

export function PracticeScreen({
    stage,
    item,
    threshold,
    cleared,
    strikes,
    streak,
    listening,
    interim,
    speechError,
    lastAttempt,
    recordingUrl,
    recordingAvailable,
    analyserRef,
    voices,
    activeVoiceURI,
    onChooseVoice,
    rate,
    onRateChange,
    dialect,
    onDialectChange,
    dialectReady,
    lookup,
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
    const missedWords = lastAttempt?.wordScores.filter(w => w.status !== 'equal') ?? [];
    // One decode of the recording feeds both the melody chart and the trimmed
    // listen-back playback.
    const { analysis, analysing } = useRecordingAnalysis(recordingUrl);
    // Follows the reference voice word by word so the learner can see which
    // part of the phrase is being said.
    const { speak, stop: stopSpeaking, speaking, preparing, speakingIndex } = useSpokenPhrase();

    // Pitch accent is a property of a word, so the melody target is only shown
    // when the item IS one word. A phrase has one accent per word and drawing
    // a single target across all of them would be misleading.
    const attemptWords = lastAttempt ? lastAttempt.expected.trim().split(/\s+/) : [];
    const soleWord = attemptWords.length === 1 ? attemptWords[0] : null;
    const soleWordEntry = soleWord ? lookup(soleWord) : null;

    // Dialect transcription of the whole phrase. Words the lexicon does not
    // carry fall back to the rule engine, which emits no stress marks, so the
    // line stays readable either way.
    const phraseIpa = displayedItem
        .split(/\s+/)
        .map(w => lookup(w).ipa)
        .filter(Boolean)
        .join(' ');

    return (
        <div className="glass w-full overflow-hidden rounded-3xl p-5 sm:p-7">
            {/* ── Status bar ───────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-xl ${stage.accent}`}
                        aria-hidden="true"
                    >
                        {stage.icon}
                    </span>
                    <div>
                        <p className="text-sm font-bold leading-tight text-white">{stage.name}</p>
                        <p className="text-[11px] uppercase tracking-wider text-white/45">{stage.cefr}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <AnimatePresence>
                        {streak >= 2 && (
                            <motion.span
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                                className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400/25 to-orange-500/25 px-2.5 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-300/30"
                            >
                                <motion.span
                                    animate={{ scale: [1, 1.25, 1] }}
                                    transition={{ repeat: Infinity, duration: 1.6 }}
                                    aria-hidden="true"
                                >
                                    🔥
                                </motion.span>
                                {streak}
                            </motion.span>
                        )}
                    </AnimatePresence>

                    <div className="flex items-center gap-1" aria-label={`${livesLeft} lives remaining`}>
                        {Array.from({ length: MAX_STRIKES }).map((_, i) => (
                            <motion.span
                                key={i}
                                animate={
                                    i < livesLeft
                                        ? { scale: 1, opacity: 1, filter: 'grayscale(0)' }
                                        : { scale: 0.8, opacity: 0.3, filter: 'grayscale(1)' }
                                }
                                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                                className="text-lg"
                                aria-hidden="true"
                            >
                                ❤️
                            </motion.span>
                        ))}
                    </div>

                    <button
                        onClick={onQuit}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/60 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                    >
                        End run
                    </button>
                </div>
            </div>

            {/* ── Progress + rising bar ────────────────────────────────── */}
            <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-white/55">
                        Cleared <strong className="text-white">{cleared}</strong>
                        <span className="text-white/35"> / {ITEMS_TO_WIN}</span>
                    </span>
                    <motion.span
                        key={threshold}
                        initial={{ scale: 1.3, color: 'rgb(251 191 36)' }}
                        animate={{ scale: 1, color: 'rgba(255,255,255,0.55)' }}
                        transition={{ duration: 0.6 }}
                        className="font-semibold tabular-nums"
                    >
                        Pass bar {threshold}
                    </motion.span>
                </div>

                <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10 ring-1 ring-inset ring-white/5">
                    <motion.div
                        className={`relative h-full rounded-full bg-gradient-to-r ${stage.accent} ${cleared > 0 ? 'bar-shimmer' : ''}`}
                        // Without an explicit initial the bar paints at its
                        // natural (full) width for a frame before animating.
                        initial={{ width: 0 }}
                        animate={{ width: `${(cleared / ITEMS_TO_WIN) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                    />
                </div>
            </div>

            {/* ── The phrase ───────────────────────────────────────────── */}
            <div className="my-8 text-center">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Say this</p>
                <AnimatePresence mode="wait">
                    <motion.p
                        key={displayedItem}
                        data-testid="phrase"
                        lang="nb"
                        initial="hidden"
                        animate="show"
                        exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.055 } } }}
                        className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-3xl font-bold leading-snug tracking-tight text-white sm:text-4xl"
                    >
                        {displayedItem.split(' ').map((word, i) => (
                            <motion.span
                                key={word + '-' + i}
                                variants={{
                                    hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
                                    show: {
                                        opacity: 1,
                                        y: 0,
                                        filter: 'blur(0px)',
                                        transition: { type: 'spring', stiffness: 320, damping: 24 },
                                    },
                                }}
                                className={
                                    speakingIndex === i
                                        ? 'inline-block rounded-md bg-sky-400/25 px-1 text-sky-100 ring-1 ring-sky-300/40 transition-colors'
                                        : 'inline-block rounded-md px-1 transition-colors'
                                }
                            >
                                {word}
                            </motion.span>
                        ))}
                    </motion.p>
                </AnimatePresence>

                {/* How this phrase sounds in the chosen dialect. Shown for every
                    phrase, not just missed words — otherwise the dialect setting
                    is invisible to anyone pronouncing well. */}
                {phraseIpa && (
                    <motion.p
                        key={dialect + displayedItem}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                        className="mt-3 text-base text-white/45 sm:text-lg"
                        lang="nb"
                        aria-label={'Pronunciation: ' + phraseIpa}
                    >
                        {phraseIpa}
                    </motion.p>
                )}

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() =>
                        speaking
                            ? stopSpeaking()
                            : void speak(displayedItem, { voiceURI: activeVoiceURI, rate })
                    }
                    className={
                        speaking
                            ? 'mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-full border border-sky-300/40 bg-sky-400/20 px-5 py-2 text-sm font-semibold text-sky-100'
                            : 'mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-5 py-2 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/15'
                    }
                >
                    <span aria-hidden="true">{preparing ? '⏳' : speaking ? '⏹' : '🔊'}</span>
                    {preparing ? 'Loading voice…' : speaking ? 'Stop' : 'Hear it'}
                </motion.button>
            </div>

            {/* ── Mic / feedback ───────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {lastAttempt ? (
                    <motion.div
                        key="feedback"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.22 }}
                        role="status"
                        aria-live="polite"
                    >
                        <motion.div variants={revealStack} initial="hidden" animate="show" className="space-y-4">
                            {/* Verdict */}
                            <motion.div
                                variants={revealItem}
                                className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-9"
                            >
                                <div className="relative">
                                    {lastAttempt.passed && (
                                        <span
                                            className="burst absolute inset-0 rounded-full bg-emerald-400/25"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <ScoreRing
                                        score={lastAttempt.score}
                                        threshold={lastAttempt.threshold}
                                        label="score"
                                    />
                                </div>

                                <div className="text-center sm:max-w-[15rem] sm:text-left">
                                    <motion.p
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: 'spring', stiffness: 350, damping: 18, delay: 0.1 }}
                                        className={
                                            lastAttempt.passed
                                                ? 'text-2xl font-extrabold text-emerald-300'
                                                : 'text-2xl font-extrabold text-rose-300'
                                        }
                                    >
                                        {lastAttempt.passed ? 'Cleared!' : 'Not quite'}
                                    </motion.p>
                                    <p className="mt-1 text-sm text-white/55">
                                        Needed {lastAttempt.threshold} · scored{' '}
                                        {lastAttempt.score.toFixed(0)}
                                    </p>
                                    <p className="mt-2 text-sm text-white/45">
                                        I heard:{' '}
                                        <em className="text-white/80">{lastAttempt.heard || 'nothing'}</em>
                                    </p>
                                </div>
                            </motion.div>

                            {/* Per-word chips */}
                            <motion.div variants={revealItem} className="flex flex-wrap justify-center gap-1.5">
                                {lastAttempt.wordScores.map(word => (
                                    <span
                                        key={word.index}
                                        className={
                                            word.status === 'equal'
                                                ? 'inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/20'
                                                : 'inline-flex items-center gap-1 rounded-full bg-rose-400/15 px-2.5 py-1 text-sm font-medium text-rose-200 ring-1 ring-rose-400/20'
                                        }
                                    >
                                        <span aria-hidden="true">{word.status === 'equal' ? '✓' : '✕'}</span>
                                        {word.word}
                                    </span>
                                ))}
                            </motion.div>

                            {/* Listen back + melody sit side by side on wide screens */}
                            <motion.div variants={revealItem} className="grid gap-3 lg:grid-cols-2">
                                <CompareAudio
                                    phrase={lastAttempt.expected}
                                    recordingUrl={recordingUrl}
                                    voiceURI={activeVoiceURI}
                                    rate={rate}
                                    recordingAvailable={recordingAvailable}
                                    bounds={analysis?.bounds ?? null}
                                />
                                <MelodyView
                                    contour={analysis?.contour ?? null}
                                    analysing={analysing}
                                    recordingAvailable={recordingAvailable}
                                    targetAccent={soleWordEntry?.accent}
                                    accentSource={soleWordEntry?.source}
                                />
                            </motion.div>

                            {/* Phoneme help for the words that missed */}
                            {missedWords.length > 0 && (
                                <motion.div variants={revealItem} className="space-y-3">
                                    {missedWords.slice(0, 3).map(word => (
                                        <PhonemeBreakdown
                                            key={word.index}
                                            word={word}
                                            voiceURI={activeVoiceURI}
                                            rate={rate}
                                        />
                                    ))}
                                </motion.div>
                            )}

                            <motion.button
                                variants={revealItem}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onNext}
                                className="min-h-[54px] w-full rounded-2xl bg-white text-lg font-bold text-slate-900 shadow-lg shadow-black/30 transition hover:bg-white/90"
                            >
                                Next →
                            </motion.button>
                        </motion.div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="mic"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col items-center gap-3"
                    >
                        <div className="relative flex h-44 w-44 items-center justify-center">
                            <VoiceVisualizer analyserRef={analyserRef} active={listening} />
                            <motion.button
                                onClick={listening ? onStopListening : onListen}
                                aria-label={listening ? 'Stop listening' : 'Start speaking'}
                                whileHover={{ scale: 1.06 }}
                                whileTap={{ scale: 0.94 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                                className={
                                    listening
                                        ? 'mic-listening relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-4xl text-white shadow-xl shadow-rose-500/40'
                                        : 'mic-idle relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-white to-slate-200 text-4xl text-slate-900 shadow-xl'
                                }
                            >
                                <motion.span
                                    key={listening ? 'stop' : 'mic'}
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                                    aria-hidden="true"
                                >
                                    {listening ? '⏹' : '🎙️'}
                                </motion.span>
                            </motion.button>
                        </div>

                        <div className="min-h-[3rem] text-center" role="status" aria-live="polite">
                            {listening ? (
                                <p className="text-sm text-white/70">
                                    Listening… {interim && <em className="text-white">{interim}</em>}
                                </p>
                            ) : (
                                <p className="text-sm text-white/45">Tap the mic, then say the phrase</p>
                            )}
                            <SpeechTrouble error={speechError} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mt-6 border-t border-white/10 pt-4">
                <DialectPicker dialect={dialect} onChange={onDialectChange} ready={dialectReady} />
                <VoicePicker
                    voices={voices}
                    activeVoiceURI={activeVoiceURI}
                    onChoose={onChooseVoice}
                    rate={rate}
                    onRateChange={onRateChange}
                />
            </div>
        </div>
    );
}
