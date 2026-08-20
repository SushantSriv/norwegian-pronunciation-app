import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useAppStatus } from '../hooks/useAppStatus';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { usePronunciationSession, THRESHOLDS, type Difficulty } from '../hooks/usePronunciationSession';
import { playPronunciation } from '../utils/audioPlayback';
import type { PronunciationResult, WordScore } from '../types/Scoring';
import type { Texts } from '../types/Texts';

import { NameGate } from './NameGate';
import { SessionSummary } from './SessionSummary';
import { SentenceCard } from './SentenceCard';
import { ScorePanel } from './ScorePanel';
import { RecordControls } from './RecordControls';

const OVERLAY_DURATION = 3000;
const FAIL_OVERLAY_DURATION = 1000;
const WORD_ZOOM_MS = 600;

interface Props {
    sentencePools: Record<string, string[]>;
    text: Texts;
    dialects: string[];
    currentDialect: string;
    onDialectChange: (d: string) => void;
}

function AudioRecorder({ sentencePools, text, dialects, currentDialect, onDialectChange }: Props) {
    const [, setStatus] = useAppStatus();
    const session = usePronunciationSession(sentencePools);

    const [result, setResult] = useState<PronunciationResult | null>(null);
    const [feedback, setFeedback] = useState<'success' | 'fail' | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [zoomIndex, setZoomIndex] = useState(-1);
    const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
    const [playbackRate, setPlaybackRate] = useState(1);

    const zoomTimer = useRef<number | null>(null);
    const overlayTimer = useRef<number | null>(null);

    const words = session.expected ? session.expected.split(/\s+/) : [];

    // Reset per-attempt UI state whenever a new sentence comes up.
    useEffect(() => {
        setResult(null);
        setActiveWordIndex(null);
        setFeedback(null);
    }, [session.expected]);

    const handleResult = useCallback(
        (incoming: PronunciationResult) => {
            if (overlayTimer.current !== null) window.clearTimeout(overlayTimer.current);

            setResult(incoming);
            setActiveWordIndex(null);
            const didPass = session.passed(incoming);
            session.recordResult(incoming);

            if (didPass) {
                setStatus('success');
                setFeedback('success');
                setShowConfetti(true);
                overlayTimer.current = window.setTimeout(() => {
                    setShowConfetti(false);
                    setFeedback(null);
                    session.advance();
                }, OVERLAY_DURATION);
            } else {
                const hasFlaggedWord = incoming.word_scores.some(w => w.status !== 'equal');
                setStatus(hasFlaggedWord ? 'partialFail' : 'fail');
                setFeedback('fail');
                overlayTimer.current = window.setTimeout(() => setFeedback(null), FAIL_OVERLAY_DURATION);
            }
        },
        [session, setStatus]
    );

    useEffect(() => {
        return () => {
            if (overlayTimer.current !== null) window.clearTimeout(overlayTimer.current);
            if (zoomTimer.current !== null) window.clearInterval(zoomTimer.current);
        };
    }, []);

    const { recording, processing, countdown, audioURL, startRecording, stopRecording } = useAudioRecorder({
        expected: session.expected,
        onStatusChange: setStatus,
        onResult: handleResult,
    });

    // Zoom each word in turn while recording, as a speaking-pace cue.
    useEffect(() => {
        if (!recording) {
            setZoomIndex(-1);
            if (zoomTimer.current !== null) window.clearInterval(zoomTimer.current);
            return;
        }
        let idx = 0;
        setZoomIndex(0);
        zoomTimer.current = window.setInterval(() => {
            idx += 1;
            if (idx >= words.length) {
                if (zoomTimer.current !== null) window.clearInterval(zoomTimer.current);
            } else {
                setZoomIndex(idx);
            }
        }, WORD_ZOOM_MS);
        return () => {
            if (zoomTimer.current !== null) window.clearInterval(zoomTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recording, session.expected]);

    const handleWordClick = (index: number, word: string, isBad: boolean) => {
        if (isBad) {
            setActiveWordIndex(prev => (prev === index ? null : index));
        } else {
            playPronunciation(currentDialect, word, playbackRate);
        }
    };

    const activeWord: WordScore | null =
        activeWordIndex !== null ? (result?.word_scores.find(w => w.index === activeWordIndex) ?? null) : null;

    if (!session.askedName) {
        return (
            <NameGate
                onSubmit={name => {
                    session.confirmName(name);
                    setStatus('idle');
                }}
            />
        );
    }

    if (session.finished && session.summary) {
        return (
            <SessionSummary
                userName={session.userName}
                summary={session.summary}
                onRestart={() => {
                    session.restart();
                    setStatus('welcome');
                }}
            />
        );
    }

    return (
        <div className="relative rounded-lg bg-white p-4 shadow-lg sm:p-6">
            {showConfetti &&
                Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="confetti" style={{ '--h': Math.random() * 360 } as CSSProperties} />
                ))}

            <AnimatePresence>
                {countdown !== null && (
                    <motion.div
                        key="countdown"
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 text-6xl font-bold"
                    >
                        {countdown === 0 ? text.countdown : countdown}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {feedback && (
                    <motion.div
                        key="feedback"
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="fixed inset-0 z-[999] flex items-center justify-center bg-white/85 px-6 text-center text-2xl"
                    >
                        {feedback === 'success'
                            ? `🎉 ${text.success(String(result?.pronunciation_score.toFixed(0) ?? 0))}`
                            : `😅 ${text.tryAgain}`}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {processing && (
                    <motion.div
                        key="processing"
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-xl font-semibold"
                    >
                        ⏳ Waiting for result …
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                    className="h-full bg-emerald-500 transition-[width] duration-300"
                    style={{ width: `${(session.level / session.levelCount) * 100}%` }}
                />
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-700 sm:text-xl">
                    Hello, {session.userName}! (Level {session.level})
                </h2>
                <button
                    onClick={session.finishSession}
                    className="min-h-[40px] rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                    Finish my exercise
                </button>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-600">Dialect</span>
                    <select
                        value={currentDialect}
                        onChange={e => onDialectChange(e.target.value)}
                        className="min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2"
                    >
                        {dialects.map(d => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-600">Mode</span>
                    <select
                        value={session.difficulty}
                        onChange={e => session.setDifficulty(e.target.value as Difficulty)}
                        className="min-h-[44px] w-full rounded-md border border-slate-300 px-3 py-2"
                    >
                        <option value="Beginner">Beginner (≥{THRESHOLDS.Beginner} pts)</option>
                        <option value="Amateur">Amateur (≥{THRESHOLDS.Amateur} pts)</option>
                        <option value="Professional">Professional (≥{THRESHOLDS.Professional} pts)</option>
                    </select>
                </label>
            </div>

            <RecordControls
                text={text}
                recording={recording}
                processing={processing}
                countingDown={countdown !== null}
                playbackRate={playbackRate}
                onPlaybackRateChange={setPlaybackRate}
                onHearCorrect={() => playPronunciation(currentDialect, session.expected, playbackRate)}
                onToggleRecording={recording ? stopRecording : startRecording}
            />

            <SentenceCard
                label={text.expected}
                expected={session.expected}
                wordScores={result?.word_scores ?? null}
                zoomIndex={zoomIndex}
                activeWordIndex={activeWordIndex}
                onWordClick={handleWordClick}
            />

            {audioURL && (
                <div className="mb-4">
                    <strong className="mb-1 block text-sm text-slate-600">{text.preview}</strong>
                    <audio src={audioURL} controls className="w-full" />
                </div>
            )}

            {result && <ScorePanel result={result} passed={session.passed(result)} text={text} activeWord={activeWord} />}
        </div>
    );
}

export default AudioRecorder;
