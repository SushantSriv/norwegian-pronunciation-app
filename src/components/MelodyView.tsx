import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { PitchContour } from '../utils/pitch';
import { classifyAccent, scoreMelody, type MelodyScore } from '../utils/melodyScore';
import { ACCENT_HINT, ACCENT_LABEL, ACCENT_SHAPE, targetContour, type PitchAccent } from '../data/tonelag';
import { AccentBadge } from './AccentBadge';

interface Props {
    contour: PitchContour | null;
    analysing: boolean;
    recordingAvailable: boolean;
    /**
     * Expected pitch accent to draw as a target. Only meaningful for a single
     * word — a phrase has one accent per word, so the caller passes NONE there.
     */
    targetAccent?: PitchAccent;
    /** Whether the accent came from real data, a compound split, or our rules. */
    accentSource?: 'lexicon' | 'compound' | 'rule';
}

const WIDTH = 420;
const HEIGHT = 110;
const PAD = 10;

/**
 * Typical within-phrase pitch movement for Norwegian. Below this the delivery
 * reads as flat/monotone, which is the classic non-native giveaway; well above
 * it usually means the detector caught noise rather than real melody.
 */
const FLAT_BELOW = 3.5;
const LIVELY_ABOVE = 6;

/** Minimum half-range of the axis, so a steady voice does not look erratic. */
const MIN_HALF_RANGE = 5;

function verdict(range: number): { text: string; tone: string } {
    if (range < FLAT_BELOW) {
        return {
            text: 'Quite flat — Norwegian leans on melody far more than English. Try letting the pitch rise and fall.',
            tone: 'text-amber-300',
        };
    }
    if (range < LIVELY_ABOVE) {
        return {
            text: 'Good movement — this is roughly the melodic range Norwegian sits in.',
            tone: 'text-emerald-300',
        };
    }
    return { text: 'Very melodic. Lively is good, as long as it still sounds like speech.', tone: 'text-sky-300' };
}

/** How closely the melody tracked the target, in plain words. */
function matchVerdict(score: number): { text: string; tone: string } {
    if (score >= 65) {
        return { text: 'Melody shape matches the target closely.', tone: 'text-emerald-300' };
    }
    if (score >= 30) {
        return {
            text: 'The shape is roughly right — push the rise and fall further.',
            tone: 'text-amber-300',
        };
    }
    return {
        text: 'The shape is not there yet — this reads closer to a flat delivery than to the target.',
        tone: 'text-amber-300',
    };
}

/**
 * Both curves are drawn on one axis of semitones relative to the speaker's own
 * median, which pitch.ts has already normalised. Absolute pitch is meaningless
 * for comparison — a bass and a soprano saying the same word share a melodic
 * shape but no frequencies.
 */
function toY(semitones: number, halfRange: number): number {
    const usable = HEIGHT / 2 - PAD;
    return HEIGHT / 2 - (semitones / halfRange) * usable;
}

interface Plot {
    userPaths: string[];
    targetPath: string | null;
    halfRange: number;
}

