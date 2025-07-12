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

// Enkle tekstvise råd for vanlige feilor
const adviceMap: Record<string, string> = {
    hei: "Si «hay» med åpen /æɪ/ – ikke hard ‘haj’.",
    takk: "Kort, hard /a/ og tydelig /k/ – ikke ‘tag’.",
    ja: "Lang åpen /ɑː/ – som «aah».",
    nei: "Diftong /æɪ/ – ikke ‘nai’.",
    mor: "Rull r-en svakt (eller skarre) og kort /u/.",
    far: "Lang /ɑː/ og tydelig r på slutten.",
    sol: "Rund leppene på lang /uː/.",
    hus: "Rund /ʉː/ (ikke engelsk /huːs/).",
    mat: "Lang vokal /ɑː/ – ikke like kort som i «Matt».",
    "god natt": "Husk stum d i «god» – uttales «go natt».",

    // Nivå 2–3 (vanlige funksjonsord)
    jeg: "Diftong /jæɪ/ – ikke «jegg».",
    du: "Rund /ʉː/ – trekk sammen leppene.",
    det: "Kort ‘e’; ikke uttal t-en tydelig.",
    ikke: "H-en er stum, si «ikke» /ɪkə/.",
    hva: "Uttales «va» – stum h.",
    hvor: "Rund /ʉ/ i midten, lett r til slutt.",
    når: "Åpen /oː/ + r – ikke ‘nårR’.",
    hvem: "Stum h, kort /vɛm/.",
    hvordan: "Trykk på første stavelse «HVOR-», stum d.",
    fordi: "Trykk på andre stavelse /diː/.",

    // Noen vanlige verb & substantiv (nivå 1-5)
    liker: "Lang i-lyd /liːkər/. Ikke ‘laiker’.",
    jobber: "Dobbel b → kort vokal «jobb-» + schwa-r.",
    leser: "Trykk på første stavelse «LE-ser».",
    prøver: "Ø-lyd /øː/ – rund leppene.",
    spiser: "Lang i /spiː-/ – ikke ‘spisser’.",
    drikker: "Kort i + dobbel k /ˈdrikːər/.",
    kaffe: "Åpen /ɑ/ i begge stavelser: /kɑfə/.",
    vann: "Kort a; dobbel n gir kort vokal.",
    bok: "Rund /uː/ – ikke ‘bok’ på engelsk.",
    film: "Kort i; final m uttales tydelig.",
    sofa: "Uttales /ˈsuːfa/ – trykk på første stavelse.",
    penger: "Bløt g («penn-jer»); ikke hard /g/.",

    // Flertall & småord
    oss: "Kort, åpen /ɔs/ – ikke «ås».",
    dere: "To stavelser «de-re», åpen e.",
    våre: "Åpen /oː/ i første stavelse.",
    mine: "Lang /iː/ – ‘mi-ne’, ikke «main».",
    dine: "Samme mønster som «mine».",

    // Tidsuttrykk
    morgen: "Uttales «mår-ren» /ˈmɔːrən/.",
    kveld: "Slutt-ld → retrofleks /ɭ/.",
    lørdag: "Ø-d-a: /ˈløːɖɑːg/ – ‘d’→retroflex.",
    mandag: "Nasal /ɑn-/ + retrofleks d.",
    torsdag: "‘rs’ → retrofleks /ʂ/ : «tåʂ-».",

    // Nivå 4-7 (noen typiske feil)
    vanskelig: "Trykk på første stavelse «VANS-kli», ikke *vanskelig*.",
    hyggelig: "Y-lyd /ʏ/ + retrofleks ‘gl’. «HY-g-li».",
    selvfølgelig: "Tre stavelser : «sel-FØL-ge-li».",
    trøtt: "Rund /ʈrøtː/ retrofleks t.",

    // Små høflighetsfraser
    "vær så snill": "R-s → retrofleks /ʂ/; si «værʂ snill».",
    "tusen takk": "Lang /uː/ i ‘tusen’; pause før ‘takk’.",
    sykehus: "To y-lyder /ˈʃyːkəhuːs/.",
    språk: "Åpen /oː/ + retrofleks k: /sprɔːk/.",
    går: "Lang å-lyd /goːr/.",
    år: "Samme vokal som i «går».",
    gjør: "Palatal j- + /øː/.",
    kjører: "Palatal ‘kj’ → /çøːrər/.",

    // Tips for noen “kj/sj”-minimalpar
    "kjære": "Tynn palatal /ç/ – ikke som «skjære».",
    "skjære": "Sj-lyd /ʂ/ – rundt bak i munnen.",

    // … fyll gjerne på videre etter behov …
};


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
        setUploadStatus(null);
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
            setBadIpa(
                data.bad_word
                    ? { expected: data.expected_ipa, heard: data.heard_ipa, wordIdx: data.word_index }
                    : null
            );
            setTooltipIdx(data.bad_word ? data.word_index : null);
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

            {badIpa && (
                <p style={{ marginTop: '0.5rem', fontSize: '1.1rem' }}>
                    <strong>Uttale-hint:</strong>&nbsp;
                    <span style={{ color: '#64b5f6' }}>{badIpa.expected}</span>&nbsp;→&nbsp;
                    <span style={{ color: '#e57373' }}>{badIpa.heard}</span>
                </p>
            )}

            {tooltipIdx !== null && (
                <div
                    style={{
                        margin: '1rem 0',
                        padding: '0.75rem',
                        background: '#fff8e1',
                        borderRadius: 4
                    }}
                >
                    <p style={{ margin: 0, fontWeight: 'bold' }}>
                        Tips for «{words[tooltipIdx].replace(/[?.!]/g, '')}»:
                    </p>
                    <p style={{ margin: '0.25rem 0 0' }}>
                        {adviceMap[words[tooltipIdx].replace(/[?.!]/g, '')] ||
                            'Prøv å uttale ordet saktere og tydelig.'}
                    </p>
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
