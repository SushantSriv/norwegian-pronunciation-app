import React, { useState, useRef, useEffect, CSSProperties } from 'react';

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
    Beginner: 0.50,
    Amateur: 0.35,
    Professional: 0.20
};
const SUCCESSES_NEEDED = 2;
const OVERLAY_DURATION = 3000;

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
    // -------------------------- State -----------------------------------------
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

    // -------------------------- Refs ------------------------------------------
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);

    // -------------------------- Derived ---------------------------------------
    const currentPool = sentencePools[level.toString()] || sentencePools['1'];
    const threshold = THRESHOLDS[difficulty];
    const passed = werScore !== null && werScore <= threshold;

    // -------------------------- Effects ---------------------------------------
    // Init: pick first sentence
    useEffect(() => {
        pickNewSentence(currentPool);
    }, []);

    // Highlight incorrect words
    useEffect(() => {
        if (!transcript) { setErrors(new Set()); return; }
        const clean = (t: string) => t.replace(/[?.!]/g, '').trim().split(/\s+/);
        const err = new Set<string>();
        clean(expected).forEach((w, i) => clean(transcript)[i] !== w && err.add(w));
        setErrors(err);
    }, [transcript, expected]);

    // Handle result overlay
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
        } else {
            setFeedback('fail');
        }
    }, [werScore]);

    // -------------------------- Helpers ---------------------------------------
    const pickNewSentence = (pool: string[]) => {
        const next = pool[Math.floor(Math.random() * pool.length)];
        setExpected(next);
        setTranscript('');
        setWerScore(null);
        setSubs(0);
        setDels(0);
        setIns(0);
        setErrors(new Set());
        setUploadStatus(null);
        setFeedback(null);
    };

    const advanceOrRepeat = () => {
        if (consecutive + 1 >= SUCCESSES_NEEDED) {
            const nextLevel = Math.min(level + 1, Object.keys(sentencePools).length);
            setLevel(nextLevel);
            setConsecutive(0);
            pickNewSentence(sentencePools[nextLevel.toString()]);
        } else {
            setConsecutive(c => c + 1);
            pickNewSentence(currentPool);
        }
    };

    const startRecording = async () => {
        setProcessing(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            audioChunks.current = [];
            mr.ondataavailable = e => e.data.size && audioChunks.current.push(e.data);
            mr.onstop = handleStop;
            mr.start();
            setRecording(true);
        } catch (err) {
            console.error(err);
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    };

    const handleStop = async () => {
        setProcessing(true);
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setAudioURL(URL.createObjectURL(blob));

        const form = new FormData();
        form.append('audio', blob, 'rec.webm');
        form.append('expected', expected);
        setUploadStatus('Laster opp…');
        try {
            const res = await fetch('http://localhost:8000/upload-audio/', { method: 'POST', body: form });
            const data = await res.json();
            setUploadStatus(null);
            setTranscript(data.transcript || '');
            setWerScore(data.wer);
            setSubs(data.substitutions);
            setDels(data.deletions);
            setIns(data.insertions);
        } catch {
            setUploadStatus('Opplastingsfeil');
            setProcessing(false);
        }
    };

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

    const renderSentence = () =>
        expected.split(/\s+/).map((w, i) => {
            const bad = errors.has(w.replace(/[?.!]/g, ''));
            return (
                <span
                    key={i}
                    onClick={() => tryPlay(`/samples/${encodeURIComponent(currentDialect)}/${encodeURIComponent(w.replace(/[?.!]/g, ''))}.mp3`, w)}
                    style={{
                        marginRight: '0.5rem',
                        cursor: 'pointer',
                        color: bad ? '#e57373' : '#64b5f6',
                        fontWeight: bad ? 'bold' : 'normal',
                        textDecoration: bad ? 'underline' : 'none'
                    }}
                >
                    {w}
                </span>
            );
        });

    // -------------------------- JSX -------------------------------------------
    return (
        <div style={{ position: 'relative', padding: '2rem', background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            {/* Confetti */}
            {showConfetti &&
                Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="confetti" style={{ '--h': Math.random() * 360 } as CSSProperties} />
                ))}

            {/* Overlay */}
            {feedback && (
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255,255,255,0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.6rem',
                    animation: 'fadeIn 0.4s',
                    pointerEvents: 'none'
                }}>
                    {feedback === 'success'
                        ? <>🎉 {text.success(((1 - (werScore || 0)) * 100).toFixed(0))}</>
                        : <>😅 {text.tryAgain}</>}
                </div>
            )}

            {/* Header */}
            <h2 style={{ margin: 0, color: '#37474f' }}>Nivå {level}</h2>

            {/* Dialect & Mode */}
            <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
                <div style={{ flex: 1 }}>
                    <label>Dialekt:</label>
                    <select value={currentDialect} onChange={e => onDialectChange(e.target.value)} style={{ width: '100%' }}>
                        {dialects.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: 1 }}>
                    <label>Mode:</label>
                    <select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} style={{ width: '100%' }}>
                        <option value="Beginner">Beginner (≤35% WER)</option>
                        <option value="Amateur">Amateur (≤20% WER)</option>
                        <option value="Professional">Professional (≤10% WER)</option>
                    </select>
                </div>
            </div>

            {/* Hear correct */}
            <button
                onClick={() => tryPlay(`/samples/${encodeURIComponent(currentDialect)}/${encodeURIComponent(expected)}.mp3`, expected)}
                style={{ background: '#ffa726', color: '#fff', border: 'none', borderRadius: 4, padding: '0.6rem 1rem', cursor: 'pointer' }}
            >
                🔈 {text.hearCorrect}
            </button>

            {/* Expected sentence / click words */}
            <div style={{ margin: '1rem 0' }}>
                <strong>{text.expected}</strong>
                <div style={{ marginTop: '0.5rem' }}>{renderSentence()}</div>
            </div>

            {/* Record button */}
            <button
                onClick={recording ? stopRecording : startRecording}
                disabled={processing}
                style={{
                    width: '100%',
                    padding: '1rem',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '1rem',
                    cursor: processing ? 'not-allowed' : 'pointer',
                    background: recording ? '#d32f2f' : '#388e3c',
                    color: '#fff',
                    position: 'relative'
                }}
            >
                {recording ? `🔴 ${text.stop}` : `🎙️ ${text.start}`}
            </button>

            {/* Playback rate */}
            <div style={{ margin: '1rem 0' }}>
                <label>Lyttehastighet: </label>
                <select value={playbackRate} onChange={e => setPlaybackRate(parseFloat(e.target.value))}>
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
                <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem' }}>
                    <div><strong>{text.wer}</strong> {(werScore * 100).toFixed(1)}%</div>
                    <div><strong>{text.substitutions}</strong> {subs}</div>
                    <div><strong>{text.deletions}</strong> {dels}</div>
                    <div><strong>{text.insertions}</strong> {ins}</div>
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
};

export default AudioRecorder;
