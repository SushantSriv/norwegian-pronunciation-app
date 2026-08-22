import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { speakNorwegian, stopSpeaking } from '../utils/audioPlayback';

type Track = 'reference' | 'mine' | null;

interface Props {
    phrase: string;
    recordingUrl: string | null;
    voiceURI?: string;
}

/**
 * Side-by-side "this is how it should sound" / "this is what you said".
 * Hearing the two back to back is the point, so only one can play at a time.
 */
export function CompareAudio({ phrase, recordingUrl, voiceURI }: Props) {
    const [playing, setPlaying] = useState<Track>(null);
    const [slow, setSlow] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Stop any audio when the phrase changes or the card unmounts.
    useEffect(() => {
        return () => {
            stopSpeaking();
            audioRef.current?.pause();
        };
    }, [phrase]);

    const stopAll = () => {
        stopSpeaking();
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        setPlaying(null);
    };

    const playReference = async () => {
        if (playing === 'reference') return stopAll();
        stopAll();
        setPlaying('reference');
        await speakNorwegian(phrase, { voiceURI, rate: slow ? 0.65 : 1 });
        setPlaying(current => (current === 'reference' ? null : current));
    };

    const playMine = () => {
        if (!recordingUrl) return;
        if (playing === 'mine') return stopAll();
        stopAll();

        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.src = recordingUrl;
        audio.playbackRate = slow ? 0.65 : 1;
        audio.onended = () => setPlaying(null);
        audio.onerror = () => setPlaying(null);
        setPlaying('mine');
        void audio.play().catch(() => setPlaying(null));
    };

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Compare
                </span>
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
