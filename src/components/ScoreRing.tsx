import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
    /** 0-100 */
    score: number;
    /** Bar the score had to beat, drawn as a tick on the ring. */
    threshold?: number;
    size?: number;
    label?: string;
}

function toneFor(score: number, threshold: number) {
    if (score >= threshold) return { from: '#34d399', to: '#22d3ee', text: 'text-emerald-300' };
    if (score >= threshold - 15) return { from: '#fbbf24', to: '#fb923c', text: 'text-amber-300' };
    return { from: '#fb7185', to: '#f43f5e', text: 'text-rose-300' };
}

export function ScoreRing({ score, threshold = 60, size = 140, label }: Props) {
    const stroke = 11;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, score));
    const tone = toneFor(clamped, threshold);
    const gradientId = `ring-${tone.from.replace('#', '')}`;

    // Count the number up rather than snapping to it — the ring sweep and the
    // digits should feel like one motion.
    const counter = useMotionValue(0);
    const display = useTransform(counter, latest => Math.round(latest).toString());

    useEffect(() => {
        const controls = animate(counter, clamped, { duration: 0.9, ease: 'easeOut' });
        return () => controls.stop();
    }, [clamped, counter]);

    const tickAngle = (threshold / 100) * 360;

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90 overflow-visible">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={tone.from} />
                        <stop offset="100%" stopColor={tone.to} />
                    </linearGradient>
                </defs>

                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={stroke}
                />

                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={`url(#${gradientId})`}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    style={{ filter: `drop-shadow(0 0 6px ${tone.from}55)` }}
                />
            </svg>

            {/* Threshold marker sits at the angle the arc must reach to pass. */}
            <div
                className="absolute left-1/2 top-1/2 h-0 w-0"
                style={{ transform: `rotate(${tickAngle}deg)` }}
                aria-hidden="true"
            >
                <div
                    className="absolute h-2 w-2 rounded-full bg-white ring-2 ring-slate-900/70"
                    style={{ left: -4, top: -radius - stroke / 2 - 4 }}
                    title={"Pass mark: " + threshold}
                />
            </div>

            <div className="absolute flex flex-col items-center">
                <motion.span
                    className={`text-4xl font-extrabold tabular-nums ${tone.text}`}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                >
                    {display}
                </motion.span>
                {label && <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>}
            </div>
        </div>
    );
}
