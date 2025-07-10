import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    type CSSProperties
} from 'react';

import { motion, AnimatePresence } from 'framer-motion';



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

const THRESHOLDS: Record<Difficulty, number> = {
    Beginner: 0.35,
    Amateur: 0.2,
    Professional: 0.1
};
const SUCCESSES_NEEDED = 2;
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
    // -------------------- State --------------------
    const [level, setLevel] = useState(1);
    const [expected, setExpected] = useState('');
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
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
    const [zoomIndex, setZoomIndex] = useState<number>(-1); // which word to zoom

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
        setUploadStatus(null);
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
        if (blob.size === 0) {
            setProcessing(false);
            return;
        }
        setAudioURL(URL.createObjectURL(blob));
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;
        try {
            const form = new FormData();
            form.append('audio', blob, 'rec.webm');
            form.append('expected', expected);
            setUploadStatus('Laster opp…');
            const res = await fetch('http://localhost:8000/upload-audio/', { method: 'POST', body: form });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || res.statusText);
            setUploadStatus(null);
            setTranscript(data.transcript || '');
            setWerScore(data.wer);
            setSubs(data.substitutions);
            setDels(data.deletions);
            setIns(data.insertions);
        } catch (err) {
            console.error(err);
            setUploadStatus('Opplastingsfeil');
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

    // --------------------- Render helpers ----------
    const renderSentence = () =>
        words.map((w, i) => {
            const bad = errors.has(w.replace(/[?.!]/g, ''));
            return (
                <motion.span
                    key={i}
                    variants={wordVariants}
                    initial="hidden"
                    animate={i === zoomIndex ? 'zoom' : 'visible'}
                    transition={{ duration: 0.6 }}
                    onClick={() =>
                        tryPlay(
                            `/samples/${encodeURIComponent(currentDialect)}/${encodeURIComponent(
                                w.replace(/[?.!]/g, '')
                            )}.mp3`,
                            w
                        )
                    }
                    style={{
                        display: 'inline-block',      // ensure transform works
                        marginRight: '0.5rem',
                        cursor: 'pointer',
                        color: bad ? '#e57373' : '#64b5f6',
                        fontWeight: bad ? 'bold' : 'normal',
                        textDecoration: bad ? 'underline' : 'none'
                    }}
                >
                    {w}
                </motion.span>
            );
        });


    // --------------------------- JSX ---------------
    return (
        <div
            style={{
                position: 'relative',
                padding: '2rem',
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
        >
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


            {/* Header */}
            <h2 style={{ margin: 0, color: '#37474f' }}>Nivå {level}</h2>

            {/* Dialect & Mode selectors */}
            <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
                <div style={{ flex: 1 }}>
                    <label>Dialekt:</label>
                    <select
                        value={currentDialect}
                        onChange={e => onDialectChange(e.target.value)}
                        style={{ width: '100%' }}
                    >
                        {dialects.map(d => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <label>Mode:</label>
                    <select
                        value={difficulty}
                        onChange={e => setDifficulty(e.target.value as Difficulty)}
                        style={{ width: '100%' }}
                    >
                        <option value="Beginner">Beginner (≤35% WER)</option>
                        <option value="Amateur">Amateur (≤20% WER)</option>
                        <option value="Professional">Professional (≤10% WER)</option>
                    </select>
                </div>
            </div>

            {/* Hear correct */}
            <button
                onClick={() =>
                    tryPlay(
                        `/samples/${encodeURIComponent(currentDialect)}/${encodeURIComponent(
                            expected
                        )}.mp3`,
                        expected
                    )
                }
                style={{
                    background: '#ffa726',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '0.6rem 1rem',
                    cursor: 'pointer'
                }}
            >
                🔈 {text.hearCorrect}
            </button>

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
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '1rem',
                    cursor: processing || countdown !== null ? 'not-allowed' : 'pointer',
                    background: recording ? '#d32f2f' : '#388e3c',
                    color: '#fff'
                }}
            >
                {recording ? `🔴 ${text.stop}` : `🎙️ ${text.start}`}
            </button>

            {/* Playback rate */}
            <div style={{ margin: '1rem 0' }}>
                <label>Lyttehastighet:</label>
                <select
                    value={playbackRate}
                    onChange={e => setPlaybackRate(parseFloat(e.target.value))}
                >
                    <option value={0.75}>0.75×</option>
                    <option value={1}>1×</option>
                    <option value={1.25}>1.25×</option>
                    <option value={1.5}>1.5×</option>
                </select>
            </div>

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
                        background: '#f5f5f5',
                        borderRadius: 6,
                        padding: '0.75rem',
                        marginBottom: '1rem'
                    }}
                >
                    <div>
                        <strong>{text.wer}</strong> {(werScore * 100).toFixed(1)}%
                    </div>
                    <div>
                        <strong>{text.substitutions}</strong> {subs}
                    </div>
                    <div>
                        <strong>{text.deletions}</strong> {dels}
                    </div>
                    <div>
                        <strong>{text.insertions}</strong> {ins}
                    </div>
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
