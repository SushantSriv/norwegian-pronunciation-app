import { motion } from 'framer-motion';

interface Props {
    /** 0-100 */
    score: number;
    /** Bar the score had to beat, drawn as a tick on the ring. */
    threshold?: number;
    size?: number;
    label?: string;
}

function toneFor(score: number, threshold: number) {
    if (score >= threshold) return { stroke: '#34d399', text: 'text-emerald-300' };
    if (score >= threshold - 15) return { stroke: '#fbbf24', text: 'text-amber-300' };
    return { stroke: '#fb7185', text: 'text-rose-300' };
}

export function ScoreRing({ score, threshold = 60, size = 132, label }: Props) {
    const stroke = 10;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, score));
    const tone = toneFor(clamped, threshold);

    // The threshold tick sits at the same angle the arc would reach at that value.
    const tickAngle = (threshold / 100) * 360 - 90;

    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth={stroke}
                />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={tone.stroke}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                />
            </svg>

            <div
                className="absolute h-3 w-0.5 bg-white/70"
                style={{
                    transform: `rotate(${tickAngle + 90}deg) translateY(-${radius + stroke / 2 + 5}px)`,
                }}
                aria-hidden="true"
            />

            <div className="absolute flex flex-col items-center">
                <motion.span
                    key={clamped}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`text-3xl font-extrabold tabular-nums ${tone.text}`}
                >
                    {clamped.toFixed(0)}
                </motion.span>
                {label && <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>}
            </div>
        </div>
    );
}
