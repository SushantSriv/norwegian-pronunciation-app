import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { extractPitch, type PitchContour } from '../utils/pitch';

interface Props {
    recordingUrl: string | null;
}

const WIDTH = 420;
const HEIGHT = 96;

/**
 * Typical within-phrase pitch movement for Norwegian. Below this the delivery
 * reads as flat/monotone, which is the classic non-native giveaway; well above
 * it usually means the detector caught noise rather than real melody.
 */
const FLAT_BELOW = 3.5;
const LIVELY_ABOVE = 6;

function verdict(range: number): { text: string; tone: string } {
    if (range < FLAT_BELOW) {
        return {
            text: 'Quite flat — Norwegian leans on melody far more than English. Try letting the pitch rise and fall.',
            tone: 'text-amber-300',
        };
    }
    if (range < LIVELY_ABOVE) {
        return { text: 'Good movement — this is roughly the melodic range Norwegian sits in.', tone: 'text-emerald-300' };
    }
    return { text: 'Very melodic. Lively is good, as long as it still sounds like speech.', tone: 'text-sky-300' };
}

/** Map the contour onto an SVG path, breaking the line across unvoiced gaps. */
function buildPaths(contour: PitchContour): string[] {
    const { points, minHz, maxHz } = contour;
    if (!points.length || minHz === null || maxHz === null) return [];

    const lastTime = points[points.length - 1]?.time || 1;
    // Pad the range so a steady pitch does not hug the edges.
    const lo = Math.log2(minHz) - 0.15;
    const hi = Math.log2(maxHz) + 0.15;
    const span = Math.max(hi - lo, 0.001);

    const paths: string[] = [];
    let current: string[] = [];

    for (const point of points) {
        if (point.hz === null) {
            if (current.length > 1) paths.push(current.join(' '));
            current = [];
            continue;
        }
        const x = (point.time / lastTime) * WIDTH;
        // Log scale: pitch is perceived geometrically, not linearly.
        const y = HEIGHT - ((Math.log2(point.hz) - lo) / span) * HEIGHT;
        current.push(`${current.length ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (current.length > 1) paths.push(current.join(' '));

    return paths;
}

export function MelodyView({ recordingUrl }: Props) {
    const [contour, setContour] = useState<PitchContour | null>(null);
    const [analysing, setAnalysing] = useState(false);

    useEffect(() => {
        if (!recordingUrl) {
            setContour(null);
            return;
        }
        let cancelled = false;
        setAnalysing(true);
        extractPitch(recordingUrl)
            .then(result => {
                if (!cancelled) setContour(result);
            })
            .catch(() => {
                if (!cancelled) setContour(null);
            })
            .finally(() => {
                if (!cancelled) setAnalysing(false);
            });
        return () => {
            cancelled = true;
        };
    }, [recordingUrl]);

    if (!recordingUrl) return null;

    const paths = contour ? buildPaths(contour) : [];
    const range = contour?.rangeSemitones ?? null;

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Your melody
                </span>
                {contour?.medianHz && (
                    <span className="text-xs tabular-nums text-white/40">
                        {contour.medianHz.toFixed(0)} Hz avg
                    </span>
                )}
            </div>

            {analysing && <p className="py-6 text-center text-sm text-white/40">Reading your pitch…</p>}

            {!analysing && paths.length === 0 && (
                <p className="py-6 text-center text-sm text-white/40">
                    Not enough clear voiced sound to read a pitch contour.
                </p>
            )}

            {!analysing && paths.length > 0 && (
                <>
                    <svg
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        className="h-24 w-full"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={
                            range
                                ? `Your pitch moved about ${range.toFixed(1)} semitones across the phrase`
                                : 'Pitch contour of your recording'
                        }
                    >
                        <defs>
                            <linearGradient id="melody" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#38bdf8" />
                                <stop offset="100%" stopColor="#a78bfa" />
                            </linearGradient>
                        </defs>

                        {/* Reference gridlines */}
                        {[0.25, 0.5, 0.75].map(fraction => (
                            <line
                                key={fraction}
                                x1={0}
                                x2={WIDTH}
                                y1={HEIGHT * fraction}
                                y2={HEIGHT * fraction}
                                stroke="rgba(255,255,255,0.08)"
                                strokeWidth={1}
                            />
                        ))}

                        {paths.map((d, i) => (
                            <motion.path
                                key={i}
                                d={d}
                                fill="none"
                                stroke="url(#melody)"
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 0.8, delay: i * 0.08, ease: 'easeOut' }}
                            />
                        ))}
                    </svg>

                    {range !== null && (
                        <p className={`mt-2 text-sm ${verdict(range).tone}`}>
                            <strong className="tabular-nums">{range.toFixed(1)} semitones</strong> of movement —{' '}
                            {verdict(range).text}
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
