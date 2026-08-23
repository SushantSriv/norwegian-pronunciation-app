import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Parallax } from './components/Parallax';
import { StageSelect } from './components/StageSelect';
import { PracticeScreen } from './components/PracticeScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { usePracticeSession } from './hooks/usePracticeSession';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useNorwegianVoices } from './hooks/useNorwegianVoices';

/** Shown instead of the app in browsers without the Web Speech API. */
function UnsupportedNotice() {
    return (
        <div className="glass w-full max-w-md rounded-3xl p-7 text-center">
            <div className="text-4xl" aria-hidden="true">
                🎙️
            </div>
            <h1 className="mt-3 text-xl font-bold text-white">This browser cannot listen</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
                The app scores your pronunciation with the browser Web Speech API, which is only available in{' '}
                <strong className="text-white">Chrome</strong> and <strong className="text-white">Edge</strong>.
                Open this page in one of those to practise.
            </p>
        </div>
    );
}

export default function App() {
    const {
        stage,
        currentItem,
        threshold,
        cleared,
        strikes,
        streak,
        outcome,
        lastAttempt,
        summary,
        bests,
        begin,
        submit,
        next,
        quit,
    } = usePracticeSession();

    const [showConfetti, setShowConfetti] = useState(false);

    const handleResult = useCallback((transcript: string) => submit(transcript), [submit]);
    const {
        supported,
        listening,
        interim,
        error,
        recordingUrl,
        recordingAvailable,
        analyserRef,
        start,
        stop,
    } = useSpeechRecognition({
        onResult: handleResult,
    });
    const { voices, activeVoiceURI, chooseVoice, rate, setRate } = useNorwegianVoices();

    // Celebrate a cleared stage.
    useEffect(() => {
        if (outcome !== 'completed') return;
        setShowConfetti(true);
        const timer = window.setTimeout(() => setShowConfetti(false), 3000);
        return () => window.clearTimeout(timer);
    }, [outcome]);

    const showResults = stage !== null && outcome !== null && summary !== null;
    const showPractice = stage !== null && outcome === null;

    return (
        <>
            <div id="parallax">
                <Parallax />
            </div>
            <div className="aurora" aria-hidden="true" />

            {showConfetti &&
                Array.from({ length: 60 }).map((_, i) => (
                    <div
                        key={i}
                        className="confetti"
                        style={
                            {
                                '--h': Math.random() * 360,
                                left: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 0.6}s`,
                            } as CSSProperties
                        }
                    />
                ))}

            <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-8 sm:py-12">
                <div className="w-full max-w-3xl">
                    {!supported ? (
                        <div className="flex justify-center">
                            <UnsupportedNotice />
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            {showResults ? (
                                <motion.div key="results" exit={{ opacity: 0, y: -12 }}>
                                    <ResultsScreen
                                        stage={stage}
                                        outcome={outcome}
                                        summary={summary}
                                        onRetry={() => begin(stage)}
                                        onChangeStage={quit}
                                    />
                                </motion.div>
                            ) : showPractice ? (
                                <motion.div key="practice" exit={{ opacity: 0, y: -12 }}>
                                    <PracticeScreen
                                        stage={stage}
                                        item={currentItem}
                                        threshold={threshold}
                                        cleared={cleared}
                                        strikes={strikes}
                                        streak={streak}
                                        listening={listening}
                                        interim={interim}
                                        speechError={error}
                                        lastAttempt={lastAttempt}
                                        recordingUrl={recordingUrl}
                                        recordingAvailable={recordingAvailable}
                                        analyserRef={analyserRef}
                                        voices={voices}
                                        activeVoiceURI={activeVoiceURI}
                                        onChooseVoice={chooseVoice}
                                        rate={rate}
                                        onRateChange={setRate}
                                        onListen={start}
                                        onStopListening={stop}
                                        onNext={next}
                                        onQuit={quit}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div key="stages" exit={{ opacity: 0, y: -12 }}>
                                    <StageSelect bests={bests} onPick={begin} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}
                </div>
            </div>
        </>
    );
}