function buildPlot(
    contour: PitchContour | null,
    targetAccent: PitchAccent | undefined,
    melody: MelodyScore | null
): Plot {
    const empty: Plot = { userPaths: [], targetPath: null, halfRange: MIN_HALF_RANGE };
    if (!contour?.points.length || contour.medianHz === null) return empty;

    const idealised = targetAccent ? targetContour(targetAccent) : [];

    // One axis wide enough for whichever of the two curves swings further.
    let extreme = MIN_HALF_RANGE;
    for (const p of contour.points) {
        if (p.semitones !== null) extreme = Math.max(extreme, Math.abs(p.semitones));
    }
    for (const p of idealised) extreme = Math.max(extreme, Math.abs(p.semitones));
    const halfRange = extreme * 1.1;

    const lastTime = contour.points[contour.points.length - 1]?.time || 1;
    const userPaths: string[] = [];
    let current: string[] = [];

    for (const point of contour.points) {
        if (point.semitones === null) {
            // Break the line across unvoiced gaps rather than inventing pitch.
            if (current.length > 1) userPaths.push(current.join(' '));
            current = [];
            continue;
        }
        const x = (point.time / lastTime) * WIDTH;
        const y = toY(point.semitones, halfRange);
        current.push(`${current.length ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    if (current.length > 1) userPaths.push(current.join(' '));

    // Prefer the DTW-aligned target. Drawn on the learner's own timeline it
    // shows what they should have been doing at each moment of THEIR delivery,
    // rather than an idealised shape stretched evenly across the clip that
    // lines up with nothing they actually said.
    const targetPoints = melody
        ? melody.alignedTarget.map(p => ({
              x: (p.time / lastTime) * WIDTH,
              y: toY(p.semitones, halfRange),
          }))
        : idealised.map(p => ({ x: p.t * WIDTH, y: toY(p.semitones, halfRange) }));

    const targetPath = targetPoints.length
        ? targetPoints.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        : null;

    return { userPaths, targetPath, halfRange };
}

export function MelodyView({
    contour,
    analysing,
    recordingAvailable,
    targetAccent,
    accentSource,
}: Props) {
    // Aligning the two contours is the expensive part (a 64x64 cost matrix),
    // and neither input changes between renders of a graded attempt.
    const melody = useMemo(
        () => scoreMelody(contour, targetAccent ?? 'NONE'),
        [contour, targetAccent]
    );
    // Which accent the delivery actually fits, regardless of which was asked
    // for. Naming the one they produced is far more useful than a number: it is
    // the difference between "72/100" and "you said the hands one".
    const produced = useMemo(() => classifyAccent(contour), [contour]);
    const { userPaths, targetPath } = buildPlot(contour, targetAccent, melody);
    const range = contour?.rangeSemitones ?? null;
    const showAccent = targetAccent && targetAccent !== 'NONE';
    const saidTheOtherOne =
        showAccent && produced?.clear === true && produced.accent !== targetAccent;

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

            {showAccent && (
                <div className="mb-3 rounded-lg border border-violet-400/20 bg-violet-400/10 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <AccentBadge accent={targetAccent} />
                        {accentSource && accentSource !== 'lexicon' && (
                            <span
                                className="text-[10px] font-semibold uppercase tracking-wide text-white/35"
                                title={
                                    accentSource === 'compound'
                                        ? 'Derived from the compound’s parts, not a lexicon entry for the whole word'
                                        : 'Derived from spelling rules, not the pronunciation lexicon'
                                }
                            >
                                {accentSource === 'compound' ? 'from parts' : 'estimated'}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/65">
                        {ACCENT_HINT[targetAccent]}
                    </p>
                </div>
            )}

            {analysing && <p className="py-6 text-center text-sm text-white/40">Reading your pitch…</p>}

            {!analysing && userPaths.length === 0 && (
                <p className="py-6 text-center text-sm text-white/40">
                    {recordingAvailable
                        ? 'Not enough clear voiced sound to read a pitch contour.'
                        : 'Needs your recorded audio, which this browser reserves for speech recognition.'}
                </p>
            )}

            {!analysing && userPaths.length > 0 && (
                <>
                    <svg
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        className="h-28 w-full"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={
                            showAccent
                                ? `Your pitch contour against the expected ${ACCENT_LABEL[targetAccent]} shape`
                                : 'Pitch contour of your recording'
                        }
                    >
                        <defs>
                            <linearGradient id="melody" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#38bdf8" />
                                <stop offset="100%" stopColor="#a78bfa" />
                            </linearGradient>
                        </defs>

                        {/* The speaker's own median: the line the melody moves around. */}
                        <line
                            x1={0}
                            x2={WIDTH}
                            y1={HEIGHT / 2}
                            y2={HEIGHT / 2}
                            stroke="rgba(255,255,255,0.14)"
                            strokeWidth={1}
                            strokeDasharray="3 4"
                        />

                        {targetPath && (
                            <motion.path
                                d={targetPath}
                                fill="none"
                                stroke="rgba(196,181,253,0.75)"
                                strokeWidth={2.5}
                                strokeDasharray="6 5"
                                strokeLinecap="round"
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 0.7, ease: 'easeOut' }}
                            />
                        )}

                        {userPaths.map((d, i) => (
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
                                transition={{ duration: 0.8, delay: 0.15 + i * 0.08, ease: 'easeOut' }}
                            />
                        ))}
                    </svg>

                    {targetPath && (
                        <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-white/40">
                            <span className="flex items-center gap-1.5">
                                <span className="inline-block h-0.5 w-4 rounded bg-sky-400" /> you
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span
                                    className="inline-block h-0.5 w-4 rounded"
                                    style={{
                                        backgroundImage:
                                            'repeating-linear-gradient(90deg,rgba(196,181,253,.9) 0 4px,transparent 4px 7px)',
                                    }}
                                />
                                target shape, time-aligned
                            </span>
                        </div>
                    )}

                    {saidTheOtherOne && (
                        <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                            You gave it <strong>{ACCENT_SHAPE[produced.accent]}</strong>. This word
                            needs <strong>{ACCENT_SHAPE[targetAccent]}</strong> —{' '}
                            {ACCENT_LABEL[targetAccent]}. {ACCENT_HINT[targetAccent]}
                        </p>
                    )}

                    {melody && (
                        <p className={`mt-2 text-sm ${matchVerdict(melody.score).tone}`}>
                            <strong className="tabular-nums">{melody.score}/100</strong> melody match —{' '}
                            {matchVerdict(melody.score).text}
                            <span className="ml-1 text-white/35">
                                ({melody.distance.toFixed(1)} semitones off once time-aligned)
                            </span>
                        </p>
                    )}

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
