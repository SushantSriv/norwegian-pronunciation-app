import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { speakNorwegian, stopSpeaking } from '../utils/audioPlayback';
import type { SpeechBounds } from '../utils/pitch';

type Track = 'reference' | 'mine' | null;

interface Props {
    phrase: string;
    recordingUrl: string | null;
    voiceURI?: string;
    /** The learner-chosen speaking rate; the slow toggle scales from it. */
    rate: number;
    /** Where speech actually starts/ends, so playback skips dead air. */
    bounds: SpeechBounds | null;
}

/**
 * Side-by-side "this is how it should sound" / "this is what you said".
 * Hearing the two back to back is the point, so only one plays at a time.
 */
export function CompareAudio({ phrase, recordingUrl, voiceURI, rate, bounds }: Props) {
    const [playing, setPlaying] = useState<Track>(null);
    const [slow, setSlow] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const stopAtRef = useRef<number | null>(null);

    // Stop any audio when the phrase changes or the card unmounts.
    useEffect(() => {
        return () => {
            stopSpeaking();
            audioRef.current?.pause();
        };
    }, [phrase]);

    const stopAll = () => {
        stopSpeaking();
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = bounds?.start ?? 0;
        }
        setPlaying(null);
    };

    const playReference = async () => {
        if (playing === 'reference') return stopAll();
        stopAll();
        setPlaying('reference');
        await speakNorwegian(phrase, { voiceURI, rate: slow ? rate * 0.7 : rate });
        setPlaying(current => (current === 'reference' ? null : current));
    };

    const playMine = () => {
        if (!recordingUrl) return;
        if (playing === 'mine') return stopAll();
        stopAll();

        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        if (audio.src !== recordingUrl) audio.src = recordingUrl;
        audio.playbackRate = slow ? 0.7 : 1;

        // Skip the pause before the learner started talking, and stop at the
        // point they finished, rather than playing the raw held-button clip.
        const from = bounds?.start ?? 0;
        stopAtRef.current = bounds?.end ?? null;

        audio.onended = () => setPlaying(null);
        audio.onerror = () => setPlaying(null);
        audio.ontimeupdate = () => {
            const stopAt = stopAtRef.current;
            if (stopAt !== null && audio.currentTime >= stopAt) {
                audio.pause();
                audio.currentTime = from;
                setPlaying(null);
            }
        };

        const begin = () => {
            try {
                audio.currentTime = from;
            } catch {
                // Seeking can throw if metadata is not ready yet; playing from
                // the top is an acceptable fallback.
            }
            setPlaying('mine');
            void audio.play().catch(() => setPlaying(null));
        };

        if (audio.readyState >= 1) begin();
        else audio.addEventListener('loadedmetadata', begin, { once: true });
    };

    const trimmed =
        bounds !== null && bounds.duration - (bounds.end - bounds.start) > 0.15;

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/45">Compare</span>
                <div className="flex items-center gap-1.5">
                    {trimmed && (
                        <span
                            className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/50"
                            title="Leading and trailing silence is skipped"
                        >
                            ✂ trimmed
                        </span>
                    )}
                    <button
                        onClick={() => setSlow(s => !s)}
                        aria-pressed={slow}
                        className={
                            slow
                                ? 'rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-200'
                                : 'rounded-full px-2.5 py-1 text-xs font-semibold text-white/50 hover:text-white/80'
                        }
                    >
                        🐢 Slow
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={playReference}
                    className={
                        playing === 'reference'
                            ? 'flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-emerald-400/30 px-3 py-2 text-sm font-bold text-emerald-100 ring-2 ring-emerald-300/60'
                            : 'flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-emerald-400/15 px-3 py-2 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/25'
                    }
                >
                    <span aria-hidden="true">{playing === 'reference' ? '⏹' : '🔊'}</span>
                    Correct
                </motion.button>

                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={playMine}
                    disabled={!recordingUrl}
                    className={
                        playing === 'mine'
                            ? 'flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-sky-400/30 px-3 py-2 text-sm font-bold text-sky-100 ring-2 ring-sky-300/60'
                            : 'flex min-h-[52px] items-center justify-center gap-2 rounded-lg bg-sky-400/15 px-3 py-2 text-sm font-bold text-sky-200 transition hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-40'
                    }
                >
                    <span aria-hidden="true">{playing === 'mine' ? '⏹' : '🎧'}</span>
                    {recordingUrl ? 'You' : 'No audio'}
                </motion.button>
            </div>
        </div>
    );
}
