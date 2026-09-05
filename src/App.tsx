import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { Parallax } from './components/Parallax';
import { StageSelect } from './components/StageSelect';
import { PracticeScreen } from './components/PracticeScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { CommunityScreen } from './components/CommunityScreen';
import { AwardToast } from './components/AwardToast';
import { usePracticeSession } from './hooks/usePracticeSession';
import { useVoiceInput } from './hooks/useVoiceInput';
import { useNorwegianVoices } from './hooks/useNorwegianVoices';
import { useDialect } from './hooks/useDialect';
import { useLearningProfile } from './hooks/useLearningProfile';
import { useCommunity } from './hooks/useCommunity';
import { weaknesses, type AttemptRecord } from './utils/learningProfile';
import { countVisit } from './utils/analytics';
import type { Recognition } from './utils/asr';

/**
 * Shown instead of the app when the device cannot run recognition at all.
 *
 * This is now a much rarer screen than it was. Recognition used to need the
 * Web Speech API, which ruled out Firefox and most of iOS; it now needs a
 * microphone, WebAssembly and web workers, which is close to every browser
 * still in use.
 */
function UnsupportedNotice() {
    return (
        <div className="glass w-full max-w-md rounded-3xl p-7 text-center">
            <div className="text-4xl" aria-hidden="true">
                🎙️
            </div>
            <h1 className="mt-3 text-xl font-bold text-white">This browser cannot listen</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
                Practising needs a microphone, WebAssembly and web workers, and this browser is missing
                one of them. A current <strong className="text-white">Firefox</strong>,{' '}
                <strong className="text-white">Chrome</strong>, <strong className="text-white">Edge</strong>{' '}
                or <strong className="text-white">Safari</strong> will work.
            </p>
        </div>
    );
}

export default function App() {
    const { dialect, setDialect, ready: dialectReady, toIpa, lookup } = useDialect();
    const { profile, remember } = useLearningProfile();

    const community = useCommunity();

    const {
        stage,
        runId,
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
    } = usePracticeSession(toIpa, profile, word => lookup(word).accent);

    const [showConfetti, setShowConfetti] = useState(false);
    const [showCommunity, setShowCommunity] = useState(false);

    /**
     * Price the attempt, then remember it.
     *
     * The order is the point. Mastery and personal bests are both questions
     * about what CHANGED, so the points engine has to see the profile as it was
     * before this attempt was folded into it. Both sides de-duplicate on the
     * attempt object, so both see the same "before" and each pays once.
     */
    const { award, finishRun } = community;
    const handleRemember = useCallback(
        (attempt: object | null, record: AttemptRecord, ready: boolean) => {
            if (attempt && lastAttempt && stage && runId) {
                award(
                    attempt,
                    {
                        score: lastAttempt.score,
                        threshold: lastAttempt.threshold,
                        passed: lastAttempt.passed,
                        counts: lastAttempt.verdict.counts,
                        phrase: lastAttempt.expected,
                        wordScores: lastAttempt.wordScores,
                        cefr: stage.cefr,
                        profile,
                    },
                    ready,
                    runId
                );
            }
            remember(attempt, record, ready);
        },
        [award, remember, lastAttempt, stage, runId, profile]
    );

    // A run that reached its end is worth something on its own, whichever way
    // it ended. finishRun pays once per run id.
    useEffect(() => {
        if (!outcome || !stage || !runId || !summary) return;
        finishRun(runId, {
            completed: outcome === 'completed',
            cleared: summary.cleared,
            cefr: stage.cefr,
        });
    }, [outcome, stage, runId, summary, finishRun]);

    const handleResult = useCallback(
        (recognition: Recognition) => submit(recognition),
        [submit]
    );
    const {
        supported,
        listening,
        transcribing,
        error,
        recordingUrl,
        recordingAvailable,
        analyserRef,
        model,
        retryModel,
        engine,
        interim,
        start,
        stop,
    } = useVoiceInput({ onResult: handleResult });
    const { voices, activeVoiceURI, chooseVoice, rate, setRate } = useNorwegianVoices();

    // Opt-in, cookie-less visit count; a no-op unless VITE_ANALYTICS_URL is set.
    useEffect(countVisit, []);

    // Celebrate a cleared stage.
    useEffect(() => {
        if (outcome !== 'completed') return;
        setShowConfetti(true);
        const timer = window.setTimeout(() => setShowConfetti(false), 3000);
        return () => window.clearTimeout(timer);
    }, [outcome]);

    const showResults = stage !== null && outcome !== null && summary !== null;
    const showPractice = stage !== null && outcome === null;
    const thisRun = runId && community.run.id === runId ? community.run : null;
    const runPoints = thisRun ? thisRun.points : 0;

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

            {showPractice && !showCommunity && (
                <AwardToast award={community.lastAward} onDone={community.clearAward} />
            )}

            <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-8 sm:py-12">
                <div className="w-full max-w-3xl">
                    {!supported ? (
                        <div className="flex justify-center">
                            <UnsupportedNotice />
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            {showCommunity ? (
                                <motion.div key="community" exit={{ opacity: 0, y: -12 }}>
                                    <CommunityScreen
                                        community={community}
                                        onBack={() => setShowCommunity(false)}
                                    />
                                </motion.div>
                            ) : showResults ? (
                                <motion.div key="results" exit={{ opacity: 0, y: -12 }}>
                                    <ResultsScreen
                                        stage={stage}
                                        outcome={outcome}
                                        summary={summary}
                                        profile={profile}
                                        pointsEarned={runPoints}
                                        pointsBreakdown={thisRun ? thisRun.lines : []}
                                        weeklyPoints={community.weekly}
                                        onOpenCommunity={() => setShowCommunity(true)}
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
                                        transcribing={transcribing}
                                        model={model}
                                        onRetryModel={retryModel}
                                        engine={engine}
                                        interim={interim}
                                        speechError={error}
                                        lastAttempt={lastAttempt}
                                        recordingUrl={recordingUrl}
                                        recordingAvailable={recordingAvailable}
                                        analyserRef={analyserRef}
                                        voices={voices}
                                        activeVoiceURI={activeVoiceURI}
                                        onChooseVoice={chooseVoice}
                                        dialect={dialect}
                                        onDialectChange={setDialect}
                                        dialectReady={dialectReady}
                                        lookup={lookup}
                                        onRemember={handleRemember}
                                        runPoints={runPoints}
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
                                    <StageSelect
                                        bests={bests}
                                        canDrillWeaknesses={weaknesses(profile).length > 0}
                                        weeklyPoints={community.weekly}
                                        streak={community.streak}
                                        onOpenCommunity={() => setShowCommunity(true)}
                                        onPick={begin}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}
                </div>
            </div>
        </>
    );
}
