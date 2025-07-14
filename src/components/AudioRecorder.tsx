import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    type CSSProperties
} from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { getAdvice, getPhonemeHint } from '../utils/pronunciationHints';
import { tokenizeIPA } from '../utils/ipaTokenizer'



// At top of file, after your imports
const wordVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: { scale: 1, opacity: 1 },
    zoom: { scale: [1, 1.6, 1], opacity: [1, 1, 1] }
};

// -----------------------------------------------------------------------------
// Types & constants
// -----------------------------------------------------------------------------
interface Texts {
    title: string;
    languageLabel: string;
    start: string;
    stop: string;
    preview: string;
    expected: string;
    youSaid: string;
    wer: string;
    substitutions: string;
    deletions: string;
    insertions: string;
    errors: string;
    hearCorrect: string;
    success: (p: string) => string;
    tryAgain: string;
    nextSentence: string;
    countdown: string; // "Go!" label
}

type Difficulty = 'Beginner' | 'Amateur' | 'Professional';

interface Props {
    sentencePools: Record<string, string[]>; // { "1": [...], "2": [...], ... }
    text: Texts;
    dialects: string[];
    currentDialect: string;
    onDialectChange: (d: string) => void;
}

interface BadIpa {
    expected: string;   // IPA fra server: mɑːt
    heard: string;   // IPA fra server: hɛɪ
    wordIdx: number;   // hvilket ord i setningen
}

const THRESHOLDS: Record<Difficulty, number> = {
    Beginner: 0.35,
    Amateur: 0.2,
    Professional: 0.1
};
const SUCCESSES_NEEDED = 1;
const OVERLAY_DURATION = 3000;

// helper for per-word zoom duration
const WORD_ZOOM_MS = 600;



// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
const AudioRecorder: React.FC<Props> = ({
    sentencePools,
    text,
    dialects,
    currentDialect,
    onDialectChange
}) => {

    // ——— Ask for user name first —————————————————————————————
    const [userName, setUserName] = useState<string>('')
    const [askedName, setAskedName] = useState(false)

    // ——— Keep history of trials —————————————————————————————
    const [history, setHistory] = useState<{
        wer: number,
        badWord?: string
    }[]>([])

    // ——— “Finished?” state ———————————————————————————————
    const [finished, setFinished] = useState(false)


    // -------------------- State --------------------
    const [level, setLevel] = useState(1);
    const [expected, setExpected] = useState('');
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    const [uploadStatus] = useState<string | null>(null);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [difficulty, setDifficulty] = useState<Difficulty>('Beginner');
    const [transcript, setTranscript] = useState('');
    const [werScore, setWerScore] = useState<number | null>(null);
    const [subs, setSubs] = useState(0);
    const [dels, setDels] = useState(0);
    const [ins, setIns] = useState(0);
    const [errors, setErrors] = useState<Set<string>>(new Set());
    const [consecutive, setConsecutive] = useState(0);
    const [showConfetti, setShowConfetti] = useState(false);
    const [feedback, setFeedback] = useState<'success' | 'fail' | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [zoomIndex, setZoomIndex] = useState<number>(-1); 
    const [badIpa, setBadIpa] = useState<BadIpa | null>(null);
    const [tooltipIdx, setTooltipIdx] = useState<number | null>(null);
    
    // -------------------- Refs ---------------------
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    const zoomTimer = useRef<number | null>(null);

    // ------------------ Derived --------------------
    const currentPool = sentencePools[level.toString()] || sentencePools['1'];
    const threshold = THRESHOLDS[difficulty];
    const passed = werScore !== null && werScore <= threshold;
    const words = expected ? expected.split(/\s+/) : [];

    // ------------------ Callbacks ------------------
    const pickNewSentence = useCallback((pool: string[]) => {
        const next = pool[Math.floor(Math.random() * pool.length)];
        setExpected(next);
        setZoomIndex(-1);
        setTranscript('');
        setWerScore(null);
        setSubs(0);
        setDels(0);
        setIns(0);
        setErrors(new Set());
        setTooltipIdx(null);
        setFeedback(null);
    }, []);

    const advanceOrRepeat = useCallback(() => {
        if (consecutive + 1 >= SUCCESSES_NEEDED) {
            const nextLevel = Math.min(level + 1, Object.keys(sentencePools).length);
            setLevel(nextLevel);
            setConsecutive(0);
            pickNewSentence(sentencePools[nextLevel.toString()]);
        } else {
            setConsecutive(c => c + 1);
            pickNewSentence(currentPool);
        }
    }, [consecutive, level, sentencePools, pickNewSentence, currentPool]);

    // -------------------- Effects ------------------
    useEffect(() => {
        pickNewSentence(currentPool);
    }, [pickNewSentence, currentPool]);

    useEffect(() => {
        if (!transcript) { setErrors(new Set()); return; }
        const clean = (t: string) => t.replace(/[?.!]/g, '').trim().split(/\s+/);
        const err = new Set<string>();
        clean(expected).forEach((w, i) => clean(transcript)[i] !== w && err.add(w));
        setErrors(err);
    }, [transcript, expected]);

    useEffect(() => {
        if (werScore === null) return;
        setProcessing(false);
        if (passed) {
            setFeedback('success');
            setShowConfetti(true);
            const t = setTimeout(() => {
                setShowConfetti(false);
                setFeedback(null);
                advanceOrRepeat();
            }, OVERLAY_DURATION);
            return () => clearTimeout(t);
        }
        setFeedback('fail');
        const failTimer = setTimeout(() => setFeedback(null), 1000);
        return () => clearTimeout(failTimer);
    }, [werScore, passed, advanceOrRepeat]);

    // animate zoom on each word when recording starts
    useEffect(() => {
        if (!recording) {
            setZoomIndex(-1);
            if (zoomTimer.current !== null) window.clearInterval(zoomTimer.current);
            return;
        }
        // start zooming each word
        let idx = 0;
        setZoomIndex(0);
        zoomTimer.current = window.setInterval(() => {
            idx += 1;
            if (idx >= words.length) {
                window.clearInterval(zoomTimer.current!);
            } else {
                setZoomIndex(idx);
            }
        }, WORD_ZOOM_MS);
        return () => {
            if (zoomTimer.current !== null) window.clearInterval(zoomTimer.current);
        };
    }, [recording, expected, words.length]);




    // -------------------- Recorder -----------------
    const startRecordingInternal = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            audioChunks.current = [];
            mr.ondataavailable = e => e.data.size && audioChunks.current.push(e.data);
            mr.onstop = handleStop;
            mr.onerror = handleStop;
            mr.start();
            setRecording(true);
        } catch (err) {
            console.error(err);
            alert("⚠️ Mic access is required to record. Please enable microphone permission.");
            setRecording(false);
        }
    };

    const startRecording = () => {
        // ensure any existing stream closed
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            mediaRecorderRef.current = null;
        }
        // Kick off 3‑2‑1 countdown
        setCountdown(3);
        const tick = setInterval(() => {
            setCountdown(prev => {
                if (prev === null) { clearInterval(tick); return null; }
                if (prev <= 1) {
                    clearInterval(tick);
                    setCountdown(null);
                    startRecordingInternal();
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const stopRecording = () => {
        const mr = mediaRecorderRef.current;
        if (mr && mr.state === 'recording') mr.stop();
    };

    const handleStop = async () => {
        setRecording(false);
        setProcessing(true);
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        audioChunks.current = [];
        if (blob.size === 0) { setProcessing(false); return; }
        try {
            const form = new FormData();
            form.append('audio', blob, 'rec.webm');
            form.append('expected', expected);
            const res = await fetch('http://localhost:8000/upload-audio/', { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || res.statusText);
            setAudioURL(URL.createObjectURL(blob));
            // set states
            setBadIpa(
                data.bad_word
                    ? { expected: data.expected_ipa, heard: data.heard_ipa, wordIdx: data.word_index }
                    : null
            );
            setTooltipIdx(data.bad_word ? data.word_index : null);
            setTranscript(data.transcript || '');
            setWerScore(data.wer);
            setSubs(data.substitutions);
            setDels(data.deletions);
            setIns(data.insertions);

            // append history
            setHistory(h => [
                ...h,
                { wer: data.wer, badWord: data.bad_word ? data.bad_word : undefined }
            ]);
        } catch (err) {
            console.error(err);
        } finally {
            setProcessing(false);
        }
    };




    // -------------------- Playback helpers ---------
    const speakTTS = (str: string) => {
        if (!('speechSynthesis' in window)) return;
        const utt = new SpeechSynthesisUtterance(str);
        utt.lang = 'nb-NO';
        utt.rate = playbackRate;
        window.speechSynthesis.speak(utt);
    };

    const tryPlay = (url: string, fallback: string) => {
        const audio = new Audio(url);
        audio.playbackRate = playbackRate;
        audio.oncanplaythrough = () => audio.play();
        audio.onerror = () => speakTTS(fallback);
        audio.load();
    };

    // Summary memo
    const summary = React.useMemo(() => {
        if (!history.length) return null;
        const avgWer = history.reduce((s, t) => s + t.wer, 0) / history.length;
        const missed = history.filter(t => t.badWord).map(t => t.badWord!) as string[];
        const got = history.filter(t => !t.badWord).length;
        return {
            avgWer,
            total: history.length,
            goodCount: got,
            missedWords: Array.from(new Set(missed))
        };
    }, [history]);

    // Render: ask name
    if (!askedName) {
        return (
            <div style={{ padding: 20 }}>
                <h2>Welcome! What’s your name?</h2>
                <input
                    type="text"
                    value={userName}
                    onChange={e => setUserName(e.target.value)}
                    placeholder="Your name"
                    style={{ fontSize: '1.2rem', padding: '0.5rem' }}
                />
                <button
                    disabled={!userName.trim()}
                    onClick={() => setAskedName(true)}
                    style={{ marginLeft: 10, padding: '0.5rem 1rem' }}
                >
                    Start
                </button>
            </div>
        );
    }

    if (finished && summary) {
        return (
            <div
                style={{
                    maxWidth: 600,
                    margin: '2rem auto',
                    padding: '2rem',
                    background: '#fefefe',
                    borderRadius: 12,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
                }}
            >
                <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>
                    👏 Great job, <span style={{ color: '#1976d2' }}>{userName}</span>!
                </h2>
                <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    You completed <strong>{summary.total}</strong> sentences.
                </p>
                <p style={{ color: '#388e3c', marginBottom: '0.25rem' }}>
                    ✅ <strong>{summary.goodCount}</strong> correct pronunciations.
                </p>
                <p style={{ color: '#d32f2f', marginBottom: '0.25rem' }}>
                    ❌ Missed: {summary.missedWords.length > 0 ? summary.missedWords.join(', ') : 'None!'}
                </p>
                <p style={{ marginBottom: '1rem' }}>
                    📊 Average WER: <strong>{(summary.avgWer * 100).toFixed(1)}%</strong>
                </p>

                <h3 style={{ marginTop: '1.5rem' }}>🔁 Next steps</h3>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                    {summary.missedWords.map(w => (
                        <li key={w}>
                            <strong>{w}</strong>: {getAdvice(w) || 'Keep practicing.'}
                        </li>
                    ))}
                </ul>

                <button
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: '2rem',
                        background: '#1976d2',
                        color: '#fff',
                        padding: '0.75rem 1.5rem',
                        fontSize: '1rem',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer'
                    }}
                >
                    🔄 Start Over
                </button>
            </div>
        );
    }


    // --------------------- Render helpers ----------
    const renderSentence = () =>
        words.map((w, i) => {
            const cleanWord = w.replace(/[?.!]/g, '');
            const bad = errors.has(cleanWord);
            const badWord = badIpa?.wordIdx === i;

            return (
                <motion.span
                    key={i}
                    variants={wordVariants}
                    initial="hidden"
                    animate={i === zoomIndex ? 'zoom' : 'visible'}
                    transition={{ duration: 0.6 }}
                    onClick={() => {
                        if (badWord) {
                            // Vis råd/tooltip for dette ordet
                            setTooltipIdx(i);
                        } else {
                            // Spill av referanse-lyd
                            tryPlay(
                                `/samples/${encodeURIComponent(currentDialect)}/${encodeURIComponent(cleanWord)}.mp3`,
                                cleanWord
                            );
                        }
                    }}
                    style={{
                        display: 'inline-block',
                        marginRight: '0.5rem',
                        cursor: badWord ? 'pointer' : 'pointer',
                        textDecoration: bad ? 'underline' : 'none',
                        background: badWord ? '#ffebee' : 'transparent',
                        color: badWord ? '#e57373' : bad ? '#e57373' : '#64b5f6',
                        fontWeight: badWord ? 'bold' : bad ? 'bold' : 'normal',
                        padding: badWord ? '0 2px' : undefined,
                        borderRadius: badWord ? 2 : undefined
                    }}
                >
                    {w}
                </motion.span>
            );
        });


    

    // --------------------------- JSX ---------------
    return (
        <div className="relative p-6 bg-white rounded-lg shadow-lg">
            
            {/* Confetti */}
            {showConfetti &&
                Array.from({ length: 40 }).map((_, i) => (
                    <div
                        key={i}
                        className="confetti"
                        style={{ '--h': Math.random() * 360 } as CSSProperties}
                    />
                ))}

            {/* Countdown Overlay */}
            <AnimatePresence>
                {countdown !== null && (
                    <motion.div
                        key="countdown"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.4 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(255,255,255,0.9)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '4rem',
                            fontWeight: 700,
                            pointerEvents: 'none'
                        }}
                    >
                        {countdown === 0 ? text.countdown : countdown}
                    </motion.div>
                )}
            </AnimatePresence>


            {/* Feedback Overlay */}
            <AnimatePresence>
                {feedback && (
                    <motion.div
                        key="feedback"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(255,255,255,0.85)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.6rem',
                            pointerEvents: 'none'
                        }}
                    >
                        {feedback === 'success'
                            ? `🎉 ${text.success(((1 - (werScore || 0)) * 100).toFixed(0))}`
                            : `😅 ${text.tryAgain}`}
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{
                height: '8px',
                background: '#eee',
                borderRadius: 4,
                overflow: 'hidden',
                marginBottom: '1rem'
            }}>
                <div style={{
                    width: `${(level / Object.keys(sentencePools).length) * 100}%`,
                    background: '#4caf50',
                    height: '100%',
                    transition: 'width 0.4s'
                }} />
            </div>

            {/* Header: personalized greeting + level + finish */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, color: '#37474f' }}>Hello, {userName}! (Nivå {level})</h2>
                <button
                    onClick={() => setFinished(true)}
                    style={{
                        background: '#2196f3',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '0.5rem 1rem',
                        cursor: 'pointer'
                    }}
                >
                    Finish my exercise
                </button>
            </div>

            {/* Dialect & Mode selectors */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                marginBottom: '1.5rem'
            }}>
                <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Dialect</label>
                    <select
                        value={currentDialect}
                        onChange={e => onDialectChange(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: 6,
                            border: '1px solid #ccc',
                            fontSize: '1rem'
                        }}
                    >
                        {dialects.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Mode</label>
                    <select
                        value={difficulty}
                        onChange={e => setDifficulty(e.target.value as Difficulty)}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: 6,
                            border: '1px solid #ccc',
                            fontSize: '1rem'
                        }}
                    >
                        <option value="Beginner">Beginner (≤35% WER)</option>
                        <option value="Amateur">Amateur (≤20% WER)</option>
                        <option value="Professional">Professional (≤10% WER)</option>
                    </select>
                </div>
            </div>



            {/* Hear correct */}
            {/* ► Hear correct + playback rate (styled like button) */}
            <div style={{ marginTop: '1rem' }}>
                <button
                    onClick={() =>
                        tryPlay(
                            `/samples/${encodeURIComponent(currentDialect)}/${encodeURIComponent(expected)}.mp3`,
                            expected
                        )
                    }
                    style={{
                        background: '#ff9800',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.7rem 1.4rem',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                        transition: 'background 0.2s ease'
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
                    onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
                >
                    🔈 {text.hearCorrect}
                </button>

                {/* Styled select next to it */}
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginLeft: '1rem',
                        background: '#ffecb3',
                        padding: '0.6rem 1rem',
                        borderRadius: '6px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                        fontSize: '0.95rem',
                        fontWeight: 500
                    }}
                >
                    <span style={{ marginRight: '0.5rem' }}>Lyttehastighet:</span>
                    <select
                        value={playbackRate}
                        onChange={e => setPlaybackRate(parseFloat(e.target.value))}
                        style={{
                            padding: '0.3rem 0.5rem',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            fontSize: '0.95rem'
                        }}
                    >
                        <option value={0.75}>0.75× – Rolig</option>
                        <option value={1}>1× – Normal</option>
                        <option value={1.25}>1.25× – Rask</option>
                        <option value={1.5}>1.5× – Raskest</option>
                    </select>
                </div>
            </div>


            {/* Expected sentence (sentrert) */}
            <div
                style={{
                    margin: '1rem 0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center'
                }}
            >
                <strong>{text.expected}</strong>
                <div style={{ marginTop: '0.5rem' }}>
                    {renderSentence()}
                </div>
            </div>

            {/* Record button */}
            <button
                onClick={recording ? stopRecording : startRecording}
                disabled={processing || countdown !== null}
                style={{
                    width: '100%',
                    padding: '1rem',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    border: 'none',
                    borderRadius: '6px',
                    background: recording ? '#e53935' : '#43a047',
                    color: 'white',
                    transition: 'background 0.2s ease, transform 0.1s ease',
                    cursor: processing || countdown !== null ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
                {recording ? '🔴 Stop Recording' : '🎙️ Start Recording'}
            </button>


            


            {/* Audio preview */}
            {audioURL && (
                <div style={{ marginBottom: '1rem' }}>
                    <strong>{text.preview}</strong>
                    <audio src={audioURL} controls style={{ width: '100%' }} />
                </div>
            )}

            {/* Results */}
            {werScore !== null && (
                <div
                    style={{
                        background: '#ffffff',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        padding: '1rem',
                        marginTop: '1rem',
                        marginBottom: '1rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: '0.75rem',
                        fontSize: '0.95rem',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                    }}
                >
                    <div style={{ textAlign: 'center' }}>
                        <strong>{text.wer}</strong>
                        <div style={{ fontSize: '1.1rem', color: '#f44336' }}>
                            {(werScore * 100).toFixed(1)}%
                        </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <strong>{text.substitutions}</strong>
                        <div>{subs}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <strong>{text.deletions}</strong>
                        <div>{dels}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <strong>{text.insertions}</strong>
                        <div>{ins}</div>
                    </div>
                </div>
            )}


            {badIpa && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '1.5rem',
                        marginTop: '1.5rem',
                        padding: '1rem',
                        background: '#f9f9f9',
                        borderRadius: 8,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
                    }}
                >
                    {/* Expected phonemes */}
                    <div>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>✅ Forventet uttale</div>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.2rem', margin: 0 }}>
                            {tokenizeIPA(badIpa.expected).map((p, idx) => {
                                const hint = getPhonemeHint(p);
                                return (
                                    <li key={`expected-${idx}`}>
                                        <strong>{p}</strong>: {hint ?? '(ingen forklaring)'}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Heard phonemes */}
                    <div>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>🗣️ Du sa</div>
                        <ul style={{ listStyle: 'disc', paddingLeft: '1.2rem', margin: 0 }}>
                            {tokenizeIPA(badIpa.heard).map((p, idx) => {
                                const hint = getPhonemeHint(p);
                                return (
                                    <li key={`heard-${idx}`}>
                                        <strong>{p}</strong>: {hint ?? '(ingen forklaring)'}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}



            {tooltipIdx !== null && badIpa?.wordIdx === tooltipIdx && (
                <div
                    style={{
                        margin: '1.5rem 0',
                        padding: '1rem 1.25rem',
                        background: '#fffdf3',
                        borderLeft: '4px solid #ffd54f',
                        borderRadius: 6,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
                    }}
                >
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>
                        💡 Tips for <em>«{words[tooltipIdx].replace(/[?.!]/g, '')}»</em>:
                    </p>

                    <p style={{ marginTop: '0.5rem' }}>
                        {getAdvice(words[tooltipIdx].replace(/[?.!]/g, '')) ||
                            'Prøv å uttale ordet saktere og tydelig.'}
                    </p>

                    <ul style={{ marginTop: '0.75rem', paddingLeft: '1.2rem' }}>
                        {tokenizeIPA(badIpa.expected).map((p, idx) => {
                            const hint = getPhonemeHint(p);
                            return hint ? (
                                <li key={`tooltip-phoneme-${idx}`}>
                                    <strong>{p}</strong>: {hint}
                                </li>
                            ) : null;
                        })}
                    </ul>
                </div>
            )}




            {/* Error words */}
            {errors.size > 0 && (
                <p style={{ color: '#e57373' }}>
                    <strong>{text.errors}</strong> {[...errors].join(', ')}
                </p>
            )}

            {/* Upload status */}
            {uploadStatus && <p style={{ color: '#888' }}>{uploadStatus}</p>}
        </div>
    );
}
export default AudioRecorder;
